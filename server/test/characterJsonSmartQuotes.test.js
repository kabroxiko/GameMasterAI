/**
 * Regression: generate-character used to run normalizeJsonLikeQuotes before JSON.parse.
 * Smart quotes inside string fields (common in Spanish prose) became ASCII " and broke the JSON.
 * @see server/routes/gameSession.js tryParsePlayerCharacterBlob
 */
const { test } = require('node:test');
const assert = require('node:assert');

test('Unicode curly quotes inside JSON string values must remain parseable', () => {
  const backstory = 'apodo de \u201cel Maestro del Engaño\u201d en la ciudad';
  const blob = JSON.stringify({
    playerCharacter: {
      name: 'Borin',
      brief_backstory: backstory,
    },
  });
  const o = JSON.parse(blob);
  assert.ok(o.playerCharacter);
  assert.ok(String(o.playerCharacter.brief_backstory).includes('Maestro'));
});

test('Blind smart-quote to ASCII replacement corrupts valid JSON', () => {
  const backstory = 'apodo de \u201cel Maestro del Engaño\u201d';
  const blob = JSON.stringify({ playerCharacter: { name: 'Borin', brief_backstory: backstory } });
  const broken = blob.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
  assert.throws(() => JSON.parse(broken), /Expected ','|JSON/);
});
