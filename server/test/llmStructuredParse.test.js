const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseModelStructuredObject,
  parseCampaignStageModelOutput,
} = require('../utils/llmStructuredParse');

describe('parseModelStructuredObject', () => {
  it('parses a YAML mapping with nested creativeSeed', () => {
    const raw = `
creativeSeed:
  titleMood: bleak
  preferAngles:
    - angle one
  avoidRepeatedFantasyTropesThisRun:
    - trope a
    - trope b
`;
    const r = parseModelStructuredObject(raw);
    assert.equal(r.ok, true);
    assert.equal(r.obj.creativeSeed.titleMood, 'bleak');
    assert.deepEqual(r.obj.creativeSeed.preferAngles, ['angle one']);
  });

  it('parses flow-style mapping (YAML 1.2 JSON compatibility)', () => {
    const raw = '{"playerCharacter":{"name":"A B","class":"Fighter"}}';
    const r = parseModelStructuredObject(raw);
    assert.equal(r.ok, true);
    assert.equal(r.obj.playerCharacter.class, 'Fighter');
  });
});

describe('parseCampaignStageModelOutput', () => {
  it('accepts root flow sequence (YAML)', () => {
    const raw = '[{"name":"Guild","goal":"x","resources":"y","currentDisposition":"z"}]';
    const r = parseCampaignStageModelOutput(raw);
    assert.equal(r.ok, true);
    assert.equal(r.data[0].name, 'Guild');
  });

  it('accepts YAML mapping with factions key', () => {
    const raw = `factions:
  - name: Red Hand
    goal: Control trade.
    resources: Ships.
    currentDisposition: Wary of outsiders.
`;
    const r = parseCampaignStageModelOutput(raw);
    assert.equal(r.ok, true);
    assert.equal(r.data.factions[0].name, 'Red Hand');
  });
});
