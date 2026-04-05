const test = require('node:test');
const assert = require('node:assert');
const {
  creativeSeedIsUsable,
  redactCampaignSpecForClient,
  mergeCampaignSpecPreservingDmSecrets,
  buildInitialCampaignInjectSupplement,
} = require('../campaignSpecDmSecrets');

test('creativeSeedIsUsable rejects incomplete seed', () => {
  assert.strictEqual(creativeSeedIsUsable(null), false);
  assert.strictEqual(
    creativeSeedIsUsable({
      titleMood: 'abcd',
      preferAngles: ['a'],
      avoidRepeatedFantasyTropesThisRun: ['one'],
    }),
    false
  );
});

test('creativeSeedIsUsable accepts valid seed', () => {
  assert.strictEqual(
    creativeSeedIsUsable({
      titleMood: 'mercantile dread',
      preferAngles: ['trade routes'],
      avoidRepeatedFantasyTropesThisRun: ['chosen one', 'dark lord'],
    }),
    true
  );
});

test('redactCampaignSpecForClient strips creativeSeed', () => {
  const out = redactCampaignSpecForClient({
    title: 'T',
    creativeSeed: { titleMood: 'secret', preferAngles: ['a'], avoidRepeatedFantasyTropesThisRun: ['b', 'c'] },
  });
  assert.strictEqual(out.creativeSeed, undefined);
  assert.strictEqual(out.title, 'T');
});

test('buildInitialCampaignInjectSupplement is empty without usable creativeSeed', () => {
  assert.deepStrictEqual(buildInitialCampaignInjectSupplement({ title: 'X' }), {});
  assert.deepStrictEqual(
    buildInitialCampaignInjectSupplement({
      title: 'X',
      creativeSeed: { titleMood: 'ab' },
    }),
    {}
  );
});

test('buildInitialCampaignInjectSupplement returns slim creativeSeed only', () => {
  const spec = {
    title: 'T',
    campaignConcept: 'long concept text not in supplement',
    creativeSeed: {
      titleMood: 'wry dread',
      preferAngles: ['a', 'b'],
      avoidRepeatedFantasyTropesThisRun: ['trope1', 'trope2'],
      namingNote: 'vary guild names',
    },
  };
  const sup = buildInitialCampaignInjectSupplement(spec);
  assert.strictEqual(Object.keys(sup).length, 1);
  assert.strictEqual(sup.creativeSeed.titleMood, 'wry dread');
  assert.strictEqual(sup.creativeSeed.namingNote, 'vary guild names');
  assert.strictEqual('campaignConcept' in sup, false);
});

test('merge preserves creativeSeed when incoming omits it', () => {
  const prev = {
    title: 'Old',
    creativeSeed: {
      titleMood: 'mood',
      preferAngles: ['a'],
      avoidRepeatedFantasyTropesThisRun: ['x', 'y'],
    },
  };
  const inc = { title: 'New' };
  const m = mergeCampaignSpecPreservingDmSecrets(prev, inc);
  assert.strictEqual(m.title, 'New');
  assert.strictEqual(m.creativeSeed.titleMood, 'mood');
});
