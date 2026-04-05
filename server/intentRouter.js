const { generateResponse } = require('./openai-api');
const { loadPrompt, lastUserText } = require('./promptManager');

const PLAY_MODES = new Set(['exploration', 'combat', 'investigation', 'decision']);

function buildTranscriptForRouter(messages, maxMessages = 10) {
  if (!Array.isArray(messages)) return '';
  const slice = messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-maxMessages);
  return slice
    .map((m) => `${m.role}: ${String(m.content || '').slice(0, 360)}`)
    .join('\n');
}

function parseIntentResponse(raw) {
  if (raw == null || typeof raw !== 'string') throw new Error('intent_router: empty model output');
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const obj = JSON.parse(s);
  if (!obj || typeof obj !== 'object') throw new Error('intent_router: not an object');
  const stackPlayMode = PLAY_MODES.has(String(obj.stackPlayMode || '').toLowerCase())
    ? String(obj.stackPlayMode).toLowerCase()
    : 'exploration';
  return {
    stackPlayMode,
    declaresIncomingCombat: Boolean(obj.declaresIncomingCombat),
    socialDialogueOrNonViolent: Boolean(obj.socialDialogueOrNonViolent),
  };
}

function degradedIntent(source, errorMessage, raw = null) {
  return {
    stackPlayMode: 'exploration',
    declaresIncomingCombat: false,
    socialDialogueOrNonViolent: false,
    source,
    raw,
    error: errorMessage || 'intent_router_failed',
  };
}

/**
 * LLM classifies the latest player turn (PoC: no regex mode detection, no heuristic fallback).
 */
async function classifyPlayerIntent(args) {
  const { messages, language = 'English', gameId = null, clientMode = 'exploration', activeCombat = false } = args || {};

  if (activeCombat) {
    return {
      stackPlayMode: 'combat',
      declaresIncomingCombat: false,
      socialDialogueOrNonViolent: false,
      source: 'session_combat_active',
      raw: null,
      error: null,
    };
  }

  const cm = String(clientMode || '').toLowerCase();
  if (['combat', 'investigation', 'decision', 'initial'].includes(cm)) {
    return {
      stackPlayMode: cm === 'initial' ? 'exploration' : cm,
      declaresIncomingCombat: false,
      socialDialogueOrNonViolent: false,
      source: 'client_explicit_mode',
      raw: null,
      error: null,
    };
  }

  const lu = lastUserText(messages);
  if (!lu || !String(lu).trim()) {
    return {
      stackPlayMode: 'exploration',
      declaresIncomingCombat: false,
      socialDialogueOrNonViolent: false,
      source: 'empty_user_line',
      raw: null,
      error: null,
    };
  }

  const system = loadPrompt('rules/intent_router_system.txt');
  if (!system || !system.trim()) {
    const d = degradedIntent('config_error', 'intent_router_system.txt missing');
    await persistIntentDiagnostics(gameId, {
      intentRouterRaw: null,
      intentRouterAt: new Date().toISOString(),
      intentRouterError: d.error,
    });
    return d;
  }

  const transcript = buildTranscriptForRouter(messages);
  const userBlock = `Session language: ${language}\n\nRecent transcript (oldest of block first, newest last):\n${transcript}\n\n---\nLatest user line (primary signal):\n${lu}`;

  const routerModel = process.env.DM_INTENT_ROUTER_MODEL || process.env.DM_OPENAI_MODEL || 'gpt-3.5-turbo';

  let raw = null;
  try {
    raw = await generateResponse(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userBlock },
        ],
      },
      { max_tokens: 220, temperature: 0.1, gameId, model: routerModel }
    );
    if (!raw || !String(raw).trim()) {
      const d = degradedIntent('ai_error', 'intent router: empty model response', raw);
      await persistIntentDiagnostics(gameId, {
        intentRouterRaw: null,
        intentRouterAt: new Date().toISOString(),
        intentRouterError: d.error,
      });
      return d;
    }
    const parsed = parseIntentResponse(raw);
    await persistIntentDiagnostics(gameId, {
      intentRouterRaw: String(raw).slice(0, 4000),
      intentRouterAt: new Date().toISOString(),
      intentRouterError: null,
    });
    return { ...parsed, source: 'ai', raw, error: null };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const d = degradedIntent('ai_error', msg.slice(0, 2000), raw);
    await persistIntentDiagnostics(gameId, {
      intentRouterRaw: raw ? String(raw).slice(0, 4000) : null,
      intentRouterAt: new Date().toISOString(),
      intentRouterError: d.error,
    });
    return d;
  }
}

async function persistIntentDiagnostics(gameId, data) {
  if (!gameId) return;
  try {
    const GameState = require('./models/GameState');
    await GameState.findOneAndUpdate({ gameId }, { $set: data }, { upsert: false });
  } catch (e) {
    console.warn('intentRouter: failed to persist diagnostics', e);
  }
}

function playBeatFromIntent(language, intent) {
  if (!intent || intent.source !== 'ai' || !intent.socialDialogueOrNonViolent || intent.declaresIncomingCombat) {
    return null;
  }
  const es =
    '**Clasificación de intención (IA):** Interacción **social o exploratoria**, no ataque declarado. Avanza la escena y a los PNJ; no pidas arma ni mecánica de combate salvo daño explícito.';
  const en =
    '**AI intent classification:** **Social or exploratory** interaction, not a declared attack. Advance the scene and NPCs; do not ask for a weapon or combat mechanics unless the player clearly attempts harm.';
  return String(language || '').toLowerCase() === 'spanish' ? es : en;
}

module.exports = {
  classifyPlayerIntent,
  parseIntentResponse,
  buildTranscriptForRouter,
  playBeatFromIntent,
  degradedIntent,
};
