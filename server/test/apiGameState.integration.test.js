/**
 * HTTP integration tests: auth, game-state mine/load, create-invite, auth/join.
 * Uses in-memory MongoDB (downloads binary on first run).
 */
process.env.NODE_ENV = 'test';
process.env.DM_JWT_SECRET = process.env.DM_JWT_SECRET || 'integration-test-jwt-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const GameState = require('../models/GameState');
const { signSessionToken } = require('../auth/jwtSession');
const { createHttpApp } = require('../httpApp');

let mongoServer;
let app;
let tokenA;
let tokenB;
let userAIdStr;
let gameId;
let inviteTokenForJoin;
let inviteTokenSecond;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.DM_MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(process.env.DM_MONGODB_URI);
  app = createHttpApp();

  const userA = await User.create({
    googleSub: 'integration-test-sub-a',
    email: 'a-integration@test.local',
    name: 'Player A',
    nickname: 'PlayerA',
  });
  const userB = await User.create({
    googleSub: 'integration-test-sub-b',
    email: 'b-integration@test.local',
    name: 'Player B',
    nickname: 'PlayerB',
  });
  tokenA = signSessionToken(userA);
  tokenB = signSessionToken(userB);
  userAIdStr = String(userA._id);

  gameId = 'integration-game-' + Date.now();
  await GameState.create({
    gameId,
    ownerUserId: userA._id,
    memberUserIds: [userA._id],
    gameSetup: { language: 'English' },
  });
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('GET /api/meta returns deploy marker (verify production after release)', async () => {
  const res = await request(app).get('/api/meta');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body && res.body.api, 'gmai');
  assert.strictEqual(
    res.body && res.body.deployMarker,
    '2026-03-31-generate-character-no-campaign-gate'
  );
});

test('GET /api/game-state/mine without Authorization returns 401', async () => {
  const res = await request(app).get('/api/game-state/mine');
  assert.strictEqual(res.status, 401);
});

test('GET /api/game-state/mine with invalid JWT returns 401', async () => {
  const res = await request(app).get('/api/game-state/mine').set('Authorization', 'Bearer not-a-valid-jwt');
  assert.strictEqual(res.status, 401);
});

test('GET /api/game-state/mine returns games for owner', async () => {
  const res = await request(app).get('/api/game-state/mine').set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((g) => g && g.gameId === gameId));
});

test('GET /api/game-state/mine returns summary rows (not full game state)', async () => {
  const res = await request(app).get('/api/game-state/mine').set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  const row = res.body.find((g) => g && g.gameId === gameId);
  assert.ok(row);
  assert.strictEqual(typeof row.viewerIsOwner, 'boolean');
  assert.ok(['lobby', 'starting', 'playing'].includes(row.partyPhase));
  assert.strictEqual(typeof row.memberCount, 'number');
  assert.strictEqual(typeof row.messageCount, 'number');
  assert.strictEqual(typeof row.hasCampaign, 'boolean');
  assert.strictEqual(row.conversation, undefined);
});

