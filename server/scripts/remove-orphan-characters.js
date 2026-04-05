#!/usr/bin/env node
/**
 * Remove orphan player character sheets from GameState.gameSetup.playerCharacters.
 *
 * A sheet is "orphan" when its object key (Mongo userId string) is neither the document's
 * ownerUserId nor any id in memberUserIds. This can happen after partial membership cleanup
 * or data repair. Conversation lines may still reference old userIds; this script only
 * strips the stored sheets.
 *
 * Usage (from server/):
 *   node scripts/remove-orphan-characters.js
 *   node scripts/remove-orphan-characters.js --apply
 *   node scripts/remove-orphan-characters.js --gameId=<gameId>
 *   node scripts/remove-orphan-characters.js --json
 *
 * Default: dry-run (lists removals). Pass --apply to write $unset updates.
 * Loads DM_MONGODB_URI from server/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const GameState = require('../models/GameState');

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const asJson = argv.includes('--json');
  let gameId = null;
  for (const a of argv) {
    if (a.startsWith('--gameId=')) gameId = a.slice('--gameId='.length).trim() || null;
  }
  return { apply, asJson, gameId };
}

function allowedPartyIdSet(doc) {
  const ids = new Set();
  if (doc.ownerUserId != null) ids.add(String(doc.ownerUserId));
  if (Array.isArray(doc.memberUserIds)) {
    for (const m of doc.memberUserIds) {
      if (m != null) ids.add(String(m));
    }
  }
  return ids;
}

function listOrphanKeys(doc) {
  const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
  const pcMap = gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters)
    ? gs.playerCharacters
    : {};
  const allowed = allowedPartyIdSet(doc);
  const keys = Object.keys(pcMap);
  if (allowed.size === 0 && keys.length > 0) {
    return { orphanKeys: [], skip: true, reason: 'no owner and no members — skipped (ambiguous)' };
  }
  const orphanKeys = keys.filter((k) => !allowed.has(String(k)));
  return { orphanKeys, skip: false, reason: '' };
}

async function main() {
  const { apply, asJson, gameId } = parseArgs();
  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const report = [];
  let updated = 0;
  let skippedDocs = 0;

  try {
    const filter = gameId ? { gameId: String(gameId).trim() } : {};
    const cursor = GameState.find(filter).select('gameId ownerUserId memberUserIds gameSetup').cursor();

    for await (const doc of cursor) {
      const { orphanKeys, skip, reason } = listOrphanKeys(doc);
      if (skip) {
        skippedDocs += 1;
        report.push({
          gameId: doc.gameId,
          action: 'skipped',
          reason,
        });
        continue;
      }
      if (orphanKeys.length === 0) continue;

      const entry = {
        gameId: doc.gameId,
        action: apply ? 'removed' : 'would_remove',
        orphanUserIds: orphanKeys,
      };
      report.push(entry);

      if (apply) {
        const $unset = {};
        for (const k of orphanKeys) {
          $unset[`gameSetup.playerCharacters.${k}`] = '';
        }
        await GameState.updateOne({ _id: doc._id }, { $unset });
        updated += 1;
      }
    }

    const summary = {
      dryRun: !apply,
      gamesTouched: report.filter((r) => r.orphanUserIds && r.orphanUserIds.length).length,
      documentsSkippedNoParty: skippedDocs,
      updatesWritten: apply ? updated : 0,
      details: report.filter((r) => r.orphanUserIds && r.orphanUserIds.length),
    };

    if (asJson) {
      console.log(JSON.stringify({ ...summary, fullReport: report }, null, 2));
    } else {
      console.log(
        apply ? `Applied: ${updated} game document(s) updated.` : `Dry-run: ${summary.gamesTouched} game(s) have orphan sheets.`
      );
      if (skippedDocs) console.log(`Skipped ${skippedDocs} game(s) with playerCharacters but empty owner+members.`);
      for (const r of summary.details) {
        console.log(`  ${r.gameId}: ${r.orphanUserIds.join(', ')}`);
      }
      if (!apply && summary.gamesTouched) {
        console.log('\nRe-run with --apply to remove those playerCharacters keys from MongoDB.');
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
