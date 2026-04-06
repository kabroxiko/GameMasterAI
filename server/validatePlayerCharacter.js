/**
 * Player character validation for /generate-character.
 *
 * Policy:
 * - `/generate-character` does **not** normalize or repair model JSON; the model must emit valid shapes.
 * - `validateGeneratedPlayerCharacter` checks **identity + defense + array types**; weapon rows are
 *   validated only when present. `spells[].prepared` is optional (boolean, leveled spells only).
 *   `spell_prep_inferred` is optional (boolean): set when the server inferred prepared flags for
 *   level-1 known casters that listed too many 1st-level spells (PHB spells known).
 *   `spellbook_prep_enforced` is optional (boolean): set when prepared flags were adjusted to the
 *   spellbook cap for **Wizard** only (level + INT mod, min 1). Artificer uses class-list prepared JSON (no cap here).
 *   `spell_duplicate_levels_merged` is optional (boolean): set when two rows shared the same spell name at different
 *   `level` values and the server kept a single row (PHB: each spell has one level; models often duplicate e.g. Luz as 0 and 1).
 *   `languages` must be a **non-empty** string array (PHB-derived).
 *   Empty `equipment`, `tools`, and `weapons` are allowed when accurate; the sheet UI and combat prompts handle missing gear.
 */

function normalizeGearText(s) {
  let t = String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/\s*\(\d+\)\s*$/, '').trim();
  t = t.replace(/^\d+\s*[x×]\s*/i, '').trim();
  return t;
}

/** Base weapon name for matching (strip leading "2×", lowercase, accents). */
function weaponRowNormalizedName(row) {
  if (!row || typeof row !== 'object') return '';
  let raw = String(row.name || '').trim();
  raw = raw.replace(/^\d+\s*[x×]\s*/i, '').trim();
  return normalizeGearText(raw);
}

/** Drop carried lines (equipment or tools) that duplicate a `weapons[].name` (weapons belong only in `weapons`). */
function dedupeEquipmentAgainstWeapons(equipment, weapons) {
  if (!Array.isArray(equipment) || !Array.isArray(weapons)) return equipment;
  const names = new Set();
  for (const w of weapons) {
    const b = weaponRowNormalizedName(w);
    if (b) names.add(b);
  }
  if (!names.size) return equipment;
  const out = [];
  for (const line of equipment) {
    const key = normalizeGearText(line);
    if (names.has(key)) {
      // eslint-disable-next-line no-console
      console.warn(
        'dedupeEquipmentAgainstWeapons: removed equipment line that duplicates weapons[].name:',
        String(line).slice(0, 120)
      );
      continue;
    }
    out.push(line);
  }
  return out;
}

const DAMAGE_HAS_DICE = /\d*d\d+/i;

/**
 * True if an equipment line describes **base garments** (shirt, tunic, dress, etc.).
 * Cloaks, capes, boots-only, belts, hats, etc. do **not** count — a light cloak is not a full outfit.
 */
const BASE_GARMENT_RE =
  /common\s+clothes|travel\s+clothes|everyday\s+clothes|street\s+clothes|underclothes|\bclothing\b|\bshirt\b|\bblouse\b|\btrousers\b|\bpants\b|\bbreeches\b|\bhose\b|\bdoublet\b|\btunic\b|\btúnica\b|\btunica\b|\brobes?\b|\bdress\b|\bgarb\b|\bvestments\b|\bhabit\b|\bcamisa\b|\bpantalones\b|\bvestido\b|\bsayo\b|\bcalzones\b|\bropa\s+de\s+viaje\b|\bropa\s+corriente\b|\bropa\s+interior\b|\bindumentaria\s+corriente\b|\bropa\s+y\s+calzado\b/i;

/** Display string for an armor row (string legacy or { name }). */
function armorRowName(line) {
  if (line == null) return '';
  if (typeof line === 'string') return String(line).trim();
  if (typeof line === 'object' && !Array.isArray(line)) return String(line.name || '').trim();
  return String(line).trim();
}

/** True if armor list includes a body armor piece (not shield-only). */
function hasBodyArmorLines(armorLines) {
  if (!Array.isArray(armorLines) || !armorLines.length) return false;
  const shieldOnly = /^(escudo|shield)\b/i;
  const bodyArmor =
    /(leather|studded|hide|padded|chain|ring|scale|breastplate|half[\s-]?plate|splint|plate|cuero|acolchada|anillos?|malla|cota|escamas|peto|media\s*placa|placas|cuero\s*reforzado)/i;
  return armorLines.some((line) => {
    const s = armorRowName(line);
    if (!s) return false;
    if (shieldOnly.test(s)) return false;
    return bodyArmor.test(s);
  });
}

