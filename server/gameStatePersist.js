const GameState = require('./models/GameState');
const { mergeCampaignSpecPreservingDmSecrets } = require('./campaignSpecDmSecrets');
const {
  normalizeCoinageObject,
  ensurePlayerCharacterSheetDefaults,
  validateGeneratedPlayerCharacter,
} = require('./validatePlayerCharacter');
const { assertGameMember, toObjectId, effectiveGameOwnerIdStr } = require('./services/gameAccess');
const { mergePlayerCharacters, characterDisplayNameForUser } = require('./playerCharacterHelpers');
const { hasSubstantiveCampaignSpec } = require('./campaignSpecReady');
const { validateDistinctEntityNames } = require('./validateEntityNameUniqueness');
const { mergeParty, canonicalMemberIdStrings, getParty } = require('./services/partyLobbyState');
const { draftPartyExpiresAtFromNow, draftPartyTtlMs } = require('./services/draftPartyTtl');

function normalizeConversationUserDisplayNames(conversation, gameSetup, fallbackUserId) {
  if (!Array.isArray(conversation)) return conversation;
  const fb = fallbackUserId && String(fallbackUserId).trim();
  return conversation.map((m) => {
    if (!m || m.role !== 'user') return m;
    const uid = (m.userId && String(m.userId).trim()) || fb || '';
    if (!uid) return m;
    const auth = characterDisplayNameForUser(gameSetup, uid);
    if (auth) return { ...m, displayName: auth };
    return m;
  });
}

/**
 * Upsert full play snapshot (conversation, setup, counters, encounter). Used only from server routes — not exposed as /save.
 * @param {object} body
 * @param {{ userId: string }} options
 */
