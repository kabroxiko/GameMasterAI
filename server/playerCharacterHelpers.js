const { ensurePlayerCharacterSheetDefaults } = require('./validatePlayerCharacter');

/**
 * Effective character sheet for a user: `gameSetup.playerCharacters[userId]` only.
 */
function characterForUser(gameSetup, userIdStr) {
  if (!gameSetup || typeof gameSetup !== 'object') return null;
  const uid = userIdStr && String(userIdStr);
  const map = gameSetup.playerCharacters;
  if (uid && map && typeof map === 'object' && !Array.isArray(map)) {
    const c = map[uid];
    if (c && typeof c === 'object') return c;
  }
  return null;
}

/** Non-empty PC name from a sheet, or null (no overwrite / unknown). */
function characterDisplayNameFromSheet(c) {
  if (!c || typeof c !== 'object') return null;
  const n =
    (c.identity && typeof c.identity.name === 'string' && c.identity.name.trim()) ||
    (typeof c.characterName === 'string' && c.characterName.trim()) ||
    (typeof c.name === 'string' && c.name.trim()) ||
    '';
  return n || null;
}

/** Label for prompts / party list when a fallback is required. */
function displayNameFromCharacterSheet(c) {
  return characterDisplayNameFromSheet(c) || 'Adventurer';
}

function characterDisplayNameForUser(gameSetup, userIdStr) {
  return characterDisplayNameFromSheet(characterForUser(gameSetup, userIdStr));
}

/**
 * Deep-merge playerCharacters from client into existing; normalize each touched sheet.
 */
function mergePlayerCharacters(existingSetup, incomingSetup, language) {
  const lang = language || (incomingSetup && incomingSetup.language) || (existingSetup && existingSetup.language) || 'English';
  const base = { ...(existingSetup || {}) };
  const incoming = incomingSetup && typeof incomingSetup === 'object' ? incomingSetup : {};
  const mergedMap = { ...(base.playerCharacters && typeof base.playerCharacters === 'object' ? base.playerCharacters : {}) };
  const incMap = incoming.playerCharacters;
  if (incMap && typeof incMap === 'object' && !Array.isArray(incMap)) {
    for (const k of Object.keys(incMap)) {
      if (!k || typeof incMap[k] !== 'object' || Array.isArray(incMap[k])) continue;
      mergedMap[k] = ensurePlayerCharacterSheetDefaults(incMap[k], { language: lang });
    }
  }
  base.playerCharacters = mergedMap;
  return base;
}

/**
 * After character generation: store sheet under playerCharacters[uid].
 */
function assignCharacterForUser(gameSetup, userIdStr, characterObj) {
  const gs = { ...(gameSetup || {}) };
  const uid = userIdStr && String(userIdStr);
  if (!uid || !characterObj || typeof characterObj !== 'object') return gs;
  if (!gs.playerCharacters || typeof gs.playerCharacters !== 'object' || Array.isArray(gs.playerCharacters)) {
    gs.playerCharacters = {};
  }
  gs.playerCharacters = { ...gs.playerCharacters, [uid]: characterObj };
  return gs;
}

/**
 * Apply coinage to the requesting user's character in playerCharacters[uid].
 */
function applyCoinageToUserCharacter(gameSetup, userIdStr, coinage) {
  const gs = { ...(gameSetup || {}) };
  const uid = userIdStr && String(userIdStr);
  if (!uid) return gs;
  if (!gs.playerCharacters || typeof gs.playerCharacters !== 'object') gs.playerCharacters = {};
  const cur = { ...(gs.playerCharacters[uid] || {}) };
  cur.coinage = coinage;
  gs.playerCharacters = { ...gs.playerCharacters, [uid]: cur };
  return gs;
}

module.exports = {
  characterForUser,
  characterDisplayNameFromSheet,
  displayNameFromCharacterSheet,
  characterDisplayNameForUser,
  mergePlayerCharacters,
  assignCharacterForUser,
  applyCoinageToUserCharacter,
};