/**
 * Parse a single armor line string into a normalized object (optional AC / bonus suffixes).
 * @param {string} raw
 * @returns {{ name: string, ac_bonus?: number, base_ac?: number, ac?: number }|null}
 */
function parseArmorStringLine(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  let ac_bonus;
  let base_ac;
  // "Chain shirt (AC 14)" / "(CA 14)"
  let m = s.match(/^(.*?)\s*\(\s*(?:AC|CA)\s*(\d+)\s*\)\s*$/i);
  if (m) {
    s = m[1].trim();
    base_ac = Number(m[2]);
  }
  // "(+2)" bonus — shield or magic
  if (base_ac == null) {
    m = s.match(/^(.*?)\s*\(\s*\+?\s*(\d+)\s*\)\s*$/);
    if (m) {
      const n = Number(m[2]);
      if (Number.isFinite(n)) {
        s = m[1].trim();
        ac_bonus = n;
      }
    }
  }
  // trailing "+2" / "+2 CA"
  if (base_ac == null && ac_bonus == null) {
    m = s.match(/^(.*?)[,;]?\s*\+(\d+)\s*(?:to\s*)?(?:AC|CA)?\s*$/i);
    if (m) {
      s = m[1].trim();
      ac_bonus = Number(m[2]);
    }
  }
  if (!s) s = String(raw || '').trim();
  const row = { name: s };
  if (Number.isFinite(base_ac)) row.base_ac = Math.floor(base_ac);
  if (Number.isFinite(ac_bonus)) row.ac_bonus = ac_bonus;
  // PHB shield default when the line names only a shield and no numbers were parsed
  if (/^(escudo|shield)\b/i.test(row.name) && row.ac_bonus == null && row.base_ac == null && row.ac == null) {
    row.ac_bonus = 2;
  }
  return row;
}

/**
 * Normalize armor to an array of { name, ac_bonus?, base_ac?, ac? } for storage and UI.
 * @param {unknown} val
 * @returns {Array<{ name: string, ac_bonus?: number, base_ac?: number, ac?: number }>}
 */
function asArmorArray(val) {
  if (val == null) return [];
  let arr = val;
  if (typeof val === 'string') {
    try {
      arr = JSON.parse(val);
    } catch (e) {
      arr = [val];
    }
  }
  if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
    arr = Object.values(arr);
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const p = parseArmorStringLine(item);
      if (p && p.name) out.push(p);
      continue;
    }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const name = String(item.name || '').trim();
      if (!name) continue;
      const row = { name };
      if (item.ac_bonus != null && item.ac_bonus !== '') {
        const n = Number(String(item.ac_bonus).trim().replace(/^\+/, ''));
        if (Number.isFinite(n)) row.ac_bonus = n;
      }
      if (item.base_ac != null && item.base_ac !== '') {
        const n = Number(item.base_ac);
        if (Number.isFinite(n)) row.base_ac = Math.floor(n);
      }
      if (item.ac != null && item.ac !== '') {
        const n = Number(item.ac);
        if (Number.isFinite(n)) row.ac = Math.floor(n);
      }
      if (/^(escudo|shield)\b/i.test(row.name) && row.ac_bonus == null && row.base_ac == null && row.ac == null) {
        row.ac_bonus = 2;
      }
      out.push(row);
    }
  }
  return out;
}

function equipmentHasBaseGarments(equipmentLines) {
  if (!Array.isArray(equipmentLines)) return false;
  return equipmentLines.some((line) => BASE_GARMENT_RE.test(String(line || '')));
}

function defaultClothesLine(language) {
  const lang = String(language || '').toLowerCase();
  if (lang.startsWith('span')) {
    return 'Ropa de viaje y calzado (sin armadura)';
  }
  return 'Travel clothes and boots (no armor)';
}

/** Minimal placeholder when older saves omit `languages` (PHB: almost all PCs know Common). */
function defaultLanguagesFallback(language) {
  const lang = String(language || '').toLowerCase();
  if (lang.startsWith('span')) {
    return ['Común'];
  }
  return ['Common'];
}

/** D&D 5e coin types (Player’s Handbook). Order used for display / merge. */
const CURRENCY_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'];

/**
 * Non-negative integer coin count (single denomination).
 * @returns {number|null}
 */
function normalizeCoinAmount(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/^\+/, '');
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(9999999, Math.floor(n));
}

/**
 * Full 5e coin bag; missing keys become 0.
 * @param {object|null|undefined} raw
 * @returns {{ pp: number, gp: number, ep: number, sp: number, cp: number }}
 */
function normalizeCoinageObject(raw) {
  const out = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of CURRENCY_KEYS) {
    const v = normalizeCoinAmount(raw[k]);
    if (v != null) out[k] = v;
  }
  return out;
}