async function persistGameStateFromBody(body, options = {}) {
  const userId = options.userId;
  if (!userId || typeof userId !== 'string') {
    throw new Error('persistGameStateFromBody: userId is required');
  }
  const gameId = body && body.gameId;
  if (!gameId) {
    throw new Error('persistGameStateFromBody: gameId is required');
  }

  const existingFull = await GameState.findOne({ gameId });
  const uidOid = toObjectId(userId);

  if (existingFull) {
    await assertGameMember(userId, gameId);
  } else if (uidOid) {
    // New game: caller must be creating; set ownership on insert via $setOnInsert in update - mongoose findOneAndUpdate
  }

  const lang =
    (body.gameSetup && body.gameSetup.language) ||
    (existingFull && existingFull.gameSetup && existingFull.gameSetup.language) ||
    'English';

  const incomingSetupRaw = body.gameSetup && typeof body.gameSetup === 'object' ? body.gameSetup : {};
  const ownerEff = effectiveGameOwnerIdStr(existingFull);
  const uidS = String(userId);

  // Non-owner snapshots may carry the full `playerCharacters` map from the client; only merge this user's row.
  let incomingSetup = incomingSetupRaw;
  if (existingFull && ownerEff && uidS !== ownerEff) {
    const map = incomingSetup.playerCharacters;
    const nextPc = {};
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const k of Object.keys(map)) {
        if (String(k) === uidS && map[k] && typeof map[k] === 'object') {
          nextPc[k] = map[k];
        }
      }
    }
    incomingSetup = { ...incomingSetup, playerCharacters: nextPc };
  }

  let gameSetup = mergePlayerCharacters(existingFull && existingFull.gameSetup, incomingSetup, lang);
  delete gameSetup.generatedCharacter;

  const incomingPc =
    incomingSetup && incomingSetup.playerCharacters && typeof incomingSetup.playerCharacters === 'object'
      ? incomingSetup.playerCharacters
      : null;
  if (incomingPc && !Array.isArray(incomingPc) && gameSetup.playerCharacters && typeof gameSetup.playerCharacters === 'object') {
    for (const k of Object.keys(incomingPc)) {
      let sheet = gameSetup.playerCharacters[k];
      if (!sheet || typeof sheet !== 'object') continue;
      sheet = ensurePlayerCharacterSheetDefaults(sheet, { language: lang });
      gameSetup.playerCharacters[k] = sheet;
      const check = validateGeneratedPlayerCharacter(sheet);
      if (!check.ok) {
        const err = new Error(check.error || 'Invalid player character sheet');
        err.code = 'INVALID_PLAYER_CHARACTER_PERSIST';
        err.userIdKey = k;
        throw err;
      }
    }
  }

  if (options.clearPendingNarrativeIntroductions === true) {
    const prevPending = existingFull
      ? (getParty(existingFull.gameSetup).pendingNarrativeIntroductionUserIds || []).map(String)
      : [];
    const introducedSet = new Set((getParty(gameSetup).narrativeIntroducedUserIds || []).map(String));
    for (const id of prevPending) introducedSet.add(id);
    gameSetup = mergeParty(gameSetup, {
      pendingNarrativeIntroductionUserIds: [],
      narrativeIntroducedUserIds: [...introducedSet].filter(Boolean),
    });
  }

  const conversationStored = normalizeConversationUserDisplayNames(
    body.conversation,
    gameSetup,
    userId
  );

  const update = {
    gameId,
    gameSetup,
    conversation: conversationStored,
    summaryConversation: body.summaryConversation,
    summary: body.summary,
    totalTokenCount: body.totalTokenCount,
    userAndAssistantMessageCount: body.userAndAssistantMessageCount,
    systemMessageContentDM: body.systemMessageContentDM,
  };

  if (body.campaignSpec !== undefined) {
    const existing = await GameState.findOne({ gameId }).select('campaignSpec').lean();
    update.campaignSpec = mergeCampaignSpecPreservingDmSecrets(existing && existing.campaignSpec, body.campaignSpec);
  }
  if (body.mode != null && body.mode !== '') {
    update.mode = body.mode;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'encounterState')) {
    update.encounterState = body.encounterState;
  }

  const nextCampaignSpec =
    body.campaignSpec !== undefined ? update.campaignSpec : existingFull && existingFull.campaignSpec;
  const nextEncounter = Object.prototype.hasOwnProperty.call(body, 'encounterState')
    ? update.encounterState
    : existingFull && existingFull.encounterState;

  const nameCheck = validateDistinctEntityNames({
    gameSetup,
    campaignSpec: nextCampaignSpec,
    encounterState: nextEncounter,
  });
  if (!nameCheck.ok) {
    const err = new Error(nameCheck.error);
    err.code = nameCheck.code;
    err.httpStatus = 422;
    throw err;
  }

  let setOnInsert = {};
  if (!existingFull && uidOid) {
    setOnInsert = {
      ownerUserId: uidOid,
      memberUserIds: [uidOid],
    };
    if (draftPartyTtlMs() > 0 && !hasSubstantiveCampaignSpec(nextCampaignSpec)) {
      const at = draftPartyExpiresAtFromNow();
      if (at) setOnInsert.draftPartyExpiresAt = at;
    }
  }

  const mongoUpdate = { $set: update };
  if (Object.keys(setOnInsert).length) {
    mongoUpdate.$setOnInsert = setOnInsert;
  }
  if (update.campaignSpec !== undefined && hasSubstantiveCampaignSpec(update.campaignSpec)) {
    mongoUpdate.$unset = { draftPartyExpiresAt: 1 };
  }

  const gameState = await GameState.findOneAndUpdate({ gameId }, mongoUpdate, { new: true, upsert: true });

  try {
    const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
    notifyGameStateUpdated(gameId);
  } catch (e) {
    /* ignore SSE notify errors */
  }

  try {
    const { maybeTriggerSummaryAfterSave } = require('./summaryWorker');
    setImmediate(() => {
      maybeTriggerSummaryAfterSave(gameId, gameState).catch((err) =>
        console.warn('maybeTriggerSummaryAfterSave error', err)
      );
    });
  } catch (e) {
    console.warn('Failed to schedule conditional summary after persist:', e);
  }

  return gameState;
}

/**
 * Append one player user line to stored conversation and notify SSE (multiplayer: others see the line before /generate returns).
 * Idempotent if the last stored message is already the same user+content.
 * @param {string} gameId
 * @param {{ content?: string, displayName?: string }} body
 * @param {{ userId: string }} options
 */
