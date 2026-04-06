#!/usr/bin/env node
/**
 * Delete GameState documents with no player-facing campaign title (same rule as LoadGame.vue:
 * empty/missing campaignSpec.title → UI shows raw gameId).
 *
 * Usage (from server/):
 *   node scripts/delete-games-without-campaign-title.js              # dry-run: count + sample ids
 *   node scripts/delete-games-without-campaign-title.js --apply      # delete matching rows
 *   node scripts/delete-games-without-campaign-title.js --apply --ownerUserId=<24hex>  # only that owner
 *
 * Loads DM_MONGODB_URI from server/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const GameState = require('../models/GameState');

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  let ownerUserId = null;
  for (const a of argv) {
    if (a.startsWith('--ownerUserId=')) ownerUserId = a.slice('--ownerUserId='.length).trim() || null;
  }
  return { apply, ownerUserId };
}

/** Mongo filter: no non-empty campaignSpec.title (matches client displayCampaignName fallback). */
function filterWithoutCampaignTitle(ownerOid) {
  const titleEmpty = {
    $or: [
      { campaignSpec: { $exists: false } },
      { campaignSpec: null },
      { 'campaignSpec.title': { $exists: false } },
      { 'campaignSpec.title': null },
      { 'campaignSpec.title': '' },
      { 'campaignSpec.title': { $regex: /^\s*$/ } },
    ],
  };
  if (!ownerOid) return titleEmpty;
  return { ...titleEmpty, ownerUserId: ownerOid };
}

async function main() {
  const { apply, ownerUserId } = parseArgs();
  let ownerOid = null;
  if (ownerUserId) {
    if (!mongoose.Types.ObjectId.isValid(ownerUserId)) {
      console.error('Invalid --ownerUserId ObjectId:', ownerUserId);
      process.exit(1);
    }
    ownerOid = new mongoose.Types.ObjectId(ownerUserId);
  }

  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const q = filterWithoutCampaignTitle(ownerOid);
  const total = await GameState.countDocuments(q);
  const sample = await GameState.find(q).select('gameId ownerUserId memberUserIds').limit(30).lean();

  console.log(
    JSON.stringify(
      {
        matchCount: total,
        ownerFilter: ownerUserId || null,
        sampleGameIds: sample.map((g) => g.gameId),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(
      `\nDry-run. ${total} game(s) would be deleted. Pass --apply to delete.` +
        (ownerUserId ? '' : ' Use --ownerUserId=<id> to limit to one account.')
    );
    await mongoose.disconnect();
    return;
  }

  const res = await GameState.deleteMany(q);
  console.log(`Deleted ${res.deletedCount} game state document(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