/**
 * Patch existing coinage with envelope values (only defined keys on `patch` overwrite).
 * @param {object|null|undefined} existing
 * @param {object|null|undefined} patch
 */
function mergeCoinage(existing, patch) {
  const base = normalizeCoinageObject(existing);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const k of CURRENCY_KEYS) {
    if (patch[k] != null) {
      const v = normalizeCoinAmount(patch[k]);
      if (v != null) out[k] = v;
    }
  }
  return out;
}

/** Mutates `pc`: normalizes `coinage`, folds mistaken `currency` key from models, drops `currency`. */
function applyCoinageToPlayerCharacterInPlace(pc) {
  if (!pc || typeof pc !== 'object') return;
  if (pc.coinage != null && typeof pc.coinage === 'object' && !Array.isArray(pc.coinage)) {
    pc.coinage = normalizeCoinageObject(pc.coinage);
  } else if (pc.currency != null && typeof pc.currency === 'object' && !Array.isArray(pc.currency)) {
    pc.coinage = normalizeCoinageObject(pc.currency);
    // eslint-disable-next-line no-console
    console.warn(
      'applyCoinageToPlayerCharacterInPlace: model sent `currency`; normalized onto `coinage`. Prompt requires key `coinage` only.'
    );
  } else {
    pc.coinage = { pp: 0, gp: 15, ep: 0, sp: 0, cp: 0 };
    // eslint-disable-next-line no-console
    console.warn('applyCoinageToPlayerCharacterInPlace: missing coinage; using default 15 gp.');
  }
  delete pc.currency;
}

/** Readable damage string for validation (handles a few object shapes models use). */
function damageToString(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'object') {
    if (raw.dice != null) return String(raw.dice).trim();
    if (raw.formula != null) return String(raw.formula).trim();
    if (raw.count != null && raw.sides != null) {
      const c = Number(raw.count);
      const s = Number(raw.sides);
      if (Number.isFinite(c) && Number.isFinite(s)) return `${c}d${s}`;
    }
  }
  return String(raw).trim();
}

function compactDamage(s) {
  let t = damageToString(s);
  try {
    t = t.normalize('NFKC');
  } catch (e) {
    /* ignore */
  }
  return t.replace(/\s+/g, '');
}

/** String list: null → []; string → [s]; object → values; array → string items. */
function asStringArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
  if (typeof val === 'object') {
    return Object.values(val)
      .map((x) => String(x).trim())
      .filter(Boolean);
  }
  const s = String(val).trim();
  if (!s || /^none$/i.test(s) || s === '—' || s === '-') return [];
  return [s];
}

/** Lowercase + strip accents for spell name matching (no `|level` suffix). */
function normalizeSpellNameKey(name) {
  let k = String(name || '')
    .trim()
    .toLowerCase();
  try {
    k = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    /* ignore */
  }
  return k;
}

/**
 * @param {unknown} name
 * @param {number} level
 * @returns {string}
 */
function normalizeSpellDedupeKey(name, level) {
  return `${normalizeSpellNameKey(name)}|${level}`;
}

/**
 * PHB-style cantrips (EN + common ES sheet titles). When the model lists the same name as both cantrip and leveled,
 * we keep the cantrip row. For any other name, we keep the highest listed level (fixes false cantrip rows for leveled spells).
 * Not exhaustive — extend when new bad pairs show up in logs.
 */
const PHB5E_CANT_NAME_KEYS = new Set(
  [
    // English (SRD / PHB cantrip names)
    'acid splash',
    'blade ward',
    'chill touch',
    'dancing lights',
    'druidcraft',
    'eldritch blast',
    'fire bolt',
    'friends',
    'guidance',
    'light',
    'mage hand',
    'mending',
    'message',
    'minor illusion',
    'poison spray',
    'prestidigitation',
    'ray of frost',
    'resistance',
    'sacred flame',
    'shillelagh',
    'shocking grasp',
    'spare the dying',
    'thorn whip',
    'thaumaturgy',
    'true strike',
    'vicious mockery',
    'produce flame',
    // Spanish (typical PHB-style translations)
    'salpicadura acida',
    'salpicadura ácida',
    'proteccion contra armas',
    'protección contra armas',
    'toque helado',
    'toque gélido',
    'luces danzantes',
    'druidismo',
    'estallido energetico',
    'estallido energético',
    'rayo de fuego',
    'amistad',
    'consejo',
    'guia',
    'luz',
    'mano de mago',
    'reparar',
    'mensaje',
    'ilusión menor',
    'rafaga venenosa',
    'ráfaga venenosa',
    'truco de manos',
    'rayo de escarcha',
    'resistencia',
    'llama sagrada',
    'cachiporra druidica',
    'golpe con rayo',
    'estabilizar',
    'latigazo',
    'taumaturgia',
    'golpe certero',
    'burla cruel',
    'producir llama',
  ].map((s) => normalizeSpellNameKey(s))
);

