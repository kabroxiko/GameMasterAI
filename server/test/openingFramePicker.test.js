/**
 * @see server/services/openingFramePicker.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveOpeningMandateFromCampaign } = require('../services/openingFramePicker');

test('resolveOpeningMandateFromCampaign returns mandate when openingSceneFrame is valid', () => {
  const longDirective =
    'This is a DM-only briefing that is long enough to pass validation for the opening scene frame stage.';
  const r = resolveOpeningMandateFromCampaign({
    openingSceneFrame: { id: 'wharf_night', directive: longDirective },
  });
  assert.ok(r);
  assert.strictEqual(r.id, 'wharf_night');
  assert.ok(r.directive.includes('briefing'));
});

test('resolveOpeningMandateFromCampaign returns null when directive too short or missing', () => {
  assert.strictEqual(
    resolveOpeningMandateFromCampaign({ openingSceneFrame: { id: 'x', directive: 'short' } }),
    null
  );
  assert.strictEqual(resolveOpeningMandateFromCampaign({}), null);
  assert.strictEqual(resolveOpeningMandateFromCampaign(null), null);
});