test('DELETE /api/game-state/mine/:gameId removes game for owner only', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  assert.strictEqual(created.status, 201);
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const deny = await request(app)
    .delete(`/api/game-state/mine/${encodeURIComponent(gid)}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(deny.status, 403);
  assert.strictEqual(deny.body && deny.body.code, 'NOT_GAME_OWNER');
  const ok = await request(app)
    .delete(`/api/game-state/mine/${encodeURIComponent(gid)}`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body && ok.body.ok, true);
  const gone = await GameState.findOne({ gameId: gid }).lean();
  assert.strictEqual(gone, null);
});

test('GET /api/game-state/mine returns empty list for user with no games', async () => {
  const res = await request(app).get('/api/game-state/mine').set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(!res.body.some((g) => g && g.gameId === gameId));
});

test('GET /api/game-state/mine ignores access_token query (Bearer only)', async () => {
  const res = await request(app).get('/api/game-state/mine').query({ access_token: tokenA });
  assert.strictEqual(res.status, 401);
});

test('GET /api/game-state/events/:gameId without token returns 401', async () => {
  const res = await request(app).get(`/api/game-state/events/${encodeURIComponent(gameId)}`);
  assert.strictEqual(res.status, 401);
});

test('GET /api/game-state/events/:gameId with invalid access_token returns 401', async () => {
  const res = await request(app)
    .get(`/api/game-state/events/${encodeURIComponent(gameId)}`)
    .query({ access_token: 'not-a-jwt' });
  assert.strictEqual(res.status, 401);
});

test('GET /api/game-state/events/:gameId non-member returns 404', async () => {
  const res = await request(app)
    .get(`/api/game-state/events/${encodeURIComponent(gameId)}`)
    .query({ access_token: tokenB });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'GAME_NOT_FOUND');
});

test('GET /api/game-state/load/:gameId returns 404 for non-member', async () => {
  const res = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'GAME_NOT_FOUND');
});

test('GET /api/game-state/load/:gameId returns 200 for member', async () => {
  const res = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.gameId, gameId);
});

test('POST /api/game-session/create-invite returns 404 for non-member', async () => {
  const res = await request(app)
    .post('/api/game-session/create-invite')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ gameId });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'GAME_NOT_FOUND');
});

test('POST /api/game-session/create-invite returns inviteToken for owner', async () => {
  const res = await request(app)
    .post('/api/game-session/create-invite')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body && typeof res.body.inviteToken === 'string' && res.body.inviteToken.length > 16);
  assert.strictEqual(res.body.gameId, gameId);
  inviteTokenForJoin = res.body.inviteToken;
});

test('POST /api/auth/join returns 200 when host opens their own invite (token not consumed)', async () => {
  const res = await request(app)
    .post('/api/auth/join')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ inviteToken: inviteTokenForJoin });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.gameId, gameId);
  assert.strictEqual(res.body.alreadyMember, true);
  const doc = await GameState.findOne({ gameId }).select('+inviteToken').lean();
  assert.strictEqual(doc.inviteToken, inviteTokenForJoin);
});

test('POST /api/auth/join adds invited user to memberUserIds', async () => {
  const res = await request(app)
    .post('/api/auth/join')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ inviteToken: inviteTokenForJoin });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.gameId, gameId);
  assert.strictEqual(res.body.alreadyMember, false);
});

test('POST /api/auth/join clears invite token after first new member uses it', async () => {
  const doc = await GameState.findOne({ gameId }).select('+inviteToken inviteTokenCreatedAt').lean();
  assert.ok(!doc.inviteToken);
  assert.ok(doc.inviteTokenCreatedAt == null);
});

test('POST /api/auth/join rejects a second new user reusing the same invite token', async () => {
  const userC = await User.create({
    googleSub: 'integration-test-sub-c-reuse-invite',
    email: 'c-reuse-invite@test.local',
    name: 'Player C',
    nickname: 'PlayerC',
  });
  const tokenC = signSessionToken(userC);
  const res = await request(app)
    .post('/api/auth/join')
    .set('Authorization', `Bearer ${tokenC}`)
    .send({ inviteToken: inviteTokenForJoin });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'INVITE_INVALID');
});

test('POST /api/auth/join does not allow reusing a consumed token even for the user who already joined', async () => {
  const res = await request(app)
    .post('/api/auth/join')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ inviteToken: inviteTokenForJoin });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'INVITE_INVALID');
});

test('after join, invited user sees game in GET /api/game-state/mine', async () => {
  const res = await request(app).get('/api/game-state/mine').set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.some((g) => g && g.gameId === gameId));
});

test('after join, invited user can GET /api/game-state/load/:gameId', async () => {
  const res = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.gameId, gameId);
});

test('POST /api/game-session/create-invite succeeds for member who is not owner', async () => {
  const res = await request(app)
    .post('/api/game-session/create-invite')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ gameId });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body && typeof res.body.inviteToken === 'string' && res.body.inviteToken.length > 16);
  assert.strictEqual(res.body.gameId, gameId);
  assert.notStrictEqual(res.body.inviteToken, inviteTokenForJoin);
  inviteTokenSecond = res.body.inviteToken;
});

test('POST /api/auth/join returns 200 when member reopens a fresh invite (idempotent, token not consumed)', async () => {
  const res = await request(app)
    .post('/api/auth/join')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ inviteToken: inviteTokenSecond });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.gameId, gameId);
  assert.strictEqual(res.body.alreadyMember, true);
  const doc = await GameState.findOne({ gameId }).select('+inviteToken').lean();
  assert.strictEqual(doc.inviteToken, inviteTokenSecond);
});

test('POST /api/game-state/append-player-message returns 401 without auth', async () => {
  const res = await request(app).post('/api/game-state/append-player-message').send({
    gameId,
    content: 'I look around.',
  });
  assert.strictEqual(res.status, 401);
});

test('POST /api/game-state/append-player-message returns 404 for non-member', async () => {
  const lone = await User.create({
    googleSub: 'integration-append-lone',
    email: 'lone-append@test.local',
    name: 'Lone',
  });
  const t = signSessionToken(lone);
  const res = await request(app)
    .post('/api/game-state/append-player-message')
    .set('Authorization', `Bearer ${t}`)
    .send({ gameId, content: 'Hello' });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body && res.body.code, 'GAME_NOT_FOUND');
});

test('POST /api/game-state/append-player-message appends user line for member', async () => {
  await GameState.updateOne({ gameId }, { $set: { conversation: [], summaryConversation: [] } });
  const line = 'I search the door for traps.';
  const res = await request(app)
    .post('/api/game-state/append-player-message')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId, content: line, displayName: 'Hero' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body && res.body.ok, true);
  assert.strictEqual(res.body && res.body.duplicate, false);
  assert.strictEqual(res.body && res.body.partyWait, true);
  assert.strictEqual(res.body && res.body.partySubmitted, 1);
  assert.strictEqual(res.body && res.body.partyRequired, 2);
  const load = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(load.status, 200);
  const conv = load.body && load.body.conversation;
  assert.ok(Array.isArray(conv) && conv.length >= 1);
  const last = conv[conv.length - 1];
  assert.strictEqual(last.role, 'user');
  assert.strictEqual(last.content, line);
});

test('POST /api/game-state/append-player-message idempotent duplicate same tail', async () => {
  const line = 'Same beat twice.';
  const first = await request(app)
    .post('/api/game-state/append-player-message')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId, content: line });
  assert.strictEqual(first.status, 200);
  const second = await request(app)
    .post('/api/game-state/append-player-message')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId, content: line });
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body && second.body.duplicate, true);
  const doc = await GameState.findOne({ gameId }).lean();
  const users = (doc.conversation || []).filter((m) => m && m.role === 'user' && m.content === line);
  assert.strictEqual(users.length, 1);
});

test('GET load: gameSetup.generatedCharacter is never exposed (removed from API)', async () => {
  await GameState.updateOne(
    { gameId },
    {
      $set: {
        campaignSpec: { title: 'Integration campaign', campaignConcept: 'Test world for joiners' },
        'gameSetup.generatedCharacter': {
          name: 'STRAY_DB_FIELD',
          class: 'wizard',
          level: 1,
        },
      },
    }
  );
  const resB = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(resB.status, 200);
  assert.strictEqual(resB.body.viewerIsGameOwner, false);
  assert.strictEqual(resB.body.gameSetup && resB.body.gameSetup.generatedCharacter, undefined);
  const resA = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gameId)}`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resA.body.gameSetup && resA.body.gameSetup.generatedCharacter, undefined);
});