/**
 * One PHB spell = one level. Models often emit the same display name as level 0 and level ≥1 (e.g. Luz, Bendición).
 * @param {{ name: string, level: number, prepared?: boolean }[]} rows
 * @returns {{ spells: typeof rows, mergedDisplayNames: string[] }}
 */
function collapseDuplicateSpellNamesAcrossLevels(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return { spells: rows || [], mergedDisplayNames: [] };
  }
  const byKey = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const nk = normalizeSpellNameKey(row.name);
    if (!nk) continue;
    if (!byKey.has(nk)) byKey.set(nk, []);
    byKey.get(nk).push(row);
  }
  const keepers = new Map();
  const mergedDisplayNames = [];
  for (const [nk, group] of byKey) {
    if (group.length < 2) {
      keepers.set(nk, group[0]);
      continue;
    }
    const levels = new Set(group.map((r) => r.level));
    if (levels.size < 2) {
      keepers.set(nk, group[0]);
      continue;
    }
    mergedDisplayNames.push(String(group[0].name || '').trim() || nk);
    let keeper;
    if (PHB5E_CANT_NAME_KEYS.has(nk)) {
      keeper = group.find((r) => r.level === 0) || group[0];
    } else {
      const maxL = Math.max(...group.map((r) => r.level));
      keeper = group.find((r) => r.level === maxL) || group[0];
    }
    if (keeper.level >= 1) {
      const leveled = group.filter((r) => r.level >= 1);
      const anyTrue = leveled.some((r) => r.prepared === true);
      const anyBool = leveled.some((r) => typeof r.prepared === 'boolean');
      if (anyBool) {
        keeper = { ...keeper, prepared: anyTrue };
      }
    }
    keepers.set(nk, keeper);
  }
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const nk = normalizeSpellNameKey(row.name);
    if (!nk || seen.has(nk)) continue;
    seen.add(nk);
    const k = keepers.get(nk);
    if (k) out.push(k);
  }
  return { spells: out, mergedDisplayNames };
}

/**
 * Cleric / Druid / Paladin / Artificer: JSON lists only “prepared today” spells — never use `prepared` booleans.
 * @param {unknown} raw
 * @returns {boolean}
 */
function spellRulesClassListPreparedKind(raw) {
  let s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    /* ignore */
  }
  s = s.replace(/\s+/g, '');
  return (
    s === 'cleric' ||
    s === 'clerigo' ||
    s === 'druid' ||
    s === 'druida' ||
    s === 'paladin' ||
    s === 'artificer' ||
    s === 'artificiero' ||
    s === 'artifice'
  );
}

/**
 * Map sheet `class` string to a coarse id for level-1 “spells known” caps (EN + ES labels).
 * @param {unknown} raw
 * @returns {'known_caster' | null}
 */
function spellRulesKnownCasterKind(raw) {
  let s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    /* ignore */
  }
  s = s.replace(/\s+/g, '');
  if (!s) return null;
  if (
    s === 'sorcerer' ||
    s === 'hechicero' ||
    s === 'bard' ||
    s === 'bardo' ||
    s === 'warlock' ||
    s === 'brujo' ||
    s === 'ranger' ||
    s === 'explorador'
  ) {
    return 'known_caster';
  }
  return null;
}

/** Remove erroneous `prepared` on leveled rows for class-list prepared casters (sheet lists only ready spells). */
function stripPreparedFromClassListPreparedCasters(pc) {
  if (!pc || !Array.isArray(pc.spells) || !spellRulesClassListPreparedKind(pc.class)) return;
  for (const row of pc.spells) {
    if (row && row.level >= 1 && Object.prototype.hasOwnProperty.call(row, 'prepared')) {
      delete row.prepared;
    }
  }
}

/**
 * D&D 5e PHB: at **character level 1**, Bard / Sorcerer / Warlock each know **two** 1st-level spells
 * (plus cantrips). Models sometimes list extras; mark only the first allowed rows as prepared-for-play
 * so the sheet matches “spells known” vs “extras”, without dropping names.
 * Sets `playerCharacter.spell_prep_inferred` when this runs (client shows a short explain line).
 * @param {object} pc
 */
