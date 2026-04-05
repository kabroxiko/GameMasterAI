/**
 * Lobby-first party flow: gameSetup.party shape (GameState.gameSetup is schemaless).
 *
 * party: {
 *   phase: 'lobby' | 'starting' | 'playing',
 *   readyUserIds: string[],       // Mongo user id strings
 *   hostPremise: string,          // optional seed for campaign generator (owner-editable)
 *   pendingNarrativeIntroductionUserIds: string[],
 *   lastStartError: string | null,
 *   lastStartAt: string | null, // ISO
 * }
 */

const { hasSubstantiveCampaignSpec } = require('../campaignSpecReady');
const { validateGeneratedPlayerCharacter } = require('../validatePlayerCharacter');

function defaultParty() {
  return {
    phase: 'lobby',
    readyUserIds: [],
    hostPremise: '',
    pendingNarrativeIntroductionUserIds: [],
    lastStartError: null,
    lastStartAt: null,
  };
}

function getParty(gameSetup) {
  const gs = gameSetup && typeof gameSetup === 'object' ? gameSetup : {};
  const p = gs.party && typeof gs.party === 'object' && !Array.isArray(gs.party) ? gs.party : {};
  return { ...defaultParty(), ...p };
}

function mergeParty(gameSetup, patch) {
  const gs = gameSetup && typeof gameSetup === 'object' ? { ...gameSetup } : {};
  const cur = getParty(gs);
  gs.party = { ...cur, ...patch };
  return gs;
}

/** Member user id strings including owner. */
function canonicalMemberIdStrings(doc) {
  const out = new Set();
  if (doc.ownerUserId != null) out.add(String(doc.ownerUserId));
  const m = Array.isArray(doc.memberUserIds) ? doc.memberUserIds : [];
  for (const x of m) {
    if (x != null) out.add(String(x));
  }
  return [...out];
}

function sheetLooksValid(sheet) {
  if (!sheet || typeof sheet !== 'object') return false;
  const v = validateGeneratedPlayerCharacter(sheet);
  return v.ok === true;
}

function allMembersHaveValidSheets(doc) {
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const pcMap = gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters) ? gs.playerCharacters : {};
  const ids = canonicalMemberIdStrings(doc);
  for (const id of ids) {
    if (!sheetLooksValid(pcMap[id])) return false;
  }
  return ids.length > 0;
}

/** True when this user's row in gameSetup.playerCharacters passes the same validation as lobby start. */
function memberHasValidSheetForUserId(doc, userIdStr) {
  const uid = userIdStr != null ? String(userIdStr) : '';
  if (!uid) return false;
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const pcMap =
    gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters)
      ? gs.playerCharacters
      : {};
  return sheetLooksValid(pcMap[uid]);
}

function allMembersReady(party, doc) {
  const ids = new Set(canonicalMemberIdStrings(doc));
  const ready = new Set((party.readyUserIds || []).map(String));
  if (ids.size === 0) return false;
  for (const id of ids) {
    if (!ready.has(id)) return false;
  }
  return true;
}

function isLobbyParty(doc) {
  const party = getParty(doc.gameSetup);
  if (party.phase === 'playing') return false;
  if (hasSubstantiveCampaignSpec(doc.campaignSpec)) return false;
  return party.phase === 'lobby' || party.phase === 'starting';
}

function adventureHasBegun(doc) {
  if (hasSubstantiveCampaignSpec(doc.campaignSpec)) return true;
  const conv = Array.isArray(doc.conversation) ? doc.conversation : [];
  return conv.some((m) => m && m.role === 'assistant');
}

module.exports = {
  defaultParty,
  getParty,
  mergeParty,
  canonicalMemberIdStrings,
  allMembersHaveValidSheets,
  memberHasValidSheetForUserId,
  allMembersReady,
  isLobbyParty,
  adventureHasBegun,
  sheetLooksValid,
};
