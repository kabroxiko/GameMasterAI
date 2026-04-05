const { test } = require('node:test');
const assert = require('node:assert');
const { hasSubstantiveCampaignSpec } = require('../campaignSpecReady');

test('hasSubstantiveCampaignSpec false for empty / missing', () => {
  assert.strictEqual(hasSubstantiveCampaignSpec(null), false);
  assert.strictEqual(hasSubstantiveCampaignSpec(undefined), false);
  assert.strictEqual(hasSubstantiveCampaignSpec({}), false);
  assert.strictEqual(hasSubstantiveCampaignSpec([]), false);
});

test('hasSubstantiveCampaignSpec ignores dm-only key alone', () => {
  assert.strictEqual(hasSubstantiveCampaignSpec({ dmHiddenAdventureObjective: 'secret' }), false);
});

test('hasSubstantiveCampaignSpec true for title or stages', () => {
  assert.strictEqual(hasSubstantiveCampaignSpec({ title: 'X' }), true);
  assert.strictEqual(hasSubstantiveCampaignSpec({ factions: [{ name: 'A' }] }), true);
  assert.strictEqual(hasSubstantiveCampaignSpec({ title: ' ', factions: [] }), false);
});
