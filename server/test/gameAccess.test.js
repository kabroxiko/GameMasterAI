const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { userIsGameMember, toObjectId } = require('../services/gameAccess');

test('toObjectId accepts valid hex id', () => {
  const hex = '507f1f77bcf86cd799439011';
  const o = toObjectId(hex);
  assert.ok(o instanceof mongoose.Types.ObjectId);
  assert.strictEqual(String(o), hex);
});

test('toObjectId returns null for invalid', () => {
  assert.strictEqual(toObjectId(''), null);
  assert.strictEqual(toObjectId('not-an-id'), null);
});

test('userIsGameMember matches owner', () => {
  const id = new mongoose.Types.ObjectId();
  const uid = String(id);
  assert.strictEqual(
    userIsGameMember(uid, {
      ownerUserId: id,
      memberUserIds: [],
    }),
    true
  );
});

test('userIsGameMember matches member list', () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  assert.strictEqual(
    userIsGameMember(String(b), {
      ownerUserId: a,
      memberUserIds: [b],
    }),
    true
  );
  assert.strictEqual(
    userIsGameMember(String(a), {
      ownerUserId: a,
      memberUserIds: [b],
    }),
    true
  );
});

test('userIsGameMember rejects non-member', () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const c = new mongoose.Types.ObjectId();
  assert.strictEqual(
    userIsGameMember(String(c), {
      ownerUserId: a,
      memberUserIds: [b],
    }),
    false
  );
});
