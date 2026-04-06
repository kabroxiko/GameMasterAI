const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const GameState = require('../models/GameState');
const User = require('../models/User');
const { redactCampaignSpecForClient } = require('../campaignSpecDmSecrets');
const { ensurePlayerCharacterSheetDefaults } = require('../validatePlayerCharacter');
const { requireAuth, requireAuthSse } = require('../middleware/requireAuth');
const { attachSseClient } = require('../services/gameStateSseHub');
const { assertGameMember, sendAccessError, effectiveGameOwnerIdStr } = require('../services/gameAccess');
const { notifyGameStateUpdated } = require('../services/gameStateSseHub');
const {
  defaultParty,
  mergeParty,
  getParty,
  allMembersHaveValidSheets,
  allMembersReady,
  memberHasValidSheetForUserId,
  isLobbyParty,
  normalizeUserIdString,
  normalizeReadyUserIdsArray,
} = require('../services/partyLobbyState');
const { appendPlayerUserMessageWithPartyRound } = require('../gameStatePersist');
const { draftPartyExpiresAtFromNow, draftPartyTtlMs } = require('../services/draftPartyTtl');
const { hasSubstantiveCampaignSpec } = require('../campaignSpecReady');

function gameStateDocForClient(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (o.campaignSpec) o.campaignSpec = redactCampaignSpecForClient(o.campaignSpec);
  if (o.gameSetup && o.gameSetup.playerCharacters && typeof o.gameSetup.playerCharacters === 'object') {
    const lang = o.gameSetup.language || 'English';
    const nextPc = {};
    for (const k of Object.keys(o.gameSetup.playerCharacters)) {
      const c = o.gameSetup.playerCharacters[k];
      if (c && typeof c === 'object') nextPc[k] = ensurePlayerCharacterSheetDefaults(c, { language: lang });
    }
    o.gameSetup = { ...o.gameSetup, playerCharacters: nextPc };
  }
  if (o.gameSetup && typeof o.gameSetup === 'object') {
    o.gameSetup = { ...o.gameSetup };
    delete o.gameSetup.generatedCharacter;
  }
  return o;
}

/** Lightweight row for GET /mine (load-game list); avoids shipping full conversations per game. */
function gameStateSummaryForMineList(o, viewerUserIdStr) {
  if (!o || typeof o !== 'object') return null;
  const gameId = o.gameId != null ? String(o.gameId) : '';
  const spec = o.campaignSpec && typeof o.campaignSpec === 'object' && !Array.isArray(o.campaignSpec) ? o.campaignSpec : {};
  const title = typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : '';
  const gs = o.gameSetup && typeof o.gameSetup === 'object' ? o.gameSetup : {};
  const party = getParty(gs);
  const ownerStr = effectiveGameOwnerIdStr(o);
  const members = Array.isArray(o.memberUserIds) ? o.memberUserIds : [];
  const memberCount = members.length;
  const msgCount =
    typeof o.userAndAssistantMessageCount === 'number' && !Number.isNaN(o.userAndAssistantMessageCount)
      ? o.userAndAssistantMessageCount
      : 0;
  let createdAt = null;
  try {
    if (o._id != null && mongoose.Types.ObjectId.isValid(o._id)) {
      createdAt = new mongoose.Types.ObjectId(o._id).getTimestamp().toISOString();
    }
  } catch (e) {
    /* ignore */
  }
  return {
    gameId,
    campaignTitle: title,
    partyPhase: party.phase || 'lobby',
    language: gs.language && String(gs.language).trim() ? String(gs.language).trim() : 'English',
    memberCount,
    messageCount: msgCount,
    viewerIsOwner: ownerStr === String(viewerUserIdStr),
    hasCampaign: hasSubstantiveCampaignSpec(spec),
    createdAt,
  };
}

// Persistence is server-driven: POST /api/game-session/bootstrap-session (setup shell),
// POST /api/game-session/generate with a `persist` payload (each successful reply), and
// POST /api/game-state/append-player-message (party play: broadcast user line before /generate completes).

/**
 * SSE: lightweight push when GameState changes (multiplayer / other tabs). Client uses `access_token` query
 * because EventSource cannot always send Authorization. After each event, call GET /load to refresh.
 */