test('GameState projection used by generate-character must return campaignSpec (not +campaignSpec typo)', async () => {
  const row = await GameState.findOne({ gameId })
    .select('ownerUserId memberUserIds gameSetup campaignSpec')
    .lean();
  assert.ok(row, 'game row exists');
  assert.ok(
    row.campaignSpec && String(row.campaignSpec.title || '').includes('Integration'),
    'Mongo projection must include campaignSpec; +campaignSpec breaks Mongoose (literal field name)'
  );
});

test('POST /api/game-session/generate-character invitee without campaignSpec is not blocked (no CAMPAIGN_REQUIRED)', async () => {
  await GameState.updateOne({ gameId }, { $unset: { campaignSpec: 1 } });
  const res = await request(app)
    .post('/api/game-session/generate-character')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({
      gameId,
      gameSetup: {
        class: 'fighter',
        race: 'human',
        level: 1,
        language: 'English',
      },
      language: 'English',
    });
  assert.notStrictEqual(res.body && res.body.code, 'CAMPAIGN_REQUIRED_FOR_JOIN_CHARACTER');
});

test('POST /api/game-session/generate-character returns 400 without gameId and without newParty', async () => {
  const res = await request(app)
    .post('/api/game-session/generate-character')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      gameSetup: {
        class: 'fighter',
        race: 'human',
        level: 1,
        language: 'English',
      },
      language: 'English',
    });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body && res.body.code, 'GAME_ID_OR_NEW_PARTY_REQUIRED');
});

