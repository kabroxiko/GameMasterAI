const { test } = require('node:test');
const assert = require('node:assert');
const {
  characterDisplayNameFromSheet,
  syncPlayerCharacterDisplayNameFields,
} = require('../playerCharacterHelpers');

test('syncPlayerCharacterDisplayNameFields overwrites identity.name (display precedence)', () => {
  const pc = {
    name: 'Model Family',
    identity: { name: 'Model Given', gender: 'male' },
  };
  syncPlayerCharacterDisplayNameFields(pc, 'Muna Given MunaFamily');
  assert.strictEqual(characterDisplayNameFromSheet(pc), 'Muna Given MunaFamily');
  assert.strictEqual(pc.name, 'Muna Given MunaFamily');
  assert.strictEqual(pc.identity.name, 'Muna Given MunaFamily');
  assert.strictEqual(pc.characterName, 'Muna Given MunaFamily');
});
