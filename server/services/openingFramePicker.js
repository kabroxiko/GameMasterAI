/**
 * Resolves the opening-scene mandate for mode: initial from campaign generation output only.
 * There is no server-side fallback: missing or invalid `campaignSpec.openingSceneFrame` must be handled by the route (422).
 */
const { openingSceneFrameIsUsable } = require('../campaignSpecDmSecrets');

/**
 * @param {object|null|undefined} campaignSpec
 * @returns {{ id: string, directive: string } | null}
 */
function resolveOpeningMandateFromCampaign(campaignSpec) {
  const fr = campaignSpec && campaignSpec.openingSceneFrame;
  if (!openingSceneFrameIsUsable(fr)) return null;
  let id = typeof fr.id === 'string' && fr.id.trim() ? fr.id.trim().slice(0, 48) : 'campaign_opening';
  id = id.replace(/[^\w-]/g, '_').slice(0, 48) || 'campaign_opening';
  return {
    id,
    directive: fr.directive.trim().slice(0, 4000),
  };
}

module.exports = { resolveOpeningMandateFromCampaign };