test('PATCH /api/auth/nickname trims and saves', async () => {
  const u = await User.create({
    googleSub: 'integration-nick-sub',
    email: 'nick-integration@test.local',
    name: 'Nick User',
  });
  const t = signSessionToken(u);
  const res = await request(app)
    .patch('/api/auth/nickname')
    .set('Authorization', `Bearer ${t}`)
    .send({ nickname: '  Stormcrow  ' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.nickname, 'Stormcrow');
  const again = await User.findById(u._id).lean();
  assert.strictEqual(again.nickname, 'Stormcrow');
});

test('PATCH /api/auth/nickname rejects empty nickname', async () => {
  const u = await User.create({
    googleSub: 'integration-nick-sub-empty',
    email: 'nick-empty@test.local',
    name: 'Empty Nick',
  });
  const t = signSessionToken(u);
  const res = await request(app)
    .patch('/api/auth/nickname')
    .set('Authorization', `Bearer ${t}`)
    .send({ nickname: '   ' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body && res.body.code, 'NICKNAME_INVALID');
});

test('GET /api/auth/me returns user including nickname', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.nickname, 'PlayerA');
  assert.ok(res.body.user._id);
  assert.strictEqual(res.body.user.email, undefined);
  assert.strictEqual(res.body.user.name, undefined);
});

test('POST /api/game-state/create-party returns lobby gameSetup.party', async () => {
  const res = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body && res.body.gameId);
  assert.strictEqual(res.body.gameSetup && res.body.gameSetup.party && res.body.gameSetup.party.phase, 'lobby');
  const row = await GameState.findOne({ gameId: res.body.gameId }).select('draftPartyExpiresAt').lean();
  assert.ok(row && row.draftPartyExpiresAt, 'new lobby party should have draftPartyExpiresAt for Mongo TTL');
  assert.ok(row.draftPartyExpiresAt > new Date(), 'draftPartyExpiresAt should be in the future');
});

test('PATCH /api/game-state/party-premise rejects non-owner (member but not host)', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const userBDoc = await User.findOne({ googleSub: 'integration-test-sub-b' }).lean();
  assert.ok(userBDoc);
  await GameState.updateOne({ gameId: gid }, { $addToSet: { memberUserIds: userBDoc._id } });
  const res = await request(app)
    .patch('/api/game-state/party-premise')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ gameId: gid, hostPremise: 'secret plot' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body && res.body.code, 'NOT_GAME_OWNER');
});

test('POST /api/game-state/party-ready toggles and reports partyReadyMeta', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const { ensurePlayerCharacterSheetDefaults } = require('../validatePlayerCharacter');
  const sheet = ensurePlayerCharacterSheetDefaults(
    {
      name: 'Lobby Test PC',
      class: 'fighter',
      level: 1,
      ancestry: 'human',
      background: 'Soldier',
      alignment: 'neutral',
      max_hp: 12,
      current_hp: 12,
      ac: 16,
      abilities: { str: 16, dex: 14, con: 15, int: 8, wis: 10, cha: 10 },
      skills: [],
      proficiencies: { armor: ['light', 'medium', 'heavy', 'shields'], weapons: ['simple', 'martial'] },
      languages: ['Common'],
      equipment: ['common clothes', 'belt pouch'],
      weapons: [{ name: 'Longsword', attack_bonus: 5, damage: '1d8+3 slashing' }],
      armor: [],
      tools: [],
      spells: [],
      features: [],
    },
    { language: 'English' }
  );
  await GameState.updateOne(
    { gameId: gid },
    { $set: { [`gameSetup.playerCharacters.${userAIdStr}`]: sheet } }
  );
  const ready = await request(app)
    .post('/api/game-state/party-ready')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId: gid, ready: true });
  assert.strictEqual(ready.status, 200);
  assert.strictEqual(ready.body.partyReadyMeta && ready.body.partyReadyMeta.allMembersHaveSheets, true);
  assert.strictEqual(ready.body.partyReadyMeta && ready.body.partyReadyMeta.allMembersReady, true);
});

test('POST /api/game-state/party-ready rejects ready:true without a valid persisted sheet', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const ready = await request(app)
    .post('/api/game-state/party-ready')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId: gid, ready: true });
  assert.strictEqual(ready.status, 400);
  assert.strictEqual(ready.body && ready.body.code, 'PARTY_READY_NEEDS_CHARACTER');
});

