/**
 * Player-facing PC names from Iron Arachne MUNA (https://names.ironarachne.com/).
 * API shape: GET /race/:race/:nameType/:count → { names: string[] }.
 * We combine given (male|female) + family for a two-token sheet name.
 *
 * When the client sends a concrete `race` (not random), `/generate-character` **preassigns** one name and
 * injects it into the user prompt so the LLM uses the same name in JSON and brief_backstory; the server
 * then syncs that string again after parse (no second RNG draw).
 *
 * Disable with DM_USE_IRON_ARACHNE_NAMES=false or 0. Override base URL with DM_IRON_ARACHNE_NAMES_URL.
 * On HTTP/parse errors we log and leave the model-generated name (no silent success).
 */
const { collectReservedEntityNameKeys, normalizeNameKey } = require('../validateEntityNameUniqueness');
const { syncPlayerCharacterDisplayNameFields } = require('../playerCharacterHelpers');

const IRON_RACES = new Set([
  'dragonborn',
  'dwarf',
  'elf',
  'gnome',
  'goblin',
  'half-elf',
  'half-orc',
  'halfling',
  'human',
  'orc',
  'tiefling',
  'troll',
]);

const DEFAULT_BASE = 'https://names.ironarachne.com';
const FETCH_TIMEOUT_MS = 10000;
const BATCH = 12;

