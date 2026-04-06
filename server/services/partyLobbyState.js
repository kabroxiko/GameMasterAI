/**
 * Lobby-first party flow: gameSetup.party shape (GameState.gameSetup is schemaless).
 *
 * party: {
 *   phase: 'lobby' | 'starting' | 'playing',
 *   readyUserIds: string[],       // Mongo user id strings
 *   hostPremise: string,          // optional seed for campaign generator (owner-editable)
 *   pendingNarrativeIntroductionUserIds: string[],
 *   narrativeIntroducedUserIds: string[], // PCs whose late-join intro was completed (persist after DM turn)
 *   lastStartError: string | null,
 *   lastStartAt: string | null, // ISO
 * }
 */

const { hasSubstantiveCampaignSpec } = require('../campaignSpecReady');
const { validateGeneratedPlayerCharacter, ensurePlayerCharacterSheetDefaults } = require('../validatePlayerCharacter');

function defaultParty() {
  return {
    phase: 'lobby',
    readyUserIds: [],
    hostPremise: '',
    pendingNarrativeIntroductionUserIds: [],
    narrativeIntroducedUserIds: [],
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

/**
 * Same normalization as GET /game-state/load (gameStateDocForClient) before validating, so lobby gates
 * match what clients see and what /generate-character persists after ensurePlayerCharacterSheetDefaults.
 */
function sheetLooksValid(sheet, language) {
  if (!sheet || typeof sheet !== 'object') return false;
  const lang =
    language != null && String(language).trim() !== '' ? String(language).trim() : 'English';
  let normalized;
  try {
    normalized = ensurePlayerCharacterSheetDefaults(sheet, { language: lang });
  } catch (_) {
    return false;
  }
  const v = validateGeneratedPlayerCharacter(normalized);
  return v.ok === true;
}

/** Resolve a member's sheet when the map key might not match strict bracket lookup (Mixed / driver quirks). */
function resolvePlayerCharacterSheet(pcMap, userIdStr) {
  const uid = userIdStr != null ? String(userIdStr).trim() : '';
  if (!uid || !pcMap || typeof pcMap !== 'object' || Array.isArray(pcMap)) return null;
  const lower = uid.toLowerCase();
  const direct = pcMap[uid];
  if (direct && typeof direct === 'object') return direct;
  for (const k of Object.keys(pcMap)) {
    if (String(k).trim().toLowerCase() === lower && pcMap[k] && typeof pcMap[k] === 'object') return pcMap[k];
  }
  return null;
}

function gameSetupLanguage(doc) {
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  return gs.language && String(gs.language).trim() !== '' ? String(gs.language).trim() : 'English';
}

/** Normalize Mongo user id strings for ready lists and comparisons (hex ObjectIds are case-insensitive). */
function normalizeUserIdString(raw) {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase();
}

/** Dedupe + lowercase readyUserIds for stable storage and Set comparisons. */
function normalizeReadyUserIdsArray(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = normalizeUserIdString(x);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function allMembersHaveValidSheets(doc) {
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const pcMap = gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters) ? gs.playerCharacters : {};
  const ids = canonicalMemberIdStrings(doc);
  const lang = gameSetupLanguage(doc);
  for (const id of ids) {
    if (!sheetLooksValid(resolvePlayerCharacterSheet(pcMap, id), lang)) return false;
  }
  return ids.length > 0;
}

/** True when this user's row in gameSetup.playerCharacters passes the same validation as lobby start. */
function memberHasValidSheetForUserId(doc, userIdStr) {
  const uid = normalizeUserIdString(userIdStr);
  if (!uid) return false;
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const pcMap =
    gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters)
      ? gs.playerCharacters
      : {};
  const sheet = resolvePlayerCharacterSheet(pcMap, uid);
  return sheetLooksValid(sheet, gameSetupLanguage(doc));
}

function allMembersReady(party, doc) {
  const ids = new Set(canonicalMemberIdStrings(doc).map((x) => normalizeUserIdString(x)).filter(Boolean));
  const ready = new Set(
    (party.readyUserIds || []).map((x) => normalizeUserIdString(x)).filter(Boolean)
  );
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
  normalizeUserIdString,
  normalizeReadyUserIdsArray,
};