test('POST /api/game-session/start-party-adventure returns 400 when sheets incomplete', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const start = await request(app)
    .post('/api/game-session/start-party-adventure')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId: gid });
  assert.strictEqual(start.status, 400);
  assert.strictEqual(start.body && start.body.code, 'PARTY_SHEETS_INCOMPLETE');
});

test('Mongo $set on gameSetup.playerCharacters per user preserves both rows (no lost update)', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const userBDoc = await User.findOne({ googleSub: 'integration-test-sub-b' }).lean();
  assert.ok(userBDoc);
  const userBIdStr = String(userBDoc._id);
  await GameState.updateOne({ gameId: gid }, { $addToSet: { memberUserIds: userBDoc._id } });
  await GameState.updateOne(
    { gameId: gid },
    { $set: { [`gameSetup.playerCharacters.${userAIdStr}`]: { name: 'ConcurrentA' } } }
  );
  await GameState.updateOne(
    { gameId: gid },
    { $set: { [`gameSetup.playerCharacters.${userBIdStr}`]: { name: 'ConcurrentB' } } }
  );
  const row = await GameState.findOne({ gameId: gid }).select('gameSetup').lean();
  assert.ok(row && row.gameSetup && row.gameSetup.playerCharacters);
  assert.strictEqual(row.gameSetup.playerCharacters[userAIdStr] && row.gameSetup.playerCharacters[userAIdStr].name, 'ConcurrentA');
  assert.strictEqual(row.gameSetup.playerCharacters[userBIdStr] && row.gameSetup.playerCharacters[userBIdStr].name, 'ConcurrentB');
});

test('GET /api/game-state/load keeps both ready after host-first guest-last when host sheet key differs by hex case', async () => {
  const created = await request(app)
    .post('/api/game-state/create-party')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ language: 'English' });
  const gid = created.body && created.body.gameId;
  assert.ok(gid);
  const userBDoc = await User.findOne({ googleSub: 'integration-test-sub-b' }).lean();
  assert.ok(userBDoc);
  const userBIdStr = String(userBDoc._id);
  await GameState.updateOne({ gameId: gid }, { $addToSet: { memberUserIds: userBDoc._id } });

  const { ensurePlayerCharacterSheetDefaults } = require('../validatePlayerCharacter');
  const sheet = ensurePlayerCharacterSheetDefaults(
    {
      name: 'Lobby Test PC',
      class: 'fighter',
      level: 1,
      ancestry: 'human',
      background: 'Soldier',
      alignment: 'neutral',
      max_hp: 12,
      current_hp: 12,
      ac: 16,
      abilities: { str: 16, dex: 14, con: 15, int: 8, wis: 10, cha: 10 },
      skills: [],
      proficiencies: { armor: ['light', 'medium', 'heavy', 'shields'], weapons: ['simple', 'martial'] },
      languages: ['Common'],
      equipment: ['common clothes', 'belt pouch'],
      weapons: [{ name: 'Longsword', attack_bonus: 5, damage: '1d8+3 slashing' }],
      armor: [],
      tools: [],
      spells: [],
      features: [],
    },
    { language: 'English' }
  );
  const ownerKeyUpper = userAIdStr.toUpperCase();
  await GameState.updateOne(
    { gameId: gid },
    {
      $set: {
        [`gameSetup.playerCharacters.${ownerKeyUpper}`]: sheet,
        [`gameSetup.playerCharacters.${userBIdStr}`]: sheet,
      },
    }
  );

  const readyA = await request(app)
    .post('/api/game-state/party-ready')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ gameId: gid, ready: true });
  assert.strictEqual(readyA.status, 200);

  const readyB = await request(app)
    .post('/api/game-state/party-ready')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ gameId: gid, ready: true });
  assert.strictEqual(readyB.status, 200);
  assert.strictEqual(readyB.body.partyReadyMeta && readyB.body.partyReadyMeta.allMembersReady, true);

  const loadHost = await request(app)
    .get(`/api/game-state/load/${encodeURIComponent(gid)}`)
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(loadHost.status, 200);
  const rawIds =
    loadHost.body.gameSetup && loadHost.body.gameSetup.party && loadHost.body.gameSetup.party.readyUserIds;
  const norm = (arr) => [...(arr || [])].map((x) => String(x).toLowerCase()).sort();
  assert.deepStrictEqual(norm(rawIds), norm([userAIdStr, userBIdStr]));
});
