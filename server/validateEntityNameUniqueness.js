/**
 * Enforce distinct display names for player characters, campaign major NPCs, and encounter participants.
 * Comparison is case-insensitive after Unicode NFKC + trim + whitespace collapse.
 */

const { characterDisplayNameFromSheet } = require('./playerCharacterHelpers');

function normalizeNameKey(s) {
  if (s == null) return '';
  try {
    return String(s)
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  } catch (e) {
    return String(s)
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }
}

function listPlayerCharacterNameEntries(gameSetup) {
  const out = [];
  const map = gameSetup && gameSetup.playerCharacters;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const uid of Object.keys(map)) {
    const sheet = map[uid];
    const raw = characterDisplayNameFromSheet(sheet);
    if (!raw) continue;
    const key = normalizeNameKey(raw);
    if (!key) continue;
    out.push({ key, raw, source: `playerCharacters[${uid}]` });
  }
  return out;
}

function listMajorNpcNameEntries(campaignSpec) {
  const out = [];
  const spec = campaignSpec && typeof campaignSpec === 'object' ? campaignSpec : null;
  const raw = spec && spec.majorNPCs;
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const name = item && item.name != null ? String(item.name).trim() : '';
    if (!name) continue;
    const key = normalizeNameKey(name);
    if (!key) continue;
    out.push({ key, raw: name, source: `campaignSpec.majorNPCs[${i}]` });
  }
  return out;
}

function participantDisplayLabel(p) {
  if (!p || typeof p !== 'object') return '';
  const cand =
    (typeof p.name === 'string' && p.name.trim()) ||
    (typeof p.displayName === 'string' && p.displayName.trim()) ||
    (typeof p.label === 'string' && p.label.trim()) ||
    '';
  return cand;
}

function listEncounterParticipantNameEntries(encounterState) {
  const out = [];
  const es = encounterState && typeof encounterState === 'object' && !Array.isArray(encounterState) ? encounterState : null;
  if (!es || !Array.isArray(es.participants)) return out;
  es.participants.forEach((p, i) => {
    const raw = participantDisplayLabel(p);
    if (!raw) return;
    const key = normalizeNameKey(raw);
    if (!key) return;
    out.push({ key, raw, source: `encounterState.participants[${i}]` });
  });
  return out;
}

function firstDuplicatePair(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (!e.key) continue;
    if (seen.has(e.key)) return { a: seen.get(e.key), b: e };
    seen.set(e.key, e);
  }
  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, code: string }}
 */
function validateDistinctEntityNames({ gameSetup, campaignSpec, encounterState } = {}) {
  const pcs = listPlayerCharacterNameEntries(gameSetup);
  const dupPc = firstDuplicatePair(pcs);
  if (dupPc) {
    return {
      ok: false,
      code: 'ENTITY_NAME_DUPLICATE_PC',
      error: `Two player characters share the name "${dupPc.a.raw}". Each adventurer must have a unique name (ignoring case and extra spaces).`,
    };
  }

  const npcs = listMajorNpcNameEntries(campaignSpec);
  const dupNpc = firstDuplicatePair(npcs);
  if (dupNpc) {
    return {
      ok: false,
      code: 'ENTITY_NAME_DUPLICATE_MAJOR_NPC',
      error: `Two campaign NPCs share the name "${dupNpc.a.raw}". Each major NPC must have a distinct name.`,
    };
  }

  const pcKeys = new Set(pcs.map((p) => p.key));
  for (const n of npcs) {
    if (n.key && pcKeys.has(n.key)) {
      return {
        ok: false,
        code: 'ENTITY_NAME_PC_COLLIDES_WITH_MAJOR_NPC',
        error: `The name "${n.raw}" is used by both a player character and a campaign NPC. Use a different name for one of them.`,
      };
    }
  }

  const enc = listEncounterParticipantNameEntries(encounterState);
  const dupEnc = firstDuplicatePair(enc);
  if (dupEnc) {
    return {
      ok: false,
      code: 'ENTITY_NAME_DUPLICATE_ENCOUNTER_PARTICIPANT',
      error: `Two combat participants share the display name "${dupEnc.a.raw}". Give each participant a unique label (e.g. "Wolf 1" and "Wolf 2").`,
    };
  }

  return { ok: true };
}

/**
 * Ensure majorNPCs[].name values are unique; append " (2)", " (3)"… on collision (logged).
 * @param {unknown[]} list
 * @returns {unknown[]}
 */
function dedupeMajorNpcNamesBySuffix(list) {
  if (!Array.isArray(list)) return list;
  const seen = new Map();
  return list.map((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    let name = String(item.name || '').trim();
    if (!name) return item;
    let key = normalizeNameKey(name);
    if (!key) return item;
    if (!seen.has(key)) {
      seen.set(key, 1);
      return item;
    }
    const n = seen.get(key) + 1;
    seen.set(key, n);
    const disambiguated = `${name} (${n})`;
    console.warn(`[campaign] majorNPCs[${idx}] renamed duplicate "${name}" -> "${disambiguated}"`);
    return { ...item, name: disambiguated };
  });
}

module.exports = {
  normalizeNameKey,
  validateDistinctEntityNames,
  dedupeMajorNpcNamesBySuffix,
};
