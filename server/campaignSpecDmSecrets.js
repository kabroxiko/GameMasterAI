/**
 * DM-only campaign fields: kept in DB and injected into server-side prompts, never sent to the client.
 */
const DM_ONLY_CAMPAIGN_KEYS = ['dmHiddenAdventureObjective', 'openingSceneFrame', 'creativeSeed'];

function redactCampaignSpecForClient(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const out = { ...spec };
  for (const k of DM_ONLY_CAMPAIGN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, k)) delete out[k];
  }
  return out;
}

function openingSceneFrameIsUsable(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const d = typeof obj.directive === 'string' ? obj.directive.trim() : '';
  return d.length >= 60;
}

/** Model-chosen per-run steering for campaign core (title, concept, conflicts); not player-facing. */
function creativeSeedIsUsable(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const mood = typeof obj.titleMood === 'string' ? obj.titleMood.trim() : '';
  if (mood.length < 4) return false;
  const prefer = obj.preferAngles;
  const avoid = obj.avoidRepeatedFantasyTropesThisRun;
  if (!Array.isArray(prefer) || prefer.filter((x) => String(x).trim()).length < 1) return false;
  if (!Array.isArray(avoid) || avoid.filter((x) => String(x).trim()).length < 2) return false;
  return true;
}

/**
 * When the client persists a campaignSpec snapshot (e.g. bootstrap), preserve DM-only keys already stored server-side.
 */
function mergeCampaignSpecPreservingDmSecrets(existingSpec, incomingSpec) {
  if (!incomingSpec || typeof incomingSpec !== 'object') return incomingSpec;
  const next = { ...incomingSpec };
  for (const k of DM_ONLY_CAMPAIGN_KEYS) {
    const prev = existingSpec && existingSpec[k];
    const inc = incomingSpec[k];
    if (k === 'openingSceneFrame') {
      if (openingSceneFrameIsUsable(prev) && !openingSceneFrameIsUsable(inc)) {
        next[k] = prev;
      }
      continue;
    }
    if (k === 'creativeSeed') {
      if (creativeSeedIsUsable(prev) && !creativeSeedIsUsable(inc)) {
        next[k] = prev;
      }
      continue;
    }
    const prevOk = typeof prev === 'string' && prev.trim();
    const incOk = typeof inc === 'string' && inc.trim();
    if (prevOk && !incOk) {
      next[k] = prev;
    }
  }
  return next;
}

/**
 * Slim object for initial DM inject: only data not already repeated in inject_initial prose lists
 * (title, concept, faction/NPC/location slices, conflicts, hidden objective). Opening frame is
 * injected via opening_frame_mandate; omit here. Keeps prompt tokens down vs full campaignSpec JSON.
 */
function slimCreativeSeedForInitialInject(seed) {
  if (!seed || typeof seed !== 'object' || !creativeSeedIsUsable(seed)) return null;
  const out = {
    titleMood: typeof seed.titleMood === 'string' ? seed.titleMood.trim().slice(0, 300) : '',
    preferAngles: Array.isArray(seed.preferAngles)
      ? seed.preferAngles.map((x) => String(x).trim().slice(0, 240)).filter(Boolean).slice(0, 8)
      : [],
    avoidRepeatedFantasyTropesThisRun: Array.isArray(seed.avoidRepeatedFantasyTropesThisRun)
      ? seed.avoidRepeatedFantasyTropesThisRun.map((x) => String(x).trim().slice(0, 160)).filter(Boolean).slice(0, 12)
      : [],
  };
  if (typeof seed.namingNote === 'string' && seed.namingNote.trim()) {
    out.namingNote = seed.namingNote.trim().slice(0, 400);
  }
  return out;
}

function buildInitialCampaignInjectSupplement(spec) {
  if (!spec || typeof spec !== 'object') return {};
  const slim = slimCreativeSeedForInitialInject(spec.creativeSeed);
  if (!slim) return {};
  return { creativeSeed: slim };
}

module.exports = {
  DM_ONLY_CAMPAIGN_KEYS,
  redactCampaignSpecForClient,
  mergeCampaignSpecPreservingDmSecrets,
  openingSceneFrameIsUsable,
  creativeSeedIsUsable,
  buildInitialCampaignInjectSupplement,
};
