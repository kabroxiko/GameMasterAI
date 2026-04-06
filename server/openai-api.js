const axios = require('axios');

const DEFAULT_MODEL = process.env.DM_OPENAI_MODEL || 'gpt-3.5-turbo';
const USE_LM_STUDIO = String(process.env.DM_USE_LM_STUDIO || 'false').toLowerCase() === 'true';
// LM Studio commonly listens on :1234 in logs; default to that
const LM_STUDIO_URL = process.env.DM_LM_STUDIO_URL || 'http://localhost:1234';
const LM_STUDIO_MODEL = process.env.DM_LM_STUDIO_MODEL || process.env.DM_OPENAI_MODEL || 'gpt-3.5-turbo';

/** Last failure reason for routes to surface when `generateResponse` returns null (not secrets). */
let lastGenerateFailureMessage = '';

function summarizeAxiosError(err) {
  if (!err) return 'Unknown error';
  const d = err.response?.data;
  if (d != null) {
    try {
      return typeof d === 'string' ? d.slice(0, 800) : JSON.stringify(d).slice(0, 800);
    } catch (e) {
      return String(d).slice(0, 800);
    }
  }
  return String(err.message || err.code || err).slice(0, 800);
}

function getLastGenerateFailureMessage() {
  return lastGenerateFailureMessage;
}

