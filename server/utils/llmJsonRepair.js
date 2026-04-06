/**
 * Repairs a common local-LLM JSON mistake between array-of-objects elements: after a string value the model
 * emits backslash-quote-comma-brace (`\",{`) instead of closing the string, closing the object, then comma
 * and opening the next object (`"},{"`).
 *
 * Example (broken): `"significance":"...calles.\",{"name":"X"` (spurious `\` before the closing quote)
 * After repair: `"significance":"...calles."},{"name":"X"` (string closed, object closed, comma, next object)
 *
 * Safe for normal JSON: a legitimate `\",{` inside prose is extremely rare; this targets structural boundaries.
 */
function repairLlmJsonSpuriousEscapeBetweenArrayObjects(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/\\",\s*\{/g, '"' + '}' + ',' + '{');
}

/**
 * Some models (e.g. gpt-oss) omit the closing `"` before the outer object ends, e.g.
 * `{"openingSceneFrame":{"id":"x","directive":"...prose ending here.}}` — should be `...here."}}`.
 * Only runs when JSON.parse fails and the trimmed string ends with `.}}`, `!}}`, or `?}}` (sentence end, no closing `"`).
 *
 * @param {string} jsonStr
 * @returns {string|null} repaired JSON text if it becomes parseable, else null
 */
function repairMissingCloseQuoteBeforeTrailingObjectClose(jsonStr) {
  const t = String(jsonStr || '').trimEnd();
  if (!t) return null;
  try {
    JSON.parse(t);
    return null;
  } catch (_) {
    /* attempt repair */
  }
  if (!/[.!?](\}\})\s*$/.test(t)) return null;
  const candidate = t.replace(/([.!?])(\}\})\s*$/, (_, punct, braces) => `${punct}"${braces}`);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch (_) {
    return null;
  }
}

module.exports = {
  repairLlmJsonSpuriousEscapeBetweenArrayObjects,
  repairMissingCloseQuoteBeforeTrailingObjectClose,
};
