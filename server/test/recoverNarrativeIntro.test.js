/**
 * @see server/services/recoverPendingGameStateOnStartup.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { computeNarrativeIntroRecovery } = require('../services/recoverPendingGameStateOnStartup');

function minimalValidSheet(name) {
  return {
    name,
    max_hp: 10,
    current_hp: 10,
    ac: 10,
    armor: [],
    equipment: ['Travel clothes and boots (no armor)'],
    tools: [],
    weapons: [{ name: 'Club', attack_bonus: 2, damage: '1d4 bludgeoning' }],
    languages: ['Common'],
  };
}

test('computeNarrativeIntroRecovery returns null for solo party', () => {
  const uid = new mongoose.Types.ObjectId();
  const idStr = String(uid);
  const doc = {
    ownerUserId: uid,
    memberUserIds: [],
    conversation: [{ role: 'assistant', content: 'x' }],
    gameSetup: { language: 'English', playerCharacters: { [idStr]: minimalValidSheet('A') } },
  };
  assert.strictEqual(computeNarrativeIntroRecovery(doc), null);
});

test('computeNarrativeIntroRecovery migrates legacy party: owner + chatter introduced, other pending', () => {
  const owner = new mongoose.Types.ObjectId();
  const guest = new mongoose.Types.ObjectId();
  const o = String(owner);
  const g = String(guest);
  const doc = {
    ownerUserId: owner,
    memberUserIds: [guest],
    conversation: [
      { role: 'assistant', content: 'open' },
      { role: 'user', content: 'hi', userId: o },
    ],
    gameSetup: {
      language: 'English',
      party: { pendingNarrativeIntroductionUserIds: [] },
      playerCharacters: {
        [o]: minimalValidSheet('Host'),
        [g]: minimalValidSheet('Guest'),
      },
    },
  };
  const patch = computeNarrativeIntroRecovery(doc);
  assert.ok(patch);
  assert.deepStrictEqual(new Set(patch.narrativeIntroducedUserIds), new Set([o]));
  assert.deepStrictEqual(new Set(patch.pendingNarrativeIntroductionUserIds), new Set([g]));
});

test('computeNarrativeIntroRecovery re-queues sheet member missing from introduced and pending', () => {
  const owner = new mongoose.Types.ObjectId();
  const guest = new mongoose.Types.ObjectId();
  const o = String(owner);
  const g = String(guest);
  const doc = {
    ownerUserId: owner,
    memberUserIds: [guest],
    conversation: [{ role: 'assistant', content: 'x' }],
    gameSetup: {
      language: 'English',
      party: {
        narrativeIntroducedUserIds: [o],
        pendingNarrativeIntroductionUserIds: [],
      },
      playerCharacters: {
        [o]: minimalValidSheet('Host'),
        [g]: minimalValidSheet('Guest'),
      },
    },
  };
  const patch = computeNarrativeIntroRecovery(doc);
  assert.ok(patch);
  assert.deepStrictEqual(patch.narrativeIntroducedUserIds.sort(), [o]);
  assert.deepStrictEqual(patch.pendingNarrativeIntroductionUserIds.sort(), [g]);
});

test('computeNarrativeIntroRecovery returns null when nothing to change', () => {
  const owner = new mongoose.Types.ObjectId();
  const guest = new mongoose.Types.ObjectId();
  const o = String(owner);
  const g = String(guest);
  const doc = {
    ownerUserId: owner,
    memberUserIds: [guest],
    conversation: [{ role: 'assistant', content: 'x' }],
    gameSetup: {
      language: 'English',
      party: {
        narrativeIntroducedUserIds: [o],
        pendingNarrativeIntroductionUserIds: [g],
      },
      playerCharacters: {
        [o]: minimalValidSheet('Host'),
        [g]: minimalValidSheet('Guest'),
      },
    },
  };
  assert.strictEqual(computeNarrativeIntroRecovery(doc), null);
});
