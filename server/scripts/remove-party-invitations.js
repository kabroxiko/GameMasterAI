#!/usr/bin/env node
/**
 * Remove party invitations / invitees from GameState:
 * - memberUserIds → owner only (or first member if ownerUserId missing)
 * - Clears inviteToken + inviteTokenCreatedAt (invalidates invite links)
 * - Removes non-owner keys from gameSetup.playerCharacters
 *
 * Usage (from server/):
 *   node scripts/remove-party-invitations.js           # dry-run, print planned changes
 *   node scripts/remove-party-invitations.js --apply # write to MongoDB
 *   node scripts/remove-party-invitations.js --apply --gameId=123
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
  let gameId = null;
  for (const a of argv) {
    if (a.startsWith('--gameId=')) gameId = a.slice('--gameId='.length).trim() || null;
  }
  return { apply, gameId };
}

function idStr(x) {
  if (x == null) return '';
  return String(x);
}

function soleOwnerId(doc) {
  if (doc.ownerUserId != null) return doc.ownerUserId;
  const m = doc.memberUserIds;
  if (Array.isArray(m) && m.length > 0) return m[0];
  return null;
}

function planForDoc(doc) {
  const owner = soleOwnerId(doc);
  const ownerS = idStr(owner);
  const members = Array.isArray(doc.memberUserIds) ? doc.memberUserIds : [];
  const memberStrs = members.map(idStr);
  const toRemove = ownerS ? memberStrs.filter((id) => id !== ownerS) : [];

  const hadToken = !!(doc.inviteToken && String(doc.inviteToken).trim());
  const needsMemberTrim = toRemove.length > 0;
  const needsOwnerInMembers = ownerS && !memberStrs.includes(ownerS);

  const pc = doc.gameSetup && doc.gameSetup.playerCharacters && typeof doc.gameSetup.playerCharacters === 'object'
    ? { ...doc.gameSetup.playerCharacters }
    : {};
  const pcKeysRemoved = [];
  for (const rid of toRemove) {
    for (const k of Object.keys(pc)) {
      if (idStr(k) === rid) {
        delete pc[k];
        pcKeysRemoved.push(k);
      }
    }
  }

  const noop = !needsMemberTrim && !hadToken && !needsOwnerInMembers && pcKeysRemoved.length === 0;
  return {
    noop,
    owner,
    ownerS,
    toRemove,
    hadToken,
    needsMemberTrim,
    needsOwnerInMembers,
    pc,
    pcKeysRemoved,
    newMemberIds: owner ? [owner] : [],
  };
}

async function main() {
  const { apply, gameId } = parseArgs();
  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const q = {
    ...(gameId ? { gameId } : {}),
    $or: [
      { $expr: { $gt: [{ $size: { $ifNull: ['$memberUserIds', []] } }, 1] } },
      { inviteToken: { $exists: true, $nin: [null, ''] } },
    ],
  };

  const cursor = GameState.find(q).select('+inviteToken gameId ownerUserId memberUserIds inviteToken inviteTokenCreatedAt gameSetup');

  let count = 0;
  for await (const doc of cursor) {
    const plan = planForDoc(doc);
    if (plan.noop) continue;

    count += 1;
    console.log(
      JSON.stringify(
        {
          gameId: doc.gameId,
          ownerUserId: plan.ownerS || null,
          removeMemberIds: plan.toRemove,
          clearInviteToken: plan.hadToken,
          removePlayerCharacterKeys: plan.pcKeysRemoved,
          newMemberUserIds: plan.newMemberIds.map(idStr),
        },
        null,
        2
      )
    );

    if (apply) {
      if (plan.needsMemberTrim && !plan.owner) {
        console.error('  -> skip: cannot derive owner; fix ownerUserId / memberUserIds manually');
        continue;
      }
      doc.inviteToken = null;
      doc.inviteTokenCreatedAt = null;
      if (plan.owner) {
        doc.memberUserIds = plan.newMemberIds;
        if (!doc.gameSetup || typeof doc.gameSetup !== 'object') doc.gameSetup = {};
        doc.gameSetup.playerCharacters = plan.pc;
        doc.markModified('gameSetup');
        doc.markModified('memberUserIds');
      }
      await doc.save();
      console.log('  -> saved');
    }
  }

  console.log(apply ? `Done. Updated ${count} game(s).` : `Dry-run. ${count} game(s) would change. Pass --apply to write.`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
