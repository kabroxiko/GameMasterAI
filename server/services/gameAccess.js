const mongoose = require('mongoose');
const GameState = require('../models/GameState');

function toObjectId(idStr) {
  if (!idStr || !mongoose.Types.ObjectId.isValid(idStr)) return null;
  return new mongoose.Types.ObjectId(idStr);
}

/** When `ownerUserId` is unset, treat first `memberUserIds` entry as the effective owner id string. */
function effectiveGameOwnerIdStr(doc) {
  if (!doc) return '';
  if (doc.ownerUserId != null) return String(doc.ownerUserId);
  const m = doc.memberUserIds;
  if (Array.isArray(m) && m.length > 0) return String(m[0]);
  return '';
}

/** @returns {boolean} */
function userIsGameMember(userIdStr, gameStateLeanOrDoc) {
  if (!gameStateLeanOrDoc || !userIdStr) return false;
  const uid = String(userIdStr);
  const owner = gameStateLeanOrDoc.ownerUserId && gameStateLeanOrDoc.ownerUserId.toString();
  if (owner && owner === uid) return true;
  const members = gameStateLeanOrDoc.memberUserIds || [];
  return members.some((m) => m && m.toString() === uid);
}

/**
 * Throws HTTP-like error with .status for express handler, or returns doc if ok.
 * @param {string} userIdStr - Mongo user _id string
 * @param {string} gameId
 */
async function assertGameMember(userIdStr, gameId) {
  if (!gameId || typeof gameId !== 'string') {
    const e = new Error('gameId is required');
    e.status = 400;
    throw e;
  }
  const gs = await GameState.findOne({ gameId })
    .select('ownerUserId memberUserIds gameId')
    .lean();
  if (!gs) {
    const e = new Error('Game not found');
    e.status = 404;
    throw e;
  }
  const ok = userIsGameMember(userIdStr, gs);
  if (!ok) {
    const e = new Error('Game not found');
    e.status = 404;
    throw e;
  }
  return gs;
}

function sendAccessError(res, err) {
  const status = err.status || 500;
  const body = status === 404 ? { error: 'Game not found', code: 'GAME_NOT_FOUND' } : { error: err.message || 'Request failed' };
  return res.status(status).json(body);
}

module.exports = {
  userIsGameMember,
  assertGameMember,
  sendAccessError,
  toObjectId,
  effectiveGameOwnerIdStr,
};
