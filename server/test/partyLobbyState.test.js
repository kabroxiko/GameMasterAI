/**
 * @see server/services/partyLobbyState.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const {
  defaultParty,
  getParty,
  mergeParty,
  canonicalMemberIdStrings,
  allMembersReady,
  allMembersHaveValidSheets,
  memberHasValidSheetForUserId,
  adventureHasBegun,
} = require('../services/partyLobbyState');

test('defaultParty has lobby phase', () => {
  const p = defaultParty();
  assert.strictEqual(p.phase, 'lobby');
  assert.ok(Array.isArray(p.readyUserIds));
});

test('mergeParty preserves language and updates party keys', () => {
  const gs = mergeParty({ language: 'Spanish' }, { hostPremise: 'port city' });
  assert.strictEqual(gs.language, 'Spanish');
  assert.strictEqual(gs.party.hostPremise, 'port city');
  assert.strictEqual(gs.party.phase, 'lobby');
});

test('canonicalMemberIdStrings includes owner and members', () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const ids = canonicalMemberIdStrings({ ownerUserId: a, memberUserIds: [b] });
  assert.deepStrictEqual(new Set(ids), new Set([String(a), String(b)]));
});

test('allMembersReady requires every member id in readyUserIds', () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const doc = { ownerUserId: a, memberUserIds: [b], gameSetup: {} };
  assert.strictEqual(allMembersReady({ readyUserIds: [String(a)] }, doc), false);
  assert.strictEqual(allMembersReady({ readyUserIds: [String(a), String(b)] }, doc), true);
});

test('adventureHasBegun is true when assistant message exists', () => {
  assert.strictEqual(
    adventureHasBegun({
      campaignSpec: null,
      conversation: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    }),
    true
  );
  assert.strictEqual(adventureHasBegun({ campaignSpec: null, conversation: [] }), false);
});

test('allMembersHaveValidSheets false when any sheet missing', () => {
  const uid = new mongoose.Types.ObjectId();
  const doc = {
    ownerUserId: uid,
    memberUserIds: [],
    gameSetup: { playerCharacters: {} },
  };
  assert.strictEqual(allMembersHaveValidSheets(doc), false);
});

test('memberHasValidSheetForUserId false when sheet missing or invalid', () => {
  const uid = new mongoose.Types.ObjectId();
  const idStr = String(uid);
  const doc = {
    ownerUserId: uid,
    memberUserIds: [],
    gameSetup: { playerCharacters: {} },
  };
  assert.strictEqual(memberHasValidSheetForUserId(doc, idStr), false);
  assert.strictEqual(memberHasValidSheetForUserId(doc, ''), false);
});
