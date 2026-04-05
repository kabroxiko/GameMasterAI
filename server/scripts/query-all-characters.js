#!/usr/bin/env node
/**
 * List all player character sheets across GameState documents.
 *
 * Sources per game: gameSetup.playerCharacters[<userId>]
 *
 * Usage (from server/):
 *   node scripts/query-all-characters.js
 *   node scripts/query-all-characters.js --json
 *   node scripts/query-all-characters.js --limit=50
 *
 * Loads DM_MONGODB_URI from server/.env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const GameState = require('../models/GameState');

function parseArgs() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  let limit = 0;
  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { asJson, limit };
}

function characterLabel(sheet) {
  if (!sheet || typeof sheet !== 'object') return '(no sheet)';
  const id = sheet.identity && typeof sheet.identity === 'object' && sheet.identity.name;
  if (id && String(id).trim()) return String(id).trim();
  if (sheet.name != null && String(sheet.name).trim()) return String(sheet.name).trim();
  if (sheet.characterName != null && String(sheet.characterName).trim()) return String(sheet.characterName).trim();
  return '(unnamed)';
}

function characterBrief(sheet) {
  if (!sheet || typeof sheet !== 'object') return {};
  const out = { name: characterLabel(sheet) };
  if (sheet.class != null) out.class = sheet.class;
  if (sheet.characterClass != null) out.characterClass = sheet.characterClass;
  if (sheet.race != null) out.race = sheet.race;
  if (sheet.level != null) out.level = sheet.level;
  return out;
}

async function main() {
  const { asJson, limit } = parseArgs();
  const uri = process.env.DM_MONGODB_URI;
  if (!uri) {
    console.error('DM_MONGODB_URI missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  try {
    const q = GameState.find({})
      .select('gameId ownerUserId memberUserIds gameSetup')
      .sort({ gameId: 1 })
      .lean();

    const cursor = limit > 0 ? q.limit(limit) : q;
    const docs = await cursor.exec();

    const rows = [];
    for (const doc of docs) {
      const gameId = doc.gameId != null ? String(doc.gameId) : '';
      const ownerStr = doc.ownerUserId != null ? String(doc.ownerUserId) : '';
      const gs = doc.gameSetup && typeof doc.gameSetup === 'object' ? doc.gameSetup : {};
      const pcMap = gs.playerCharacters && typeof gs.playerCharacters === 'object' && !Array.isArray(gs.playerCharacters)
        ? gs.playerCharacters
        : {};

      for (const uid of Object.keys(pcMap)) {
        const sheet = pcMap[uid];
        if (!sheet || typeof sheet !== 'object') continue;
        rows.push({
          gameId,
          ownerUserId: ownerStr,
          source: 'playerCharacters',
          userId: uid,
          ...characterBrief(sheet),
        });
      }
    }

    if (asJson) {
      console.log(JSON.stringify({ count: rows.length, characters: rows }, null, 2));
    } else {
      console.log(`Found ${rows.length} character row(s) across ${docs.length} game document(s).\n`);
      for (const r of rows) {
        const parts = [
          `gameId=${r.gameId}`,
          `source=${r.source}`,
          `userId=${r.userId}`,
          `name=${r.name}`,
        ];
        if (r.class) parts.push(`class=${r.class}`);
        else if (r.characterClass) parts.push(`class=${r.characterClass}`);
        if (r.race) parts.push(`race=${r.race}`);
        if (r.level != null) parts.push(`level=${r.level}`);
        console.log(parts.join('  '));
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