router.post('/append-player-message', requireAuth, async (req, res) => {
  try {
    const result = await appendPlayerUserMessageWithPartyRound(
      req.body && req.body.gameId,
      req.body || {},
      { userId: req.userId, req }
    );
    if (result && result.ok === false && result.statusCode) {
      return res.status(result.statusCode >= 400 ? result.statusCode : 502).json({
        error: result.error || 'Party round DM failed',
        code: result.code,
      });
    }
    return res.json(result);
  } catch (err) {
    if (err.code === 'GAME_ID_REQUIRED' || err.code === 'PLAYER_MESSAGE_CONTENT_REQUIRED') {
      return res.status(400).json({
        error: err.message || 'Bad request',
        code: err.code,
      });
    }
    if (err.status === 404) {
      return sendAccessError(res, err);
    }
    console.error('append-player-message failed:', err);
    return res.status(500).json({ error: 'Failed to append player message' });
  }
});

router.get('/events/:gameId', requireAuthSse, async (req, res) => {
  const { gameId } = req.params;
  const gid = gameId != null ? String(gameId).trim() : '';
  if (!gid) {
    return res.status(400).json({ error: 'gameId required', code: 'GAME_ID_REQUIRED' });
  }
  try {
    await assertGameMember(req.userId, gid);
  } catch (err) {
    return sendAccessError(res, err);
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  res.write(': ok\n\n');
  const detachInner = attachSseClient(gid, req.userId, res);
  let closed = false;
  const detach = () => {
    if (closed) return;
    closed = true;
    detachInner();
  };
  req.on('close', detach);
  res.on('close', detach);
});

router.get('/load/:gameId', requireAuth, async (req, res) => {
  const { gameId } = req.params;
  try {
    try {
      await assertGameMember(req.userId, gameId);
    } catch (err) {
      return sendAccessError(res, err);
    }
    let gameState = await GameState.findOne({ gameId });
    if (!gameState) {
      return res.status(404).json({ error: 'No game state found for this game', code: 'GAME_NOT_FOUND' });
    }
    // Drop stale ready flags when the server has no valid sheet for that user (fixes stuck party lobby).
    try {
      const lean0 = typeof gameState.toObject === 'function' ? gameState.toObject() : { ...gameState };
      if (isLobbyParty(lean0)) {
        const p0 = getParty(lean0.gameSetup);
        const curR = (p0.readyUserIds || []).map(String);
        const pruned = normalizeReadyUserIdsArray(
          curR.filter((id) => memberHasValidSheetForUserId(lean0, id))
        );
        const normalizedCur = normalizeReadyUserIdsArray(curR);
        const sameReady =
          pruned.length === normalizedCur.length && pruned.every((id) => normalizedCur.includes(id));
        if (!sameReady) {
          const healed = mergeParty(lean0.gameSetup, { readyUserIds: pruned });
          await GameState.updateOne({ gameId }, { $set: { gameSetup: healed } });
          try {
            notifyGameStateUpdated(gameId);
          } catch (e) {
            /* ignore */
          }
          gameState = await GameState.findOne({ gameId });
        }
      }
    } catch (healErr) {
      console.warn('load: party readyUserIds heal skipped:', healErr);
    }
    const o = gameStateDocForClient(gameState);
    const uid = String(req.userId);
    const m = Array.isArray(gameState.memberUserIds) ? gameState.memberUserIds.map((x) => String(x)) : [];
    let ownerStr = gameState.ownerUserId != null ? String(gameState.ownerUserId) : '';
    if (!ownerStr && m.length > 0) {
      ownerStr = m[0];
      o.ownerUserId = m[0];
    }
    if (ownerStr) {
      o.viewerIsGameOwner = ownerStr === uid;
    } else if (m.length === 0) {
      o.viewerIsGameOwner = true;
    } else {
      o.viewerIsGameOwner = m[0] === uid;
    }
    const idStrs = new Set();
    if (ownerStr) idStrs.add(ownerStr);
    for (const x of m) {
      if (x != null && String(x).trim() !== '') idStrs.add(String(x));
    }
    const oids = [];
    for (const s of idStrs) {
      try {
        oids.push(new mongoose.Types.ObjectId(s));
      } catch (_) {
        /* skip invalid */
      }
    }
    const memberNicknamesByUserId = {};
    if (oids.length > 0) {
      const users = await User.find({ _id: { $in: oids } })
        .select('_id nickname')
        .lean();
      for (const u of users) {
        const id = u._id != null ? String(u._id) : '';
        if (!id) continue;
        const nn = u.nickname != null && String(u.nickname).trim() ? String(u.nickname).trim() : '';
        memberNicknamesByUserId[id] = nn;
      }
    }
    o.memberNicknamesByUserId = memberNicknamesByUserId;
    res.json(o);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load game state' });
  }
});

router.get('/debug/:gameId/prompts', requireAuth, async (req, res) => {
  const { gameId } = req.params;
  try {
    try {
      await assertGameMember(req.userId, gameId);
    } catch (err) {
      return sendAccessError(res, err);
    }
    const gameState = await GameState.findOne({ gameId }).select(
      '+rawModelRequest +rawModelOutput +systemCore +llmCallError +llmFallbackError campaignSpec gameSetup'
    );
    if (!gameState) return res.status(404).json({ error: 'No game state found' });
    const debug = {
      rawModelRequest: gameState.rawModelRequest || null,
      rawModelOutput: gameState.rawModelOutput || null,
      systemCore: gameState.systemCore || null,
      campaignSpec: gameState.campaignSpec || null,
      gameSetup: gameState.gameSetup || null,
      diagnostics: {
        llmCallEnteredAt: gameState.llmCallEnteredAt || null,
        llmCallStartedAt: gameState.llmCallStartedAt || null,
        llmCallCompletedAt: gameState.llmCallCompletedAt || null,
        llmCallError: gameState.llmCallError || null,
        llmCallFallbackAt: gameState.llmCallFallbackAt || null,
        llmFallbackModel: gameState.llmFallbackModel || null,
        llmFallbackAttemptedAt: gameState.llmFallbackAttemptedAt || null,
        llmFallbackSucceededAt: gameState.llmFallbackSucceededAt || null,
        llmFallbackError: gameState.llmFallbackError || null,
        llmModelUsed: gameState.llmModelUsed || null,
      },
    };
    res.json(debug);
  } catch (err) {
    console.error('Failed to load debug prompts for gameId', gameId, err);
    res.status(500).json({ error: 'Failed to load debug data' });
  }
});

/** Games the current user owns or is a member of */
/** Empty party + lobby metadata; host runs campaign + opening when everyone is ready (see POST /api/game-session/start-party-adventure). */
router.post('/create-party', requireAuth, async (req, res) => {
  try {
    const language =
      req.body && req.body.language != null && String(req.body.language).trim()
        ? String(req.body.language).trim()
        : 'English';
    let uidOid;
    try {
      uidOid = new mongoose.Types.ObjectId(req.userId);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid session user id' });
    }
    const gameId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const gameSetup = mergeParty({ language }, defaultParty());
    const createPayload = {
      gameId,
      ownerUserId: uidOid,
      memberUserIds: [uidOid],
      gameSetup,
      conversation: [],
      summaryConversation: [],
      summary: '',
      totalTokenCount: 0,
      userAndAssistantMessageCount: 0,
    };
    if (draftPartyTtlMs() > 0) {
      const at = draftPartyExpiresAtFromNow();
      if (at) createPayload.draftPartyExpiresAt = at;
    }
    await GameState.create(createPayload);
    notifyGameStateUpdated(gameId);
    const created = await GameState.findOne({ gameId });
    res.status(201).json(gameStateDocForClient(created));
  } catch (err) {
    console.error('create-party failed:', err);
    res.status(500).json({ error: 'Could not create party' });
  }
});

router.post('/party-ready', requireAuth, async (req, res) => {
  try {
    const gameId = req.body && req.body.gameId != null ? String(req.body.gameId).trim() : '';
    if (!gameId) {
      return res.status(400).json({ error: 'gameId required', code: 'GAME_ID_REQUIRED' });
    }
    try {
      await assertGameMember(req.userId, gameId);
    } catch (err) {
      return sendAccessError(res, err);
    }
    const ready = req.body && (req.body.ready === true || req.body.ready === 'true');
    const uid = normalizeUserIdString(req.userId);
    const doc = await GameState.findOne({ gameId });
    if (!doc) {
      return res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
    }
    const leanForSheet =
      doc && typeof doc.toObject === 'function' ? doc.toObject() : doc && typeof doc === 'object' ? { ...doc } : doc;
    if (ready && !memberHasValidSheetForUserId(leanForSheet, uid)) {
      return res.status(400).json({
        error:
          'Your character must be saved on the server before you can mark ready. Finish character creation (generate) and try again.',
        code: 'PARTY_READY_NEEDS_CHARACTER',
      });
    }
    const party = getParty(doc.gameSetup);
    let readyUserIds = normalizeReadyUserIdsArray(party.readyUserIds || []);
    if (ready) {
      if (!readyUserIds.includes(uid)) readyUserIds.push(uid);
    } else {
      readyUserIds = readyUserIds.filter((x) => x !== uid);
    }
    const nextSetup = mergeParty(doc.gameSetup || {}, { readyUserIds });
    await GameState.updateOne({ gameId }, { $set: { gameSetup: nextSetup } });
    notifyGameStateUpdated(gameId);
    const fresh = await GameState.findOne({ gameId });
    const lean = fresh && typeof fresh.toObject === 'function' ? fresh.toObject() : { ...fresh };
    const partyNext = getParty(lean.gameSetup);
    res.json({
      ...gameStateDocForClient(fresh),
      partyReadyMeta: {
        allMembersHaveSheets: allMembersHaveValidSheets(lean),
        allMembersReady: allMembersReady(partyNext, lean),
        readyUserIds,
      },
    });
  } catch (err) {
    console.error('party-ready failed:', err);
    res.status(500).json({ error: 'Could not update ready state' });
  }
});

router.patch('/party-premise', requireAuth, async (req, res) => {
  try {
    const gameId = req.body && req.body.gameId != null ? String(req.body.gameId).trim() : '';
    if (!gameId) {
      return res.status(400).json({ error: 'gameId required', code: 'GAME_ID_REQUIRED' });
    }
    try {
      await assertGameMember(req.userId, gameId);
    } catch (err) {
      return sendAccessError(res, err);
    }
    const hostPremise =
      req.body && req.body.hostPremise != null ? String(req.body.hostPremise).slice(0, 8000) : '';
    const doc = await GameState.findOne({ gameId });
    if (!doc) {
      return res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
    }
    const ownerStr = effectiveGameOwnerIdStr(doc);
    if (!ownerStr || ownerStr !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the table owner can set the premise', code: 'NOT_GAME_OWNER' });
    }
    const nextSetup = mergeParty(doc.gameSetup || {}, { hostPremise });
    await GameState.updateOne({ gameId }, { $set: { gameSetup: nextSetup } });
    notifyGameStateUpdated(gameId);
    const fresh = await GameState.findOne({ gameId });
    res.json(gameStateDocForClient(fresh));
  } catch (err) {
    console.error('party-premise failed:', err);
    res.status(500).json({ error: 'Could not update premise' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    let uid;
    try {
      uid = new mongoose.Types.ObjectId(req.userId);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid session user id' });
    }
    const gameStates = await GameState.find({
      $or: [{ ownerUserId: uid }, { memberUserIds: uid }],
    })
      .sort({ _id: -1 })
      .limit(200)
      .lean();
    const list = Array.isArray(gameStates) ? gameStates : [];
    res.json(list.map((g) => gameStateSummaryForMineList(g, req.userId)).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load your games' });
  }
});

/** Host-only: permanently remove a game the current user owns. */
router.delete('/mine/:gameId', requireAuth, async (req, res) => {
  const gameId = req.params.gameId != null ? String(req.params.gameId).trim() : '';
  if (!gameId) {
    return res.status(400).json({ error: 'gameId required', code: 'GAME_ID_REQUIRED' });
  }
  try {
    const doc = await GameState.findOne({ gameId }).select('ownerUserId gameId').lean();
    if (!doc) {
      return res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
    }
    const ownerStr = effectiveGameOwnerIdStr(doc);
    if (!ownerStr || ownerStr !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the host can delete this game', code: 'NOT_GAME_OWNER' });
    }
    await GameState.deleteOne({ gameId });
    try {
      notifyGameStateUpdated(gameId);
    } catch (e) {
      /* ignore */
    }
    return res.json({ ok: true, deleted: true, gameId });
  } catch (err) {
    console.error('delete mine game failed:', err);
    return res.status(500).json({ error: 'Failed to delete game' });
  }
});

module.exports = router;
