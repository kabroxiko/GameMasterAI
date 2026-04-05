const { test } = require('node:test');
const assert = require('node:assert');
const {
  validateDistinctEntityNames,
  dedupeMajorNpcNamesBySuffix,
  normalizeNameKey,
} = require('../validateEntityNameUniqueness');

test('normalizeNameKey is case-insensitive and collapses spaces', () => {
  assert.strictEqual(normalizeNameKey('  Aria  Moon  '), normalizeNameKey('aria moon'));
});

test('validateDistinctEntityNames rejects duplicate PCs', () => {
  const r = validateDistinctEntityNames({
    gameSetup: {
      playerCharacters: {
        a: { name: 'Thorin' },
        b: { name: 'thorin' },
      },
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ENTITY_NAME_DUPLICATE_PC');
});

test('validateDistinctEntityNames rejects PC name matching major NPC', () => {
  const r = validateDistinctEntityNames({
    gameSetup: {
      playerCharacters: { u1: { name: 'Elara' } },
    },
    campaignSpec: {
      majorNPCs: [{ name: 'elara', role: 'queen', briefDescription: 'x. y.' }],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ENTITY_NAME_PC_COLLIDES_WITH_MAJOR_NPC');
});

test('validateDistinctEntityNames rejects duplicate encounter labels', () => {
  const r = validateDistinctEntityNames({
    encounterState: {
      participants: [
        { id: 'e1', name: 'Bandit', kind: 'enemy' },
        { id: 'e2', name: 'bandit', kind: 'enemy' },
      ],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ENTITY_NAME_DUPLICATE_ENCOUNTER_PARTICIPANT');
});

test('dedupeMajorNpcNamesBySuffix disambiguates collisions', () => {
  const out = dedupeMajorNpcNamesBySuffix([
    { name: 'Mira', role: 'x', briefDescription: 'a. b.' },
    { name: 'mira', role: 'y', briefDescription: 'c. d.' },
  ]);
  assert.strictEqual(out[0].name, 'Mira');
  assert.strictEqual(out[1].name, 'mira (2)');
});
