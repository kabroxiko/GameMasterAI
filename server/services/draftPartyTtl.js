/**
 * Draft parties: character generated but no substantive campaign yet (host never finished world setup).
 * MongoDB TTL on `draftPartyExpiresAt` removes abandoned rows. Multi-member games skip TTL so invites are safe.
 */
const { hasSubstantiveCampaignSpec } = require('../campaignSpecReady');

/** Default 10080 min = 7 days (same wall-clock default as the former days-based setting). */
const DEFAULT_DRAFT_PARTY_TTL_MINUTES = 7 * 24 * 60;

function draftPartyTtlMinutes() {
  const raw = process.env.DM_DRAFT_PARTY_TTL_MINUTES;
  if (raw === '0') return 0;
  const s = raw != null && String(raw).trim() !== '' ? String(raw).trim() : String(DEFAULT_DRAFT_PARTY_TTL_MINUTES);
  const minutes = parseFloat(s, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_DRAFT_PARTY_TTL_MINUTES;
  return minutes;
}

function draftPartyTtlMs() {
  const minutes = draftPartyTtlMinutes();
  if (minutes === 0) return 0;
  return Math.round(minutes * 60 * 1000);
}

function draftPartyExpiresAtFromNow() {
  const ms = draftPartyTtlMs();
  if (ms <= 0) return null;
  return new Date(Date.now() + ms);
}

/**
 * After a successful /generate-character persist: set TTL for single-member games without a campaign;
 * clear TTL if the game is multi-member or already has a substantive campaign.
 */
async function applyDraftPartyTtlAfterCharacterGen(gameId) {
  if (!gameId || draftPartyTtlMs() <= 0) return;
  const GameState = require('../models/GameState');
  const doc = await GameState.findOne({ gameId }).select('memberUserIds campaignSpec').lean();
  if (!doc) return;
  const m = Array.isArray(doc.memberUserIds) ? doc.memberUserIds.length : 0;
  const hasCamp = hasSubstantiveCampaignSpec(doc.campaignSpec);
  if (m <= 1 && !hasCamp) {
    const at = draftPartyExpiresAtFromNow();
    if (at) await GameState.updateOne({ gameId }, { $set: { draftPartyExpiresAt: at } });
  } else {
    await GameState.updateOne({ gameId }, { $unset: { draftPartyExpiresAt: 1 } });
  }
}

/**
 * After membership grows (e.g. invite join): remove draft TTL so the party is not auto-deleted while staging.
 */
async function clearDraftPartyTtlIfMultiMember(gameId) {
  if (!gameId) return;
  const GameState = require('../models/GameState');
  const doc = await GameState.findOne({ gameId }).select('memberUserIds').lean();
  if (!doc) return;
  const m = Array.isArray(doc.memberUserIds) ? doc.memberUserIds.length : 0;
  if (m >= 2) {
    await GameState.updateOne({ gameId }, { $unset: { draftPartyExpiresAt: 1 } });
  }
}

/**
 * After any persist that may have filled in campaignSpec: drop TTL once the campaign is substantive.
 */
async function clearDraftPartyTtlIfCampaignNowSubstantive(gameId) {
  if (!gameId) return;
  const GameState = require('../models/GameState');
  const doc = await GameState.findOne({ gameId }).select('campaignSpec').lean();
  if (doc && hasSubstantiveCampaignSpec(doc.campaignSpec)) {
    await GameState.updateOne({ gameId }, { $unset: { draftPartyExpiresAt: 1 } });
  }
}

module.exports = {
  draftPartyTtlMinutes,
  draftPartyTtlMs,
  draftPartyExpiresAtFromNow,
  applyDraftPartyTtlAfterCharacterGen,
  clearDraftPartyTtlIfMultiMember,
  clearDraftPartyTtlIfCampaignNowSubstantive,
};
