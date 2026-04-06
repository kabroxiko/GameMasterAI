const { test } = require('node:test');
const assert = require('node:assert');
const { mapAncestryToIronRace, validatePreassignedDisplayNameFromClient } = require('../services/ironArachneNames');
const { collectReservedEntityNameKeys: collectKeys } = require('../validateEntityNameUniqueness');

test('mapAncestryToIronRace: common D&D strings', () => {
  assert.strictEqual(mapAncestryToIronRace('Human'), 'human');
  assert.strictEqual(mapAncestryToIronRace('half-elf'), 'half-elf');
  assert.strictEqual(mapAncestryToIronRace('Half-Orc'), 'half-orc');
  assert.strictEqual(mapAncestryToIronRace('Wood Elf'), 'elf');
  assert.strictEqual(mapAncestryToIronRace('Dragonborn'), 'dragonborn');
  assert.strictEqual(mapAncestryToIronRace('Tiefling'), 'tiefling');
  assert.strictEqual(mapAncestryToIronRace('gnomo'), 'gnome');
  assert.strictEqual(mapAncestryToIronRace('enano'), 'dwarf');
  assert.strictEqual(mapAncestryToIronRace(''), 'human');
});

test('tryPreassignIronArachneDisplayName: no fetch when race is random', async () => {
  delete process.env.DM_USE_IRON_ARACHNE_NAMES;
  const { tryPreassignIronArachneDisplayName } = require('../services/ironArachneNames');
  const r = await tryPreassignIronArachneDisplayName({
    raceRaw: 'random',
    genderRaw: 'Male',
    gameSetupForReserved: {},
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'race_not_fixed');
});

test('validatePreassignedDisplayNameFromClient: two tokens', () => {
  const ok = validatePreassignedDisplayNameFromClient('A B', { gameSetupForReserved: {} });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.name, 'A B');
  const bad = validatePreassignedDisplayNameFromClient('Onlyone', { gameSetupForReserved: {} });
  assert.strictEqual(bad.ok, false);
});

test('collectReservedEntityNameKeys excludes one user', () => {
  const keys = collectKeys({
    gameSetup: {
      playerCharacters: {
        u1: { name: 'Alpha Beta' },
        u2: { name: 'Gamma Delta' },
      },
    },
    excludeUserId: 'u1',
  });
  assert.ok(keys.has('gamma delta'));
  assert.ok(!keys.has('alpha beta'));
});