function ironArachneNamesEnabled() {
  const raw = process.env.DM_USE_IRON_ARACHNE_NAMES;
  if (raw == null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'no' && s !== 'off';
}

function baseUrl() {
  const u = process.env.DM_IRON_ARACHNE_NAMES_URL;
  if (u != null && String(u).trim()) return String(u).trim().replace(/\/$/, '');
  return DEFAULT_BASE;
}

/**
 * Map PHB-style ancestry string to MUNA race slug.
 * @param {unknown} ancestry
 * @returns {string}
 */
function mapAncestryToIronRace(ancestry) {
  const s = String(ancestry || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim();
  if (!s) return 'human';

  const hyphen = s.replace(/\s+/g, '-');
  if (IRON_RACES.has(hyphen)) return hyphen;

  if (/\bhalf[\s-]*elf\b/.test(s) || s.includes('half elf')) return 'half-elf';
  if (/\bhalf[\s-]*orc\b/.test(s) || s.includes('half orc')) return 'half-orc';
  if (/\bdragonborn\b/.test(s) || s.includes('dragon born')) return 'dragonborn';
  if (/\btiefling\b/.test(s) || /\btiflin\b/.test(s)) return 'tiefling';
  if (/\bhalfling\b/.test(s) || /\bmediano\b/.test(s)) return 'halfling';
  if (/\bdwarf\b/.test(s) || /\bduergar\b/.test(s) || /\benano\b/.test(s)) return 'dwarf';
  if (/\bgnome\b/.test(s) || /\bgnomo\b/.test(s)) return 'gnome';
  if (/\bgoblin\b/.test(s)) return 'goblin';
  if (/\borc\b/.test(s) && !/half/.test(s)) return 'orc';
  if (/\belf\b/.test(s) || /\belven\b/.test(s) || /\belfo\b/.test(s)) return 'elf';
  if (/\bhuman\b/.test(s) || /\bhumano\b/.test(s)) return 'human';
  if (/\btroll\b/.test(s)) return 'troll';

  return 'human';
}

/**
 * @param {object} pc
 * @returns {'male'|'female'}
 */
function inferSexForNames(pc) {
  if (!pc || typeof pc !== 'object') return Math.random() < 0.5 ? 'male' : 'female';
  const g =
    (pc.identity && typeof pc.identity === 'object' && pc.identity.gender) ||
    pc.gender ||
    pc.sex ||
    '';
  const t = String(g).toLowerCase().trim();
  if (/^(f|female|woman|mujer|femenino|femenina)\b/.test(t)) return 'female';
  if (/^(m|male|man|hombre|masculino|masculina)\b/.test(t)) return 'male';
  return Math.random() < 0.5 ? 'male' : 'female';
}

/** Lobby form: `Male` / `Female` / localized. */
function inferSexFromLobbyGenderHint(g) {
  const t = String(g || '').toLowerCase().trim();
  if (t.startsWith('f')) return 'female';
  if (t.startsWith('m')) return 'male';
  return Math.random() < 0.5 ? 'male' : 'female';
}

/**
 * @param {string} base
 * @param {string} race
 * @param {string} nameType male|female|family
 * @param {number} count
 * @param {AbortSignal} signal
 * @returns {Promise<string[]>}
 */
async function fetchNameBatch(base, race, nameType, count, signal) {
  const url = `${base}/race/${encodeURIComponent(race)}/${encodeURIComponent(nameType)}/${count}`;
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Iron Arachne HTTP ${res.status} for ${url}`);
    err.code = 'IRON_ARACHNE_HTTP';
    throw err;
  }
  const j = await res.json();
  if (!j || typeof j !== 'object' || !Array.isArray(j.names)) {
    const err = new Error('Iron Arachne response missing names[]');
    err.code = 'IRON_ARACHNE_JSON';
    throw err;
  }
  return j.names.map((x) => String(x || '').trim()).filter(Boolean);
}

/**
 * @param {{ race: string, sex: 'male'|'female', reserved: Set<string> }} args
 * @returns {Promise<{ ok: true, name: string } | { ok: false, reason: string }>}
 */
async function pickUniqueIronArachneFullName({ race, sex, reserved }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const b = baseUrl();
    const [givenList, familyList] = await Promise.all([
      fetchNameBatch(b, race, sex, BATCH, controller.signal),
      fetchNameBatch(b, race, 'family', BATCH, controller.signal),
    ]);

    for (const g of givenList) {
      for (const f of familyList) {
        if (!g || !f) continue;
        const full = `${g} ${f}`.replace(/\s+/g, ' ').trim();
        const parts = full.split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const key = normalizeNameKey(full);
        if (!key || reserved.has(key)) continue;
        return { ok: true, name: full };
      }
    }

    console.warn('[ironArachneNames] No unique given+family pair after batch', {
      race,
      sex,
      reservedSize: reserved.size,
    });
    return { ok: false, reason: 'no_unique_pair' };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'timeout' : String(e && e.message ? e.message : e);
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Accept a name returned by POST /preview-character-name so generate-character does not draw a second MUNA name.
 * @param {string} str
 * @param {{ gameSetupForReserved?: object, campaignSpec?: object, encounterState?: object, excludeUserId?: string }} ctx
 * @returns {{ ok: true, name: string } | { ok: false, reason: string }}
 */
function validatePreassignedDisplayNameFromClient(str, ctx = {}) {
  const full = String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, reason: 'need_two_tokens' };
  }
  const key = normalizeNameKey(full);
  if (!key) {
    return { ok: false, reason: 'empty_key' };
  }
  const reserved = collectReservedEntityNameKeys({
    gameSetup: ctx.gameSetupForReserved,
    campaignSpec: ctx.campaignSpec,
    encounterState: ctx.encounterState,
    excludeUserId: ctx.excludeUserId,
  });
  if (reserved.has(key)) {
    return { ok: false, reason: 'collision' };
  }
  return { ok: true, name: full };
}

/**
 * Before the character LLM call: pick one MUNA name when race is known (not random).
 * `raceRaw` / `genderRaw` come from the client lobby payload; `gameSetupForReserved` is the persisted
 * GameState.gameSetup (for other PCs’ names), not the partial prompt payload.
 * @param {{ raceRaw?: unknown, genderRaw?: unknown, gameSetupForReserved?: object, campaignSpec?: object, encounterState?: object, excludeUserId?: string }} ctx
 * @returns {Promise<{ ok: true, name: string } | { ok: false, reason: string }>}
 */
async function tryPreassignIronArachneDisplayName(ctx = {}) {
  if (!ironArachneNamesEnabled()) {
    return { ok: false, reason: 'disabled_by_env' };
  }
  const rawRace = ctx.raceRaw != null ? String(ctx.raceRaw).trim() : '';
  if (!rawRace || rawRace.toLowerCase() === 'random') {
    return { ok: false, reason: 'race_not_fixed' };
  }

  const race = mapAncestryToIronRace(rawRace);
  const sex = inferSexFromLobbyGenderHint(ctx.genderRaw);
  const reserved = collectReservedEntityNameKeys({
    gameSetup: ctx.gameSetupForReserved,
    campaignSpec: ctx.campaignSpec,
    encounterState: ctx.encounterState,
    excludeUserId: ctx.excludeUserId,
  });

  const pick = await pickUniqueIronArachneFullName({ race, sex, reserved });
  if (!pick.ok) {
    if (pick.reason !== 'no_unique_pair') {
      console.warn('[ironArachneNames] preassign fetch failed:', pick.reason);
    }
    return { ok: false, reason: pick.reason };
  }
  return { ok: true, name: pick.name };
}

/**
 * After LLM when preassign was skipped or failed: pick and sync name onto `pc`.
 * @param {object} pc playerCharacter
 * @param {{ gameSetup?: object, campaignSpec?: object, encounterState?: object, excludeUserId?: string }} ctx
 * @returns {Promise<{ ok: true, name: string, source: 'iron_arachne' } | { ok: false, source: 'model', reason: string }>}
 */
async function assignIronArachnePlayerCharacterNameIfEnabled(pc, ctx = {}) {
  if (!ironArachneNamesEnabled()) {
    return { ok: false, source: 'model', reason: 'disabled_by_env' };
  }
  if (!pc || typeof pc !== 'object') {
    return { ok: false, source: 'model', reason: 'invalid_pc' };
  }

  const race = mapAncestryToIronRace(pc.ancestry || pc.race);
  const sex = inferSexForNames(pc);
  const reserved = collectReservedEntityNameKeys({
    gameSetup: ctx.gameSetup,
    campaignSpec: ctx.campaignSpec,
    encounterState: ctx.encounterState,
    excludeUserId: ctx.excludeUserId,
  });

  const pick = await pickUniqueIronArachneFullName({ race, sex, reserved });
  if (!pick.ok) {
    if (pick.reason === 'no_unique_pair') {
      console.warn('[ironArachneNames] No unique given+family pair after batch', {
        race,
        sex,
        reservedSize: reserved.size,
      });
    } else {
      console.warn('[ironArachneNames] fetch failed; keeping model name:', pick.reason);
    }
    return { ok: false, source: 'model', reason: pick.reason };
  }

  syncPlayerCharacterDisplayNameFields(pc, pick.name);
  return { ok: true, name: pick.name, source: 'iron_arachne' };
}

module.exports = {
  IRON_RACES,
  mapAncestryToIronRace,
  inferSexForNames,
  inferSexFromLobbyGenderHint,
  ironArachneNamesEnabled,
  validatePreassignedDisplayNameFromClient,
  tryPreassignIronArachneDisplayName,
  assignIronArachnePlayerCharacterNameIfEnabled,
};