function inferKnownCasterL1PreparedWhenOverCap(pc) {
  if (!pc || typeof pc !== 'object' || !Array.isArray(pc.spells) || !pc.spells.length) {
    delete pc.spell_prep_inferred;
    return;
  }
  const charLevel = Math.floor(Number(pc.level));
  if (!Number.isFinite(charLevel) || charLevel !== 1) {
    delete pc.spell_prep_inferred;
    return;
  }
  if (spellRulesKnownCasterKind(pc.class) !== 'known_caster') {
    delete pc.spell_prep_inferred;
    return;
  }
  const maxL1Known = 2;
  const l1 = pc.spells.filter((row) => row && row.level === 1);
  const hasExplicitLeveled = pc.spells.some(
    (row) => row && typeof row === 'object' && row.level >= 1 && typeof row.prepared === 'boolean'
  );
  if (hasExplicitLeveled) {
    if (l1.length <= maxL1Known) {
      delete pc.spell_prep_inferred;
    }
    return;
  }
  if (l1.length <= maxL1Known) {
    delete pc.spell_prep_inferred;
    return;
  }
  const sorted = [...l1].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  );
  const allowed = new Set(
    sorted.slice(0, maxL1Known).map((row) => normalizeSpellDedupeKey(row.name, 1))
  );
  for (const row of pc.spells) {
    if (!row || row.level !== 1) continue;
    row.prepared = allowed.has(normalizeSpellDedupeKey(row.name, 1));
  }
  pc.spell_prep_inferred = true;
  // eslint-disable-next-line no-console
  console.warn(
    `inferKnownCasterL1PreparedWhenOverCap: class "${String(pc.class).slice(0, 40)}" at level 1 had ${l1.length} first-level spells (PHB allows ${maxL1Known} known); set prepared flags — regenerate for a clean list.`
  );
}

/**
 * **Wizard only** (hybrid spellbook + daily preparation). Artificer uses “class-list prepared” in JSON — no `prepared` flags.
 * @param {unknown} raw
 * @returns {'wizard' | null}
 */
function spellRulesSpellbookKind(raw) {
  let s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    /* ignore */
  }
  s = s.replace(/\s+/g, '');
  if (s === 'wizard' || s === 'mago') return 'wizard';
  return null;
}

/** @param {object|null|undefined} pc */
function abilityIntModifierFromPc(pc) {
  if (!pc || !pc.stats || typeof pc.stats !== 'object') return null;
  const raw = pc.stats.INT != null ? pc.stats.INT : pc.stats.Int;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.floor((n - 10) / 2);
}

/**
 * Wizard hybrid spellbook: prepared count = wizard level + INT mod (min 1).
 * @param {object} pc
 * @returns {number|null}
 */
function spellbookPreparedCapPhb(pc) {
  if (spellRulesSpellbookKind(pc.class) !== 'wizard') return null;
  const lvl = Math.floor(Number(pc.level));
  if (!Number.isFinite(lvl) || lvl < 1) return null;
  const mod = abilityIntModifierFromPc(pc);
  if (mod == null) return null;
  return Math.max(1, mod + lvl);
}

/**
 * Demote excess prepared trues, or assign prepared when none are true (spellbook list).
 * @param {object} pc
 */
function enforceSpellbookPreparedCountPhb(pc) {
  delete pc.spellbook_prep_enforced;
  if (!pc || typeof pc !== 'object' || !Array.isArray(pc.spells) || !pc.spells.length) return;
  if (!spellRulesSpellbookKind(pc.class)) return;

  const cap = spellbookPreparedCapPhb(pc);
  if (cap == null) {
    // eslint-disable-next-line no-console
    console.warn(
      'enforceSpellbookPreparedCountPhb: missing usable stats.INT; cannot cap prepared spells for Wizard.'
    );
    return;
  }

  const leveled = pc.spells.filter((row) => row && typeof row === 'object' && row.level >= 1);
  if (!leveled.length) return;

  const trueRows = leveled.filter((s) => s.prepared === true);
  let changed = false;

  if (trueRows.length > cap) {
    const sorted = [...trueRows].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    const demote = new Set(sorted.slice(cap).map((r) => normalizeSpellDedupeKey(r.name, r.level)));
    for (const row of pc.spells) {
      if (!row || row.level < 1) continue;
      if (demote.has(normalizeSpellDedupeKey(row.name, row.level))) {
        if (row.prepared !== false) changed = true;
        row.prepared = false;
      }
    }
  } else if (trueRows.length === 0) {
    const sorted = [...leveled].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
    const keep = Math.min(cap, sorted.length);
    const allowed = new Set(sorted.slice(0, keep).map((r) => normalizeSpellDedupeKey(r.name, r.level)));
    for (const row of pc.spells) {
      if (!row || row.level < 1) continue;
      const should = allowed.has(normalizeSpellDedupeKey(row.name, row.level));
      if (row.prepared !== should) changed = true;
      row.prepared = should;
    }
  }

  if (changed) {
    pc.spellbook_prep_enforced = true;
    // eslint-disable-next-line no-console
    console.warn(
      `enforceSpellbookPreparedCountPhb: prepared spell count adjusted to PHB wizard cap (${cap} = wizard level + INT modifier, min 1) for class "${String(pc.class).slice(0, 48)}" — spell slots are separate from prepared count.`
    );
  }
}

