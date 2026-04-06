const { test } = require('node:test');
const assert = require('node:assert');
const {
  repairLlmJsonSpuriousEscapeBetweenArrayObjects,
  repairMissingCloseQuoteBeforeTrailingObjectClose,
} = require('../utils/llmJsonRepair');

test('repairLlmJsonSpuriousEscapeBetweenArrayObjects: gpt-oss style keyLocations break', () => {
  const broken = `{"keyLocations":[{"name":"A","type":"t","significance":"Texto en español.\\",{"name":"B","type":"t2","significance":"x"}]}`;
  const fixed = repairLlmJsonSpuriousEscapeBetweenArrayObjects(broken);
  const o = JSON.parse(fixed);
  assert.strictEqual(o.keyLocations.length, 2);
  assert.strictEqual(o.keyLocations[0].significance, 'Texto en español.');
  assert.strictEqual(o.keyLocations[1].name, 'B');
});

test('repair: idempotent on valid JSON', () => {
  const ok = '{"a":[{"x":1},{"y":2}]}';
  assert.strictEqual(repairLlmJsonSpuriousEscapeBetweenArrayObjects(ok), ok);
});

test('repairMissingCloseQuoteBeforeTrailingObjectClose: gpt-oss openingSceneFrame omits directive close quote', () => {
  const broken =
    '{"openingSceneFrame":{"id":"cloudspire_bazaar_alarm","directive":"The scene opens. The air crackles at the market gates.}}';
  assert.throws(() => JSON.parse(broken));
  const fixed = repairMissingCloseQuoteBeforeTrailingObjectClose(broken);
  assert.ok(fixed);
  const o = JSON.parse(fixed);
  assert.ok(o.openingSceneFrame);
  assert.strictEqual(o.openingSceneFrame.id, 'cloudspire_bazaar_alarm');
  assert.ok(String(o.openingSceneFrame.directive).includes('market gates'));
});

test('repairMissingCloseQuoteBeforeTrailingObjectClose: null when already valid', () => {
  const ok =
    '{"openingSceneFrame":{"id":"x","directive":"Enough characters here to be a real directive for the opening scene frame."}}';
  assert.strictEqual(repairMissingCloseQuoteBeforeTrailingObjectClose(ok), null);
});