async function appendPlayerUserMessageForBroadcast(gameId, body, { userId } = {}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('appendPlayerUserMessageForBroadcast: userId is required');
  }
  const gid = gameId != null ? String(gameId).trim() : '';
  if (!gid) {
    const err = new Error('gameId is required');
    err.code = 'GAME_ID_REQUIRED';
    throw err;
  }
  const content =
    body && typeof body.content === 'string' ? String(body.content).trim() : '';
  if (!content) {
    const err = new Error('content is required');
    err.code = 'PLAYER_MESSAGE_CONTENT_REQUIRED';
    throw err;
  }

  await assertGameMember(userId, gid);

  const doc = await GameState.findOne({ gameId: gid });
  if (!doc) {
    const err = new Error('Game not found');
    err.status = 404;
    throw err;
  }

  const uidStr = String(userId);
  const gameSetup = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const fromSheet = characterDisplayNameForUser(gameSetup, uidStr);
  const hint =
    body && body.displayName != null && String(body.displayName).trim()
      ? String(body.displayName).trim()
      : '';

  const userMessage = {
    role: 'user',
    content,
    userId: uidStr,
  };
  if (fromSheet) userMessage.displayName = fromSheet;
  else if (hint) userMessage.displayName = hint;

  const conv = Array.isArray(doc.conversation) ? [...doc.conversation] : [];
  const last = conv[conv.length - 1];
  if (
    last &&
    last.role === 'user' &&
    last.content === content &&
    String(last.userId || '') === uidStr
  ) {
    try {
      const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
      notifyGameStateUpdated(gid);
    } catch (e) {
      /* ignore */
    }
    return { ok: true, duplicate: true };
  }

  conv.push(userMessage);
  const sumConv = Array.isArray(doc.summaryConversation) ? [...doc.summaryConversation] : [];
  sumConv.push({ ...userMessage });

  const conversationStored = normalizeConversationUserDisplayNames(conv, gameSetup, userId);
  const summaryStored = normalizeConversationUserDisplayNames(sumConv, gameSetup, userId);
  const extraTokens = Math.max(0, Math.ceil(content.length / 4));

  await GameState.findOneAndUpdate(
    { gameId: gid },
    {
      $set: {
        conversation: conversationStored,
        summaryConversation: summaryStored,
        totalTokenCount: (doc.totalTokenCount || 0) + extraTokens,
      },
    },
    { new: true }
  );

  try {
    const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
    notifyGameStateUpdated(gid);
  } catch (e) {
    /* ignore */
  }

  return { ok: true, duplicate: false };
}

function lastAssistantIndexInConversation(conv) {
  if (!Array.isArray(conv)) return -1;
  for (let i = conv.length - 1; i >= 0; i--) {
    if (conv[i] && conv[i].role === 'assistant') return i;
  }
  return -1;
}

/** Same membership as lobby helpers: owner ∪ memberUserIds (not memberUserIds alone). */
function requiredPartyMemberIdStrings(doc) {
  return [...new Set(canonicalMemberIdStrings(doc).map((x) => String(x)))].filter(Boolean).sort();
}

function isMultiMemberParty(doc) {
  return requiredPartyMemberIdStrings(doc).length >= 2;
}

/**
 * Pop trailing user lines from uidStr after the last assistant (same player replacing their action this round).
 */
function stripTrailingUserTailForUid(conv, sumConv, uidStr) {
  const la = lastAssistantIndexInConversation(conv);
  const c = Array.isArray(conv) ? [...conv] : [];
  const s = Array.isArray(sumConv) ? [...sumConv] : [];
  while (c.length > la + 1) {
    const last = c[c.length - 1];
    if (last && last.role === 'user' && String(last.userId || '') === uidStr) {
      c.pop();
      if (s.length > 0) s.pop();
    } else break;
  }
  return { conv: c, sumConv: s };
}

/**
 * Multiplayer (2+ members): append this player's line, notify SSE, run DM only after every member has
 * submitted since the last assistant reply. Single-member games use appendPlayerUserMessageForBroadcast + client /generate.
 *
 * @param {import('express').Request} [options.req] — for long-running DM socket timeout when flushing the round.
 */
