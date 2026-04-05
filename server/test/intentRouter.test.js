process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseIntentResponse, degradedIntent } = require('../intentRouter');

test('parseIntentResponse: plain JSON', () => {
  const r = parseIntentResponse(
    '{"stackPlayMode":"exploration","declaresIncomingCombat":false,"socialDialogueOrNonViolent":true}'
  );
  assert.strictEqual(r.stackPlayMode, 'exploration');
  assert.strictEqual(r.declaresIncomingCombat, false);
  assert.strictEqual(r.socialDialogueOrNonViolent, true);
});

test('parseIntentResponse: fenced JSON', () => {
  const r = parseIntentResponse('```json\n{"stackPlayMode":"combat","declaresIncomingCombat":true,"socialDialogueOrNonViolent":false}\n```');
  assert.strictEqual(r.stackPlayMode, 'combat');
  assert.strictEqual(r.declaresIncomingCombat, true);
});

test('parseIntentResponse: invalid mode defaults to exploration', () => {
  const r = parseIntentResponse('{"stackPlayMode":"nope","declaresIncomingCombat":false,"socialDialogueOrNonViolent":false}');
  assert.strictEqual(r.stackPlayMode, 'exploration');
});

test('degradedIntent: safe defaults', () => {
  const r = degradedIntent('ai_error', 'timeout');
  assert.strictEqual(r.stackPlayMode, 'exploration');
  assert.strictEqual(r.declaresIncomingCombat, false);
  assert.strictEqual(r.socialDialogueOrNonViolent, false);
  assert.strictEqual(r.source, 'ai_error');
});