/** If the gateway already parsed JSON mode output into an object, re-serialize for downstream JSON.parse. */
function stringifyIfPlayerCharacterRoot(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.playerCharacter != null && typeof obj.playerCharacter === 'object') {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** One segment inside message.content (string | object | nested array). */
function assistantContentPartToString(part) {
  if (part == null) return '';
  if (typeof part === 'string') return part;
  if (typeof part === 'number' || typeof part === 'boolean') return String(part);
  if (Array.isArray(part)) return part.map(assistantContentPartToString).join('');
  if (typeof part === 'object') {
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (typeof part.output === 'string') return part.output;
    if (typeof part.value === 'string') return part.value;
    if (part.delta && typeof part.delta.content === 'string') return part.delta.content;
    if (part.message && typeof part.message.content === 'string') return part.message.content;
    if (part.content != null && typeof part.content !== 'string') {
      const inner = normalizeAssistantContent(part.content);
      if (inner) return inner;
    }
    const sj = stringifyIfPlayerCharacterRoot(part);
    if (sj) return sj;
    try {
      const keys = Object.keys(part);
      if (keys.length === 1) {
        const v = part[keys[0]];
        if (typeof v === 'string') return v;
        if (v != null && typeof v === 'object') {
          const nested = stringifyIfPlayerCharacterRoot(v);
          if (nested) return nested;
        }
      }
    } catch (e) {
      /* ignore */
    }
  }
  return '';
}

function isReasoningLikeSegment(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
  const t = String(part.type || '').toLowerCase();
  return t === 'reasoning' || t === 'thinking' || t === 'chain_of_thought';
}

/**
 * LM Studio and similar APIs may append reasoning blocks before the real assistant text. We never use that
 * content: drop those array elements and join the rest so JSON extraction does not see stray `{` inside reasoning.
 *
 * @returns {string|null|undefined} non-empty string if usable text remains after omission; `null` if only
 *   reasoning (or empty) segments were present; `undefined` if the array had no reasoning segments (caller
 *   should use the default join-all path).
 */
function assistantContentArrayOmitReasoning(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  if (!parts.some(isReasoningLikeSegment)) return undefined;
  const kept = parts.filter((p) => !isReasoningLikeSegment(p));
  const joined = kept.map(assistantContentPartToString).join('');
  const t = joined.trim();
  if (t.length) return joined;
  return null;
}

/**
 * OpenAI-compatible APIs may return message.content as a string, a parsed object (JSON mode), or an array of parts.
 * Some gateways use non-standard keys; without coercion the route sees "[object Object]" and parse fails.
 */
function normalizeAssistantContent(content) {
  if (content == null) return null;
  if (typeof content === 'string') {
    const t = content.trim();
    return t.length ? content : null;
  }
  if (Array.isArray(content)) {
    const withoutReasoning = assistantContentArrayOmitReasoning(content);
    if (withoutReasoning !== undefined) return withoutReasoning;
    const joined = content.map(assistantContentPartToString).join('');
    const t = joined.trim();
    if (t.length) return joined;
    for (const part of content) {
      const sj = part && typeof part === 'object' && !Array.isArray(part) ? stringifyIfPlayerCharacterRoot(part) : null;
      if (sj) return sj;
    }
    return null;
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') {
      const t = content.text.trim();
      return t.length ? content.text : null;
    }
    const root = stringifyIfPlayerCharacterRoot(content);
    if (root) return root;
    try {
      const s = JSON.stringify(content);
      if (s.length > 2) return s;
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}

/** Ensure we never return a non-string to routes that pass output to JSON parsers. */
function coerceAssistantOutputToString(raw) {
  if (raw == null) return null;
  const n = normalizeAssistantContent(raw);
  if (n) return n;
  if (typeof raw === 'string' && raw.trim()) return raw;
  try {
    if (typeof raw === 'object') return JSON.stringify(raw);
  } catch (e) {
    /* ignore */
  }
  return null;
}

/**
 * generateResponse accepts either:
 *  - { messages: [...] } (array of chat messages), or
 *  - { prompt: "string" } (simple prompt)
 *
 * options.response_format (e.g. { type: 'json_object' }) is forwarded to OpenAI-compatible
 * /v1/chat/completions when set.
 *
 * options.failureMessageRef — optional `{ message: string }`; when set, errors are written only
 * there (not the module global), so concurrent requests do not clobber each other's diagnostics.
 *
 * Supports two backends:
 *  - LM Studio (local) when USE_LM_STUDIO=true
 *  - OpenAI REST API otherwise
 */
async function generateResponse(input = {}, options = {}) {
  const failureRef =
    options.failureMessageRef && typeof options.failureMessageRef === 'object'
      ? options.failureMessageRef
      : null;
  const setFailure = (msg) => {
    if (failureRef) failureRef.message = msg;
    else lastGenerateFailureMessage = msg;
  };
  const clearFailure = () => {
    if (failureRef) failureRef.message = '';
    else lastGenerateFailureMessage = '';
  };
  const okReturn = (content) => {
    clearFailure();
    return content;
  };
  clearFailure();
  const model = options.model || process.env.DM_OPENAI_MODEL || DEFAULT_MODEL;
  const messages = Array.isArray(input.messages)
    ? input.messages
    : [{ role: 'user', content: input.prompt || '' }];
  const { gameId = null } = options;

  // Helper: persist fallback/diagnostic info to GameState when gameId is available
  async function persistDiagnostic(data = {}) {
    if (!gameId) return;
    try {
      const GameState = require('./models/GameState');
      await GameState.findOneAndUpdate({ gameId }, { $set: data }, { upsert: true });
    } catch (e) {
      console.warn('Failed to persist LLM diagnostic for gameId', gameId, e);
    }
  }

  // Convert chat messages to a single prompt for LM Studio
  const messagesToPrompt = (msgs) =>
    msgs
      .map((m) => {
        const c = normalizeAssistantContent(m.content);
        return `${m.role.toUpperCase()}: ${c || ''}`;
      })
      .join('\n\n');

  if (USE_LM_STUDIO) {
    // Prefer OpenAI-compatible chat completions endpoint that LM Studio exposes
    const base = LM_STUDIO_URL.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };

    // 1) Try OpenAI-compatible /v1/chat/completions
    try {
      const payload = {
        model: options.model || LM_STUDIO_MODEL,
        messages,
        max_tokens: options.max_tokens || 500,
        temperature: options.temperature ?? 1.0,
      };
      // LM Studio rejects OpenAI's `{ type: 'json_object' }` (expects `json_schema` or `text` only).
      if (options.response_format && typeof options.response_format === 'object') {
        const t = options.response_format.type;
        if (t === 'json_schema' || t === 'text') {
          payload.response_format = options.response_format;
        } else if (t === 'json_object') {
          /* omit — prompts + server-side parse enforce JSON */
        } else {
          payload.response_format = options.response_format;
        }
      }
      const resp = await axios.post(`${base}/v1/chat/completions`, payload, { headers });
      const data = resp.data || {};
      const raw =
        data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? null;
      const content = normalizeAssistantContent(raw);
      if (content) return okReturn(content);
      const coercedRaw = coerceAssistantOutputToString(raw);
      if (coercedRaw) return okReturn(coercedRaw);
      // fallthrough if unexpected shape
    } catch (err) {
      setFailure(summarizeAxiosError(err));
      console.error('LM Studio /v1/chat/completions failed:', err?.response?.data ?? err.message ?? err);
      await persistDiagnostic({ llmCallError: String(err?.response?.data ?? err.message ?? err).slice(0, 200000), llmCallFallbackAt: new Date().toISOString() });
    }

    // 2) Try LM Studio native chat endpoint /api/v1/chat
    try {
      // LM Studio native endpoint often expects an `input` string rather than OpenAI-style `messages`.
      const payload = {
        model: options.model || LM_STUDIO_MODEL,
        input: messagesToPrompt(messages),
        /* LM Studio native /api/v1/chat may not accept OpenAI-style `max_tokens` parameter.
           Omit max_tokens to avoid unrecognized key errors; rely on model defaults or use server-side truncation. */
        temperature: options.temperature ?? 1.0,
      };
      const resp = await axios.post(`${base}/api/v1/chat`, payload, { headers });
      const data = resp.data || {};
      // Common LM Studio shapes: data.output, data.result, data.generated_text, data.choices
      const result =
        data.output ||
        data.result ||
        data.generated_text ||
        (Array.isArray(data.results) && (data.results[0]?.text || data.results[0]?.output)) ||
        (data.choices && data.choices[0]?.text) ||
        (data?.response && data.response?.generated_text) ||
        null;
      const coerced = coerceAssistantOutputToString(result);
      if (coerced) return okReturn(coerced);
      const keys = data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data;
      console.warn('LM Studio /api/v1/chat: no text in expected fields; response keys:', keys);
      const prevMsg = failureRef ? failureRef.message : lastGenerateFailureMessage;
      setFailure(
        prevMsg ||
          `LM Studio responded but no model text was found (check loaded model and /api/v1/chat vs /v1/chat/completions). Keys: ${keys}`
      );
      return null;
    } catch (err) {
      setFailure(summarizeAxiosError(err));
      console.error('LM Studio /api/v1/chat failed:', err?.response?.data ?? err.message ?? err);
      await persistDiagnostic({ llmCallError: String(err?.response?.data ?? err.message ?? err).slice(0, 200000), llmCallFallbackAt: new Date().toISOString() });
      return null;
    }
  }

  // Fallback to OpenAI REST API
  const callOpenAI = async (useModel) => {
    const payload = {
      model: useModel,
      messages,
      max_tokens: options.max_tokens || 500,
      temperature: options.temperature ?? 1.0,
    };
    if (options.response_format && typeof options.response_format === 'object') {
      payload.response_format = options.response_format;
    }
    const headers = {
    Authorization: `Bearer ${process.env.DM_OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const resp = await axios.post('https://api.openai.com/v1/chat/completions', payload, { headers });
    const raw = resp.data?.choices?.[0]?.message?.content ?? null;
    return (
      normalizeAssistantContent(raw) ?? coerceAssistantOutputToString(raw)
    );
  };

  try {
    const out = await callOpenAI(model);
    if (out) return okReturn(out);
    setFailure('OpenAI returned no assistant message (empty choices).');
    return null;
  } catch (err) {
    setFailure(summarizeAxiosError(err));
    console.error('Error generating text (primary):', err?.response?.data ?? err.message ?? err);
    await persistDiagnostic({ llmCallError: String(err?.response?.data ?? err.message ?? err).slice(0, 200000), llmCallStartedAt: new Date().toISOString() });
    const code = err?.response?.data?.error?.code || '';
    const msg = String(err?.response?.data?.error?.message || err.message || '').toLowerCase();

    // If model unavailable or insufficient quota, try fallback to gpt-3.5-turbo
    if ((code === 'model_not_found' || code === 'insufficient_quota' || /model not found|insufficient_quota|quota/i.test(msg)) && model !== 'gpt-3.5-turbo') {
      try {
        // record that we're attempting a fallback
        await persistDiagnostic({ llmFallbackModel: 'gpt-3.5-turbo', llmFallbackAttemptedAt: new Date().toISOString() });
        const fallbackResp = await callOpenAI('gpt-3.5-turbo');
        if (fallbackResp) {
          await persistDiagnostic({ llmFallbackSucceededAt: new Date().toISOString(), llmModelUsed: 'gpt-3.5-turbo' });
        } else {
          await persistDiagnostic({ llmFallbackSucceededAt: null });
        }
        return fallbackResp ? okReturn(fallbackResp) : null;
      } catch (e2) {
        setFailure(summarizeAxiosError(e2));
        console.error('Fallback to gpt-3.5-turbo failed:', e2?.response?.data ?? e2.message ?? e2);
        await persistDiagnostic({ llmFallbackError: String(e2?.response?.data ?? e2.message ?? e2).slice(0, 200000) });
      }
    }
    return null;
  }
}

module.exports = { generateResponse, getLastGenerateFailureMessage };