async function appendPlayerUserMessageWithPartyRound(gameId, body, { userId, req } = {}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('appendPlayerUserMessageWithPartyRound: userId is required');
  }
  const gid = gameId != null ? String(gameId).trim() : '';
  if (!gid) {
    const err = new Error('gameId is required');
    err.code = 'GAME_ID_REQUIRED';
    throw err;
  }
  const content =
    body && typeof body.content === 'string' ? String(body.content).trim() : '';
  if (!content) {
    const err = new Error('content is required');
    err.code = 'PLAYER_MESSAGE_CONTENT_REQUIRED';
    throw err;
  }

  await assertGameMember(userId, gid);

  const doc = await GameState.findOne({ gameId: gid });
  if (!doc) {
    const err = new Error('Game not found');
    err.status = 404;
    throw err;
  }

  if (!isMultiMemberParty(doc)) {
    const r = await appendPlayerUserMessageForBroadcast(gid, body, { userId });
    return { ...r, partyWait: false };
  }

  const uidStr = String(userId);
  let gameSetup = doc.gameSetup && typeof doc.gameSetup === 'object' ? { ...doc.gameSetup } : {};
  const fromSheet = characterDisplayNameForUser(gameSetup, uidStr);
  const hint =
    body && body.displayName != null && String(body.displayName).trim()
      ? String(body.displayName).trim()
      : '';

  const userMessage = {
    role: 'user',
    content,
    userId: uidStr,
  };
  if (fromSheet) userMessage.displayName = fromSheet;
  else if (hint) userMessage.displayName = hint;

  let conv = Array.isArray(doc.conversation) ? [...doc.conversation] : [];
  let sumConv = Array.isArray(doc.summaryConversation) ? [...doc.summaryConversation] : [];

  const last = conv[conv.length - 1];
  if (
    last &&
    last.role === 'user' &&
    last.content === content &&
    String(last.userId || '') === uidStr
  ) {
    try {
      const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
      notifyGameStateUpdated(gid);
    } catch (e) {
      /* ignore */
    }
    const required = requiredPartyMemberIdStrings(doc);
    const submitted = Array.isArray(gameSetup.partySubmittedUserIds)
      ? gameSetup.partySubmittedUserIds.map(String)
      : [];
    const partyWait = !required.every((id) => submitted.includes(id));
    return { ok: true, duplicate: true, partyWait, partySubmitted: submitted.length, partyRequired: required.length };
  }

  const stripped = stripTrailingUserTailForUid(conv, sumConv, uidStr);
  conv = stripped.conv;
  sumConv = stripped.sumConv;

  conv.push(userMessage);
  sumConv.push({ ...userMessage });

  const submittedIds = new Set(
    (Array.isArray(gameSetup.partySubmittedUserIds) ? gameSetup.partySubmittedUserIds : []).map(String)
  );
  submittedIds.add(uidStr);
  gameSetup.partySubmittedUserIds = [...submittedIds].sort();

  const required = requiredPartyMemberIdStrings(doc);
  const allReady = required.every((id) => submittedIds.has(id));

  const conversationStored = normalizeConversationUserDisplayNames(conv, gameSetup, userId);
  const summaryStored = normalizeConversationUserDisplayNames(sumConv, gameSetup, userId);
  const extraTokens = Math.max(0, Math.ceil(content.length / 4));

  await GameState.findOneAndUpdate(
    { gameId: gid },
    {
      $set: {
        conversation: conversationStored,
        summaryConversation: summaryStored,
        totalTokenCount: (doc.totalTokenCount || 0) + extraTokens,
        gameSetup,
      },
    },
    { new: true }
  );

  try {
    const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
    notifyGameStateUpdated(gid);
  } catch (e) {
    /* ignore */
  }

  if (!allReady) {
    return {
      ok: true,
      duplicate: false,
      partyWait: true,
      partySubmitted: submittedIds.size,
      partyRequired: required.length,
    };
  }

  const fresh = await GameState.findOne({ gameId: gid }).lean();
  if (!fresh) {
    const err = new Error('Game not found');
    err.status = 404;
    throw err;
  }

  const lang =
    (fresh.gameSetup && fresh.gameSetup.language) || (gameSetup && gameSetup.language) || 'English';
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
    requestingUserId: uidStr,
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
      requestingUserId: uidStr,
    },
    userId: uidStr,
    socket: req && req.socket ? req.socket : undefined,
  };

  const gameSessionRouter = require('./routes/gameSession');
  if (typeof gameSessionRouter.handleDmGenerate !== 'function') {
    throw new Error('gameSession.handleDmGenerate is missing');
  }
  gameSessionRouter.setLongRequestSocketTimeout(mockReq);
  await gameSessionRouter.handleDmGenerate(mockReq, mockRes);

  try {
    const { notifyGameStateUpdated } = require('./services/gameStateSseHub');
    notifyGameStateUpdated(gid);
  } catch (e) {
    /* ignore */
  }

  if (mockRes.statusCode !== 200 || !mockRes._json || typeof mockRes._json !== 'object') {
    const errMsg =
      mockRes._json && mockRes._json.error
        ? String(mockRes._json.error)
        : `DM generate failed (HTTP ${mockRes.statusCode})`;
    const out = {
      ok: false,
      partyWait: false,
      error: errMsg,
      statusCode: mockRes.statusCode,
    };
    if (mockRes._json && mockRes._json.code) out.code = mockRes._json.code;
    return out;
  }

  const dm = mockRes._json;
  return {
    ok: true,
    duplicate: false,
    partyWait: false,
    partyDm: {
      narration: dm.narration,
      encounterState: dm.encounterState != null ? dm.encounterState : null,
      activeCombat: Boolean(dm.activeCombat),
      ...(dm.coinage != null && typeof dm.coinage === 'object' ? { coinage: dm.coinage } : {}),
    },
  };
}

