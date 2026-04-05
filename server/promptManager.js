const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');

const clientPromptsDir = path.join(__dirname, '../client/dungeonmaster/src/prompts');
const serverPromptsDir = path.join(__dirname, 'prompts');
const cache = {};

const CAMPAIGN_GENERATOR_REL = 'templates/campaign/generator.txt';

function resolvePromptRelativePath(filename) {
  if (!filename || typeof filename !== 'string') return filename;
  return filename.replace(/\\/g, '/');
}

/** Explicit violent / attack intent on the latest user line (Spanish + English). */
const LAST_USER_COMBAT_RE =
  /\b(ataco|atacar|ataca|atacáis|golpeo|golpear|golpea|golpeas|disparo|disparar|dispara|apuñalo|apuñalar|puñetazo|pateo|patear|empujo|empujar|arrojo|arrojar|lanzo|lanzar|desenvaino|desenvainar|desenfundo|desenfundar|mato|matar|hiereo|herir|derribo|derribar|acuchillo|acuchillar|corto|rajo|peleo|pelear|lucho|luchar|combate|iniciativa|daño|armadura|clase de armadura|tirada de ataque|tiro para golpear|bonificador de ataque|impacto|ajustar cuentas)\b|\b(attack|attacks|attacking|stab|stabs|shoot|shooting|punch|kick|draw my|i draw|fire at|swing at|hit him|hit her|slash|charge at|grapple|shove|combat|initiative|damage dealt|attack roll|roll to hit)\b/i;

function userMessageLooksCombat(text) {
  if (text == null || text === '') return false;
  return LAST_USER_COMBAT_RE.test(String(text).toLowerCase());
}

/** Strip accents for loose substring match (Spanish sheet names vs player typing). */
function normalizeForWeaponMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * True if the player message names at least one weapon from the sheet (substring match on weapon name words).
 */
function userMessageNamesWeaponFromSheet(userText, weapons) {
  if (!userText || !Array.isArray(weapons)) return false;
  const t = normalizeForWeaponMatch(userText);
  for (const w of weapons) {
    const rawName = String((w && w.name) || '').trim();
    if (!rawName) continue;
    const stripped = rawName.replace(/^\d+\s*[x×]\s*/i, '').trim();
    const n = normalizeForWeaponMatch(stripped);
    if (n.length >= 2 && t.includes(n)) return true;
    const words = n.split(/\s+/).filter((x) => x.length >= 3);
    for (const word of words) {
      if (t.includes(word)) return true;
    }
  }
  return false;
}

/**
 * When the PC has more than one weapon row, a vague attack ("ataco", "I attack") must NOT start combat until they name a weapon.
 * @param {{ treatAsCombatDeclared?: boolean }} [options] — when true (e.g. AI intent router), apply the same check without regex combat verbs.
 */
function blocksCombatEntryForAmbiguousWeapon(userText, generatedCharacter, options = {}) {
  const treat = Boolean(options.treatAsCombatDeclared);
  if (!treat && !userMessageLooksCombat(userText)) return false;
  const weapons =
    generatedCharacter && typeof generatedCharacter === 'object' && Array.isArray(generatedCharacter.weapons)
      ? generatedCharacter.weapons
      : [];
  if (weapons.length === 0) return true;
  if (weapons.length === 1) return false;
  return !userMessageNamesWeaponFromSheet(String(userText), weapons);
}

function languageInstructionForCompose(language) {
  const langFile =
    language && String(language).toLowerCase() === 'spanish'
      ? 'rules/language_spanish.txt'
      : 'rules/language_english.txt';
  return loadPrompt(langFile) || '';
}

function renderSkillPrompt(skillContent, language) {
  if (!skillContent || !skillContent.includes('{{')) return skillContent;
  const languageInstruction = languageInstructionForCompose(language);
  return Mustache.render(skillContent, { languageInstruction, language: language || 'English' });
}

function loadPrompt(filename) {
  const rel = resolvePromptRelativePath(filename);
  if (cache[rel]) return cache[rel];
  const serverPath = path.join(serverPromptsDir, rel);
  const clientPath = path.join(clientPromptsDir, path.basename(rel));
  try {
    // Prefer authoritative prompt files located on the server (keep AI prompt text centralized)
    if (fs.existsSync(serverPath)) {
      const content = fs.readFileSync(serverPath, 'utf8').trim();
      cache[rel] = content;
      return content;
    }
    if (fs.existsSync(clientPath)) {
      const content = fs.readFileSync(clientPath, 'utf8').trim();
      cache[rel] = content;
      return content;
    }
    console.warn('Prompt file missing (both server and client):', rel, filename !== rel ? `(requested as ${filename})` : '');
    cache[rel] = '';
    return '';
  } catch (e) {
    console.warn('Error loading prompt file:', rel, e);
    cache[rel] = '';
    return '';
  }
}

