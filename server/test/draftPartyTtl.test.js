const { test } = require('node:test');
const assert = require('node:assert');

function loadDraftPartyTtl() {
  const p = require.resolve('../services/draftPartyTtl');
  delete require.cache[p];
  return require('../services/draftPartyTtl');
}

test('draftPartyTtlMinutes: default 10080 (7d) when env unset', () => {
  delete process.env.DM_DRAFT_PARTY_TTL_MINUTES;
  const { draftPartyTtlMinutes } = loadDraftPartyTtl();
  assert.strictEqual(draftPartyTtlMinutes(), 7 * 24 * 60);
});

test('draftPartyTtlMinutes: 0 disables TTL window', () => {
  process.env.DM_DRAFT_PARTY_TTL_MINUTES = '0';
  const { draftPartyTtlMinutes, draftPartyTtlMs } = loadDraftPartyTtl();
  assert.strictEqual(draftPartyTtlMinutes(), 0);
  assert.strictEqual(draftPartyTtlMs(), 0);
  delete process.env.DM_DRAFT_PARTY_TTL_MINUTES;
});

test('draftPartyTtlMinutes: parses custom minutes', () => {
  process.env.DM_DRAFT_PARTY_TTL_MINUTES = '120';
  const { draftPartyTtlMinutes } = loadDraftPartyTtl();
  assert.strictEqual(draftPartyTtlMinutes(), 120);
  delete process.env.DM_DRAFT_PARTY_TTL_MINUTES;
});
