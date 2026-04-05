#!/usr/bin/env node
/**
 * Print DM-only campaign fields for one game (not redacted — for operators / debugging).
 *
 * Primary secret: campaignSpec.dmHiddenAdventureObjective (stripped from client payloads).
 *
 * Usage (from server/):
 *   node scripts/query-campaign-hidden.js
 *   node scripts/query-campaign-hidden.js 1775330167551-40d0e0193385
 *   node scripts/query-campaign-hidden.js --json 1775330167551-40d0e0193385
 *
 * Loads DM_MONGODB_URI from server/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const GameState = require('../models/GameState');

const DEFAULT_GAME_ID = '1775330167551-40d0e0193385';

function parseArgs() {
  const argv = process.argv.slice(2).filter((a) => a !== '--json');
  const wantJson = process.argv.includes('--json');
  const gameId = argv[0] && String(argv[0]).trim() ? String(argv[0]).trim() : DEFAULT_GAME_ID;
  return { gameId, wantJson };
}

async function main() {
  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI is not set in server/.env');
    process.exit(1);
  }
  const { gameId, wantJson } = parseArgs();

  await mongoose.connect(uri);
  try {
    const doc = await GameState.findOne({ gameId })
      .select('gameId ownerUserId memberUserIds campaignSpec gameSetup.party')
      .lean();

    if (!doc) {
      console.error(`No GameState found for gameId: ${gameId}`);
      process.exit(1);
    }

    const spec = doc.campaignSpec && typeof doc.campaignSpec === 'object' ? doc.campaignSpec : {};
    const hidden =
      typeof spec.dmHiddenAdventureObjective === 'string' ? spec.dmHiddenAdventureObjective.trim() : '';

    const out = {
      gameId: doc.gameId,
      ownerUserId: doc.ownerUserId != null ? String(doc.ownerUserId) : null,
      memberUserIds: Array.isArray(doc.memberUserIds) ? doc.memberUserIds.map((id) => String(id)) : [],
      party: doc.gameSetup && doc.gameSetup.party ? doc.gameSetup.party : null,
      dmHiddenAdventureObjective: hidden || null,
      campaignTitle: spec.title != null ? String(spec.title) : null,
      campaignConcept: spec.campaignConcept != null ? String(spec.campaignConcept) : null,
      fullCampaignSpec: spec,
    };

    if (wantJson) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('gameId:', out.gameId);
      console.log('ownerUserId:', out.ownerUserId);
      console.log('memberUserIds:', out.memberUserIds.join(', ') || '(none)');
      if (out.party) console.log('party.phase:', out.party.phase != null ? String(out.party.phase) : '');
      console.log('campaignTitle:', out.campaignTitle || '(none)');
      console.log('campaignConcept:', out.campaignConcept || '(none)');
      console.log('');
      console.log('--- dmHiddenAdventureObjective (DM-only) ---');
      console.log(hidden || '(empty or missing)');
      console.log('');
      console.log('--- full campaignSpec (JSON) ---');
      console.log(JSON.stringify(spec, null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
