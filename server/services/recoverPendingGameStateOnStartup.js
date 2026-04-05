/**
 * After Mongo connects: unblock clients and optionally finish interrupted party-round DM work.
 *
 * 1) Stale `llmCallStartedAt` without a completed stamp (or started > completed) → set `llmCallCompletedAt`
 *    so GET /load stops reporting an in-flight DM forever.
 * 2) Party games where every required member is in `partySubmittedUserIds` but the conversation still
 *    ends on a `user` message (crash during handleDmGenerate / persist) → re-run DM once; on failure,
 *    clear `partySubmittedUserIds` so the table can resubmit.
 */

const GameState = require('../models/GameState');
const { canonicalMemberIdStrings } = require('./partyLobbyState');
const { notifyGameStateUpdated } = require('./gameStateSseHub');

function requiredPartyMemberIdStringsFromDoc(doc) {
  return [...new Set(canonicalMemberIdStrings(doc).map((x) => String(x)))].filter(Boolean).sort();
}

function isMultiMemberPartyDoc(doc) {
  return requiredPartyMemberIdStringsFromDoc(doc).length >= 2;
}

function isStuckPartyRoundAwaitingDm(doc) {
  if (!doc || !isMultiMemberPartyDoc(doc)) return false;
  const gs0 = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const ph = gs0.party && gs0.party.phase ? String(gs0.party.phase) : '';
  if (ph === 'lobby' || ph === 'starting') return false;

  const conv = Array.isArray(doc.conversation) ? doc.conversation : [];
  if (conv.length === 0) return false;
  const last = conv[conv.length - 1];
  if (!last || last.role !== 'user') return false;
  const gs = gs0;
  const submitted = Array.isArray(gs.partySubmittedUserIds) ? gs.partySubmittedUserIds.map(String) : [];
  const required = requiredPartyMemberIdStringsFromDoc(doc);
  if (required.length < 2) return false;
  if (!required.every((id) => submitted.includes(id))) return false;
  return true;
}

