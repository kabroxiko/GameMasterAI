/**
 * Normalization before YAML.parse (BOM, channel tags, fences, smart quotes).
 */

function normalizeJsonLikeQuotes(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'");
}

function stripBomAndInvisible(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/^\uFEFF/, '').replace(/^[\u200B-\u200D\uFEFF]+/, '');
}

/**
 * Prefer ```yaml``` fence, else strip generic ``` ... ``` (including ```json``` wrappers).
 */
function stripMarkdownCodeFence(s) {
  if (!s || typeof s !== 'string') return s;
  let t = s.trim();
  if (/^```ya?ml\b/i.test(t)) {
    return t.replace(/^```ya?ml\b\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }
  if (/^```/.test(t)) {
    return t.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }
  return t;
}

function stripLlmChannelNoise(s) {
  if (!s || typeof s !== 'string') return s;
  let t = s.trim();
  const msgIdx = t.search(/<\|message\|\>/i);
  if (msgIdx !== -1) {
    t = t.slice(msgIdx).replace(/^<\|message\|\>\s*/i, '').trim();
  }
  let guard = 0;
  while (guard < 24 && /^<\|[^|]+\|\>\s*/i.test(t)) {
    t = t.replace(/^<\|[^|]+\|\>\s*/i, '').trim();
    guard += 1;
  }
  t = t.replace(/^<\|channel\|\>[^\n]*\n?/gi, '').trim();
  return t;
}

/** BOM → Harmony tags → markdown code fence → smart quotes (helps quoted YAML scalars). */
function prepareWireFormatText(raw) {
  let t = stripBomAndInvisible(String(raw));
  t = stripLlmChannelNoise(t);
  t = stripMarkdownCodeFence(t);
  t = normalizeJsonLikeQuotes(t);
  return t;
}

module.exports = {
  normalizeJsonLikeQuotes,
  stripBomAndInvisible,
  stripMarkdownCodeFence,
  stripLlmChannelNoise,
  prepareWireFormatText,
};
