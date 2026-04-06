/**
 * Structured model replies: **YAML only** (YAML 1.2 includes JSON flow syntax, so a single `YAML.parse`
 * handles typical block-style YAML and compact flow mappings/sequences).
 */

const YAML = require('yaml');
const { prepareWireFormatText } = require('./llmTextPrepare');

function tryParseYamlObject(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    const doc = YAML.parse(t);
    if (doc != null && typeof doc === 'object' && !Array.isArray(doc)) {
      return doc;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/** Root may be a mapping or a sequence (campaign stages sometimes return a bare list). */
function tryParseYamlRoot(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    const doc = YAML.parse(t);
    if (doc != null && typeof doc === 'object') return doc;
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, obj: object } | { ok: false }}
 */
function parseModelStructuredObject(raw) {
  const prepared = prepareWireFormatText(raw);
  const obj = tryParseYamlObject(prepared);
  if (obj) return { ok: true, obj };
  return { ok: false };
}

/**
 * Campaign stage replies: wrapped mapping, or a root sequence/mapping.
 * @param {string} raw
 * @returns {{ ok: true, data: object | any[] } | { ok: false }}
 */
function parseCampaignStageModelOutput(raw) {
  const prepared = prepareWireFormatText(raw);
  const data = tryParseYamlRoot(prepared);
  if (data != null) return { ok: true, data };
  return { ok: false };
}

module.exports = {
  parseModelStructuredObject,
  parseCampaignStageModelOutput,
  tryParseYamlObject,
  tryParseYamlRoot,
  prepareWireFormatText,
};
