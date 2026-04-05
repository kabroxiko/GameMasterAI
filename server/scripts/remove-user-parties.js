#!/usr/bin/env node
/**
 * Remove all party (GameState) involvement for a user:
 * 1) Deletes every game where they are owner (full document removed).
 * 2) Removes them from memberUserIds and gameSetup.playerCharacters on other games.
 *
 * Usage (from server/):
 *   node scripts/remove-user-parties.js --userId=69d036af09db12890806aa92
 *   node scripts/remove-user-parties.js --userId=69d036af09db12890806aa92 --apply
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
  let userId = null;
  for (const a of argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || null;
  }
  return { apply, userId };
}

function idStr(x) {
  if (x == null) return '';
  return String(x);
}

async function main() {
  const { apply, userId } = parseArgs();
  if (!userId) {
    console.error('Missing --userId=<24 hex Mongo ObjectId>');
    process.exit(1);
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.error('Invalid ObjectId:', userId);
    process.exit(1);
  }
  const oid = new mongoose.Types.ObjectId(userId);
  const uidS = String(oid);

  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const owned = await GameState.find({ ownerUserId: oid })
    .select('gameId ownerUserId memberUserIds')
    .lean();

  const asMemberOnly = await GameState.find({
    memberUserIds: oid,
    ownerUserId: { $ne: oid },
  })
    .select('+inviteToken gameId ownerUserId memberUserIds gameSetup inviteToken inviteTokenCreatedAt')
    .lean();

  console.log(
    JSON.stringify(
      {
        userId: uidS,
        ownedGamesToDelete: owned.map((g) => g.gameId),
        memberOfGamesToUpdate: asMemberOnly.map((g) => g.gameId),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(
      `\nDry-run. Owned: ${owned.length} delete(s), member-only: ${asMemberOnly.length} update(s). Pass --apply to write.`
    );
    await mongoose.disconnect();
    return;
  }

  const delRes = await GameState.deleteMany({ ownerUserId: oid });
  console.log(`Deleted ${delRes.deletedCount} game(s) owned by user.`);

  let updated = 0;
  for (const row of asMemberOnly) {
    const doc = await GameState.findById(row._id).select('+inviteToken');
    if (!doc) continue;
    const members = Array.isArray(doc.memberUserIds) ? doc.memberUserIds : [];
    doc.memberUserIds = members.filter((m) => idStr(m) !== uidS);
    if (!doc.gameSetup || typeof doc.gameSetup !== 'object') doc.gameSetup = {};
    const pc = doc.gameSetup.playerCharacters && typeof doc.gameSetup.playerCharacters === 'object'
      ? { ...doc.gameSetup.playerCharacters }
      : {};
    if (Object.prototype.hasOwnProperty.call(pc, uidS)) {
      delete pc[uidS];
    }
    for (const k of Object.keys(pc)) {
      if (idStr(k) === uidS) delete pc[k];
    }
    doc.gameSetup.playerCharacters = pc;
    doc.markModified('gameSetup');
    doc.markModified('memberUserIds');
    await doc.save();
    updated += 1;
    console.log(`  updated member row: ${doc.gameId}`);
  }

  console.log(`Done. Removed user from ${updated} game(s) as non-owner member.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