/**
 * PHB wizard level 1: 3 cantrips, 6 first-level spells in spellbook, 2 first-level slots.
 * Logs only; does not mutate (prompt compliance check for developers).
 * @param {object} pc
 */
function warnWizardLevel1SpellbookPhb(pc) {
  if (!pc || typeof pc !== 'object' || !Array.isArray(pc.spells)) return;
  if (spellRulesSpellbookKind(pc.class) !== 'wizard') return;
  const charLevel = Math.floor(Number(pc.level));
  if (!Number.isFinite(charLevel) || charLevel !== 1) return;
  const cantrips = pc.spells.filter((r) => r && r.level === 0).length;
  const l1 = pc.spells.filter((r) => r && r.level === 1).length;
  if (cantrips !== 3) {
    // eslint-disable-next-line no-console
    console.warn(
      `warnWizardLevel1SpellbookPhb: PHB expects 3 cantrips at wizard level 1; found ${cantrips} level-0 spells.`
    );
  }
  if (l1 !== 6) {
    // eslint-disable-next-line no-console
    console.warn(
      `warnWizardLevel1SpellbookPhb: PHB expects 6 first-level spells in the spellbook at wizard level 1; found ${l1} level-1 spells.`
    );
  }
  if (pc.spell_slots != null && typeof pc.spell_slots === 'object' && !Array.isArray(pc.spell_slots)) {
    const s1 = pc.spell_slots['1'];
    if (s1 != null && Number(s1) !== 2) {
      // eslint-disable-next-line no-console
      console.warn(
        `warnWizardLevel1SpellbookPhb: PHB expects 2 first-level wizard spell slots at level 1; spell_slots["1"] is ${s1}.`
      );
    }
  }
}

/**
 * @param {unknown} val
 * @param {{ spell_duplicate_levels_merged?: boolean }} [spellDiag] set `spell_duplicate_levels_merged` when rows merge
 */
function asSpellsArray(val, spellDiag) {
  if (!Array.isArray(val)) return [];
  const out = [];
  const seen = new Set();
  for (const item of val) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim();
    if (!name) continue;
    let level = Math.floor(Number(item.level));
    if (!Number.isFinite(level)) level = 0;
    level = Math.max(0, Math.min(9, level));
    const dk = normalizeSpellDedupeKey(name, level);
    if (seen.has(dk)) continue;
    seen.add(dk);
    const row = { name, level };
    if (level >= 1 && typeof item.prepared === 'boolean') {
      row.prepared = item.prepared;
    }
    out.push(row);
  }
  const { spells: collapsed, mergedDisplayNames } = collapseDuplicateSpellNamesAcrossLevels(out);
  if (mergedDisplayNames.length) {
    if (spellDiag && typeof spellDiag === 'object') {
      spellDiag.spell_duplicate_levels_merged = true;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `asSpellsArray: merged duplicate spell name at different levels (PHB: one level per spell): ${mergedDisplayNames
        .slice(0, 12)
        .join('; ')}${mergedDisplayNames.length > 12 ? '…' : ''}`
    );
  }
  return collapsed;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>|null}
 */
function normalizeSpellSlotsObject(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (let L = 1; L <= 9; L++) {
    const k = String(L);
    if (raw[k] == null) continue;
    const n = Math.floor(Number(raw[k]));
    if (Number.isFinite(n) && n >= 0) out[k] = Math.min(99, n);
  }
  return Object.keys(out).length ? out : null;
}

function asWeaponsArray(val) {
  let w = val;
  if (w == null) return [];
  if (typeof w === 'string') {
    try {
      w = JSON.parse(w);
    } catch (e) {
      return [];
    }
  }
  if (w && typeof w === 'object' && !Array.isArray(w)) w = [w];
  if (!Array.isArray(w)) return [];
  return w
    .filter((row) => row != null && typeof row === 'object')
    .map((row) => {
      const r = { ...row };
      r.name = String(r.name || '').trim();
      r.damage = damageToString(r.damage);
      if (r.attack_bonus !== undefined && r.attack_bonus !== null && r.attack_bonus !== '') {
        const n = Number(String(r.attack_bonus).trim().replace(/^\+/, ''));
        if (Number.isFinite(n)) r.attack_bonus = n;
      }
      return r;
    });
}

/**
 * Idempotent defaults for saved games: starting gold and a real garments line when unarmored.
 * Use on load/persist so older sheets and models that omit fields still get a correct display.
 * @param {object} pc
 * @param {{ language?: string }} [opts]
 * @returns {object}
 */