/**
 * Client sends persist snapshot with conversation ending on the latest user (or system-only for opening).
 * Server appends assistant narration and aligns counters / encounter for DB write.
 * @param {{ requestingUserId?: string }} meta
 */
function mergePersistWithAssistantReply(persistBase, envelope, { finalUsedCombatStack = false, requestingUserId = null } = {}) {
  if (!persistBase || typeof persistBase !== 'object') return null;
  const narration = String((envelope && envelope.narration) || '');
  const aiMsg = { role: 'assistant', content: narration };
  const conv = Array.isArray(persistBase.conversation) ? [...persistBase.conversation] : [];
  const sumConv = Array.isArray(persistBase.summaryConversation) ? [...persistBase.summaryConversation] : [];
  conv.push(aiMsg);
  sumConv.push(aiMsg);

  const beforeLast = conv.length >= 2 ? conv[conv.length - 2] : null;
  const countInc = beforeLast && beforeLast.role === 'user' ? 1 : 0;
  const extraNarrationTokens = Math.max(0, Math.ceil(narration.length / 4));

  const encounterState =
    envelope && Object.prototype.hasOwnProperty.call(envelope, 'encounterState')
      ? envelope.encounterState
      : persistBase.encounterState;

  const mode = finalUsedCombatStack ? 'combat' : persistBase.mode;

  let gameSetup =
    persistBase.gameSetup && typeof persistBase.gameSetup === 'object' ? { ...persistBase.gameSetup } : {};
  if (
    envelope &&
    envelope.coinage != null &&
    typeof envelope.coinage === 'object' &&
    !Array.isArray(envelope.coinage)
  ) {
    const gs = { ...gameSetup };
    const uid = requestingUserId && String(requestingUserId);
    const normalized = normalizeCoinageObject(envelope.coinage);
    if (uid) {
      if (!gs.playerCharacters || typeof gs.playerCharacters !== 'object') gs.playerCharacters = {};
      const cur = { ...(gs.playerCharacters[uid] || {}) };
      cur.coinage = normalized;
      gs.playerCharacters = { ...gs.playerCharacters, [uid]: cur };
    }
    gameSetup = gs;
  }

  delete gameSetup.partySubmittedUserIds;

  return {
    ...persistBase,
    gameId: persistBase.gameId,
    conversation: conv,
    summaryConversation: sumConv,
    encounterState,
    mode,
    gameSetup,
    userAndAssistantMessageCount: (persistBase.userAndAssistantMessageCount || 0) + countInc,
    totalTokenCount: (persistBase.totalTokenCount || 0) + extraNarrationTokens,
  };
}

module.exports = {
  persistGameStateFromBody,
  mergePersistWithAssistantReply,
  appendPlayerUserMessageForBroadcast,
  appendPlayerUserMessageWithPartyRound,
};