async function clearStaleLlmInFlightFlags() {
  const docs = await GameState.find({
    llmCallStartedAt: { $nin: [null, ''] },
  })
    .select('gameId llmCallStartedAt llmCallCompletedAt')
    .lean();

  let cleared = 0;
  for (const doc of docs) {
    const ts = Date.parse(String(doc.llmCallStartedAt));
    if (Number.isNaN(ts)) continue;
    const tcRaw = doc.llmCallCompletedAt != null ? String(doc.llmCallCompletedAt) : '';
    const tc = tcRaw ? Date.parse(tcRaw) : NaN;
    if (!Number.isNaN(tc) && tc >= ts) continue;

    await GameState.updateOne(
      { gameId: doc.gameId },
      { $set: { llmCallCompletedAt: new Date().toISOString() } }
    );
    cleared += 1;
  }
  if (cleared > 0) {
    console.log(
      `recoverPendingGameStateOnStartup: cleared ${cleared} stale llm in-flight flag(s) (llmCallCompletedAt)`
    );
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPartyDmResume(gameId, requestingUserId) {
  const gid = String(gameId || '').trim();
  const uid = String(requestingUserId || '').trim();
  if (!gid || !uid) return false;

  const fresh = await GameState.findOne({ gameId: gid }).lean();
  if (!fresh) return false;

  const last = Array.isArray(fresh.conversation) && fresh.conversation.length > 0
    ? fresh.conversation[fresh.conversation.length - 1]
    : null;
  if (last && last.role === 'assistant') {
    return true;
  }
  if (!isStuckPartyRoundAwaitingDm(fresh)) {
    return false;
  }

  const lang = (fresh.gameSetup && fresh.gameSetup.language) || 'English';
  const messagesForModel = (fresh.conversation || []).filter((m) => m && m.role !== 'system');

  const persistPayload = {
    gameId: gid,
    gameSetup: fresh.gameSetup || {},
    conversation: fresh.conversation || [],
    summaryConversation: fresh.summaryConversation || [],
    summary: fresh.summary || '',
    totalTokenCount: fresh.totalTokenCount || 0,
    userAndAssistantMessageCount: fresh.userAndAssistantMessageCount || 0,
    systemMessageContentDM: fresh.systemMessageContentDM || '',
    encounterState: fresh.encounterState,
    mode: fresh.mode,
    requestingUserId: uid,
  };

  const mockRes = {
    statusCode: 200,
    _json: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(obj) {
      this._json = obj;
    },
  };

  const mockReq = {
    body: {
      messages: messagesForModel,
      mode: fresh.mode || 'exploration',
      language: lang,
      gameId: gid,
      persist: persistPayload,
      requestingUserId: uid,
    },
    userId: uid,
    socket: undefined,
  };

  const gameSessionRouter = require('../routes/gameSession');
  if (typeof gameSessionRouter.handleDmGenerate !== 'function') {
    console.warn('recoverPendingGameStateOnStartup: handleDmGenerate missing');
    return false;
  }
  gameSessionRouter.setLongRequestSocketTimeout(mockReq);

  try {
    await gameSessionRouter.handleDmGenerate(mockReq, mockRes);
  } catch (e) {
    console.warn(`recoverPendingGameStateOnStartup: handleDmGenerate threw for ${gid}:`, e);
  }

  try {
    notifyGameStateUpdated(gid);
  } catch (e) {
    /* ignore */
  }

  if (mockRes.statusCode === 200 && mockRes._json && typeof mockRes._json === 'object') {
    return true;
  }

  const gs = { ...(fresh.gameSetup && typeof fresh.gameSetup === 'object' ? fresh.gameSetup : {}) };
  delete gs.partySubmittedUserIds;
  await GameState.updateOne({ gameId: gid }, { $set: { gameSetup: gs } });
  try {
    notifyGameStateUpdated(gid);
  } catch (e) {
    /* ignore */
  }
  console.warn(
    `recoverPendingGameStateOnStartup: party DM resume failed for ${gid}; cleared partySubmittedUserIds so players can resubmit`
  );
  return false;
}

async function resumeStuckPartyDmRounds() {
  const candidates = await GameState.find({
    'gameSetup.partySubmittedUserIds.1': { $exists: true },
  })
    .select('gameId conversation gameSetup ownerUserId memberUserIds mode')
    .lean();

  let attempted = 0;
  let succeeded = 0;
  for (const doc of candidates) {
    if (!isStuckPartyRoundAwaitingDm(doc)) continue;
    const last = doc.conversation[doc.conversation.length - 1];
    const required = requiredPartyMemberIdStringsFromDoc(doc);
    const uid = String((last && last.userId) || required[0] || '').trim();
    if (!uid) continue;

    attempted += 1;
    const ok = await runPartyDmResume(doc.gameId, uid);
    if (ok) succeeded += 1;
    await sleep(Math.max(0, parseInt(process.env.DM_STARTUP_RESUME_DELAY_MS || '750', 10) || 750));
  }
  if (attempted > 0) {
    console.log(
      `recoverPendingGameStateOnStartup: party DM resume attempted=${attempted} succeeded=${succeeded}`
    );
  }
}

async function recoverPendingGameStateOnStartup() {
  if (String(process.env.DM_STARTUP_RECOVER_PENDING || 'true').toLowerCase() === 'false') {
    console.log('recoverPendingGameStateOnStartup: disabled (DM_STARTUP_RECOVER_PENDING=false)');
    return;
  }

  await clearStaleLlmInFlightFlags();

  if (String(process.env.DM_STARTUP_RESUME_PARTY_DM || 'true').toLowerCase() === 'false') {
    console.log('recoverPendingGameStateOnStartup: party DM resume skipped (DM_STARTUP_RESUME_PARTY_DM=false)');
    return;
  }

  await resumeStuckPartyDmRounds();
}

module.exports = { recoverPendingGameStateOnStartup };