function ensurePlayerCharacterSheetDefaults(pc, opts) {
  if (!pc || typeof pc !== 'object') return pc;
  const language = opts && opts.language;
  const out = JSON.parse(JSON.stringify(pc));
  if (!String(out.name || '').trim() && out.identity && typeof out.identity === 'object' && out.identity.name != null) {
    const idName = String(out.identity.name || '').trim();
    if (idName) out.name = idName;
  }
  out.armor = asArmorArray(out.armor);
  out.equipment = asStringArray(out.equipment);
  out.tools = asStringArray(out.tools);
  const weaponsArr = asWeaponsArray(out.weapons);
  out.equipment = dedupeEquipmentAgainstWeapons(out.equipment, weaponsArr);
  out.tools = dedupeEquipmentAgainstWeapons(out.tools, weaponsArr);

  applyCoinageToPlayerCharacterInPlace(out);

  if (!hasBodyArmorLines(out.armor) && !equipmentHasBaseGarments(out.equipment)) {
    out.equipment = [defaultClothesLine(language), ...out.equipment];
  }

  if (out.languages == null) {
    out.languages = [];
  } else if (!Array.isArray(out.languages)) {
    out.languages = [String(out.languages)].filter(Boolean);
  } else {
    out.languages = out.languages.map((x) => String(x).trim()).filter(Boolean);
  }

  if (!out.languages.length) {
    out.languages = defaultLanguagesFallback(language);
    // eslint-disable-next-line no-console
    console.warn(
      'ensurePlayerCharacterSheetDefaults: missing languages; applied Common-only placeholder — regenerate character for full PHB list.'
    );
  }

  if (out.spells != null) {
    const spellDiag = {};
    out.spells = asSpellsArray(out.spells, spellDiag);
    if (spellDiag.spell_duplicate_levels_merged) {
      out.spell_duplicate_levels_merged = true;
    } else {
      delete out.spell_duplicate_levels_merged;
    }
    stripPreparedFromClassListPreparedCasters(out);
    inferKnownCasterL1PreparedWhenOverCap(out);
    warnWizardLevel1SpellbookPhb(out);
    enforceSpellbookPreparedCountPhb(out);
  } else {
    delete out.spell_prep_inferred;
    delete out.spellbook_prep_enforced;
    delete out.spell_duplicate_levels_merged;
  }

  return out;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateGeneratedPlayerCharacter(pc) {
  if (!pc || typeof pc !== 'object') return { ok: false, error: 'playerCharacter must be an object' };
 
  const nameTrim = String(pc.name || '').trim();
  if (!nameTrim) {
    return { ok: false, error: 'playerCharacter.name is required' };
  }

  if (pc.spell_prep_inferred != null && typeof pc.spell_prep_inferred !== 'boolean') {
    return { ok: false, error: 'playerCharacter.spell_prep_inferred must be a boolean when present.' };
  }
  if (pc.spellbook_prep_enforced != null && typeof pc.spellbook_prep_enforced !== 'boolean') {
    return { ok: false, error: 'playerCharacter.spellbook_prep_enforced must be a boolean when present.' };
  }
  if (pc.spell_duplicate_levels_merged != null && typeof pc.spell_duplicate_levels_merged !== 'boolean') {
    return {
      ok: false,
      error: 'playerCharacter.spell_duplicate_levels_merged must be a boolean when present.',
    };
  }

  const hp = Number(pc.max_hp);
  const ac = Number(pc.ac);
  if (!Number.isFinite(hp)) {
    return { ok: false, error: 'playerCharacter.max_hp must be a finite number' };
  }
  if (!Number.isFinite(ac)) {
    if (pc.ac != null && typeof pc.ac === 'object' && !Array.isArray(pc.ac)) {
      return {
        ok: false,
        error:
          'playerCharacter.ac must be a finite number (total AC), not an object. Put worn armor in playerCharacter.armor and weapon rows in playerCharacter.weapons per the character skill.',
      };
    }
    return { ok: false, error: 'playerCharacter.ac must be a finite number' };
  }

  if (!Array.isArray(pc.armor)) {
    return { ok: false, error: 'playerCharacter.armor must be an array (use [] if none).' };
  }
  for (let i = 0; i < pc.armor.length; i++) {
    const it = pc.armor[i];
    if (typeof it === 'string') {
      if (!String(it).trim()) {
        return { ok: false, error: `playerCharacter.armor[${i}] must be a non-empty string when a string.` };
      }
      continue;
    }
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      return { ok: false, error: `playerCharacter.armor[${i}] must be a string or object { name, optional ac_bonus, base_ac, ac }.` };
    }
    if (!String(it.name || '').trim()) {
      return { ok: false, error: `playerCharacter.armor[${i}].name is required when armor row is an object.` };
    }
    const optNum = (k) => {
      if (it[k] == null || it[k] === '') return true;
      const n = Number(String(it[k]).replace(/^\+/, ''));
      return Number.isFinite(n);
    };
    if (!optNum('ac_bonus') || !optNum('base_ac') || !optNum('ac')) {
      return {
        ok: false,
        error: `playerCharacter.armor[${i}]: ac_bonus, base_ac, and ac must be finite numbers when present.`,
      };
    }
  }
  if (!Array.isArray(pc.equipment)) {
    return { ok: false, error: 'playerCharacter.equipment must be an array (may be []).' };
  }
  if (!Array.isArray(pc.tools)) {
    return { ok: false, error: 'playerCharacter.tools must be an array (may be []).' };
  }
  for (let i = 0; i < pc.tools.length; i++) {
    if (!String(pc.tools[i] || '').trim()) {
      return { ok: false, error: `playerCharacter.tools[${i}] must be a non-empty string.` };
    }
  }
  if (!Array.isArray(pc.weapons)) {
    return { ok: false, error: 'playerCharacter.weapons must be an array (may be []).' };
  }

  const cur = pc.coinage;
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) {
    return { ok: false, error: 'playerCharacter.coinage must be an object { pp, gp, ep, sp, cp } (D&D 5e).' };
  }
  for (const k of CURRENCY_KEYS) {
    const n = Number(cur[k]);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: `playerCharacter.coinage.${k} must be a non-negative integer.` };
    }
  }

  if (!Array.isArray(pc.languages) || pc.languages.length === 0) {
    return {
      ok: false,
      error:
        'playerCharacter.languages must be a non-empty array of strings (D&D 5e PHB: derive from race, class, subclass, background at level 1).',
    };
  }
  for (let i = 0; i < pc.languages.length; i++) {
    if (!String(pc.languages[i] || '').trim()) {
      return { ok: false, error: `playerCharacter.languages[${i}] must be a non-empty string.` };
    }
  }

  const weapons = pc.weapons;
  for (let i = 0; i < weapons.length; i++) {
    const row = weapons[i];
    if (!row || typeof row !== 'object') return { ok: false, error: `weapons[${i}] must be an object` };
    if (!String(row.name || '').trim()) {
      return { ok: false, error: `weapons[${i}].name is required when weapons are listed` };
    }
    if (!DAMAGE_HAS_DICE.test(compactDamage(row.damage))) {
      return {
        ok: false,
        error: `weapons[${i}].damage must include dice (e.g. 1d8+2); got "${String(row.damage).slice(0, 80)}"`,
      };
    }
    const bonusRaw = row.attack_bonus == null ? '' : String(row.attack_bonus).trim().replace(/^\+/, '');
    if (bonusRaw === '' || Number.isNaN(Number(bonusRaw))) {
      return { ok: false, error: `weapons[${i}].attack_bonus must be a number` };
    }
  }

  if (pc.spells != null) {
    if (!Array.isArray(pc.spells)) {
      return { ok: false, error: 'playerCharacter.spells must be an array when present.' };
    }
    for (let i = 0; i < pc.spells.length; i++) {
      const s = pc.spells[i];
      if (!s || typeof s !== 'object') return { ok: false, error: `spells[${i}] must be an object` };
      if (!String(s.name || '').trim()) return { ok: false, error: `spells[${i}].name is required` };
      const lv = Math.floor(Number(s.level));
      if (!Number.isFinite(lv) || lv < 0 || lv > 9) {
        return { ok: false, error: `spells[${i}].level must be an integer 0–9 (0 = cantrip).` };
      }
      if (s.prepared != null) {
        if (typeof s.prepared !== 'boolean') {
          return { ok: false, error: `spells[${i}].prepared must be a boolean when present.` };
        }
        if (lv === 0) {
          return { ok: false, error: `spells[${i}].prepared must not be set on cantrips (level 0).` };
        }
      }
    }
  }

  if (pc.spell_slots != null) {
    if (typeof pc.spell_slots !== 'object' || Array.isArray(pc.spell_slots)) {
      return { ok: false, error: 'playerCharacter.spell_slots must be an object when present.' };
    }
    for (const k of Object.keys(pc.spell_slots)) {
      if (!/^[1-9]$/.test(k)) {
        return { ok: false, error: `playerCharacter.spell_slots keys must be "1"–"9"; got "${k}".` };
      }
      const n = Number(pc.spell_slots[k]);
      if (!Number.isInteger(n) || n < 0) {
        return { ok: false, error: `playerCharacter.spell_slots["${k}"] must be a non-negative integer.` };
      }
    }
  }

  return { ok: true };
}

module.exports = {
  validateGeneratedPlayerCharacter,
  ensurePlayerCharacterSheetDefaults,
  normalizeGearText,
  normalizeCoinAmount,
  normalizeCoinageObject,
  mergeCoinage,
  CURRENCY_KEYS,
};