/**
 * Merged campaign metadata prompt: build-context block, then `---`, then Mustache user slice.
 * @returns {{ buildContext: string, userTemplate: string }}
 */
function loadCampaignGeneratorParts() {
  const full = loadPrompt(CAMPAIGN_GENERATOR_REL);
  const sep = '\n---\n';
  const idx = full.indexOf(sep);
  if (!full || !String(full).trim()) {
    return { buildContext: '', userTemplate: '' };
  }
  if (idx === -1) {
    return { buildContext: '', userTemplate: full.trim() };
  }
  return {
    buildContext: full.slice(0, idx).trim(),
    userTemplate: full.slice(idx + sep.length).trim(),
  };
}

/**
 * Compose system messages for the model.
 * - mode: 'exploration' | 'combat' | 'investigation' | 'decision' | 'initial'
 * - sessionSummary: short string (optional)
 * - includeFullSkill: boolean - if true, include the full skill prompt; otherwise include only a short reminder
 */
function composeSystemMessages({ mode = 'exploration', sessionSummary = '', includeFullSkill = false, language = 'English' } = {}) {
  const msgs = [];
  // core system always first
  const core = loadPrompt('core/system.txt');
  if (core) msgs.push({ role: 'system', content: core });

  // style/story
  const style = loadPrompt('core/style.txt');
  if (style) msgs.push({ role: 'system', content: style });

  // session memory (short)
  if (sessionSummary) {
    const memTemplate = loadPrompt('rules/memory_summary.txt');
    const mem = `${memTemplate}\n\nSession summary: ${sessionSummary}`;
    msgs.push({ role: 'system', content: mem });
  }

  // If we're generating the initial scene and a playerCharacter was provided in sessionSummary,
  // instruct the model NOT to include the character sheet in its reply. The server will display the sheet separately.
  if (mode === 'initial' && sessionSummary) {
    msgs.push({
      role: 'system',
      content:
        'Note: Character data is available to the server. DO NOT include a character sheet or full character stats in your response. The client renders the sheet separately. For length and structure, follow the dedicated adventure-seed system block supplied by the server.',
    });
  }

  // skill prompts: include only relevant one
  const skillMap = {
    combat: 'skills/combat.txt',
    investigation: 'skills/investigation.txt',
    decision: 'skills/decision.txt',
    initial: 'skills/adventure_seed.txt',
  };

  const skillFile = skillMap[mode];
  // No special pre-push for initial here; skill prompts are handled in the skillFile block below.
  if (skillFile) {
    const skillContent = loadPrompt(skillFile);
    // Opening adventure seed is merged in gameSession /generate with Mustache (languageInstruction).
    // Embedding skills/adventure_seed.txt here duplicates it and leaves {{{languageInstruction}}} unreplaced.
    const adventureSeedDeferred = mode === 'initial' && skillFile === 'skills/adventure_seed.txt';
    if (adventureSeedDeferred) {
      msgs.push({
        role: 'system',
        content:
          'Mode: initial. Follow the opening-scene instructions in the dedicated adventure-seed system block supplied by the server (do not assume they appear here).',
      });
    } else if (includeFullSkill && skillContent) {
      msgs.push({ role: 'system', content: renderSkillPrompt(skillContent, language) });
    } else {
      // short reminder
      msgs.push({ role: 'system', content: `Mode: ${mode}. Follow the ${mode} guidelines concisely.` });
    }
  }

  // language-specific prompt (e.g., language_spanish.txt or language_english.txt) - add last to ensure it overrides
  try {
    const langFile =
      language && language.toLowerCase() === 'spanish' ? 'rules/language_spanish.txt' : 'rules/language_english.txt';
    const langPrompt = loadPrompt(langFile);
    if (langPrompt) msgs.push({ role: 'system', content: langPrompt });
  } catch (e) {
    // ignore
  }
  // Append a general length guard to avoid overly long single replies
  try {
    const guard = loadPrompt('rules/length_guard.txt');
    if (guard) msgs.push({ role: 'system', content: guard });
  } catch (e) {
    // ignore
  }
  // decision behavior is enforced globally in core/system.txt (no explicit option lists)

  // Note: global language and core rules live in core/system.txt. Skill prompts contain focused guidance.

  return msgs;
}

function lastUserText(conversation = []) {
  if (!Array.isArray(conversation)) return '';
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m && m.role === 'user' && m.content) return String(m.content);
  }
  return '';
}

module.exports = {
  composeSystemMessages,
  loadPrompt,
  loadCampaignGeneratorParts,
  lastUserText,
  userMessageLooksCombat,
  blocksCombatEntryForAmbiguousWeapon,
};

