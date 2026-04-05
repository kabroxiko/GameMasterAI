const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GameState = require('../models/GameState');
const { verifyGoogleIdToken } = require('../auth/verifyGoogleIdToken');
const { signSessionToken } = require('../auth/jwtSession');
const { requireAuth } = require('../middleware/requireAuth');
const { toObjectId, userIsGameMember } = require('../services/gameAccess');

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 40;

function userPublicFields(user) {
  return {
    _id: user._id,
    picture: user.picture,
    nickname: user.nickname && String(user.nickname).trim() ? String(user.nickname).trim() : '',
  };
}

/**
 * POST { idToken }
 * Returns { token, user: { _id, picture, nickname } } — no Google legal name or email in the payload.
 */
router.post('/google', async (req, res) => {
  try {
    const idToken = req.body && req.body.idToken;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken required', code: 'ID_TOKEN_REQUIRED' });
    }
    const payload = await verifyGoogleIdToken(idToken);
    const googleSub = payload.sub;
    const email = (payload.email && String(payload.email).toLowerCase()) || '';
    const name = payload.name || '';
    const picture = payload.picture || '';

    let user = await User.findOne({ googleSub });
    if (!user) {
      user = new User({ googleSub, email, name, picture });
      await user.save();
    } else {
      user.email = email || user.email;
      user.name = name || user.name;
      user.picture = picture || user.picture;
      await user.save();
    }

    const token = signSessionToken(user);
    res.json({
      token,
      user: userPublicFields(user),
    });
  } catch (e) {
    console.error('POST /api/auth/google failed:', e && e.message ? e.message : e);
    if (e && e.code === 'AUTH_CONFIG') {
      return res.status(503).json({ error: e.message, code: e.code });
    }
    return res.status(401).json({ error: 'Google sign-in failed', code: 'GOOGLE_AUTH_FAILED' });
  }
});

/**
 * POST { inviteToken }
 * Adds current user to game memberUserIds. Returns { gameId }.
 * Each invite token works once for a new member; after a successful join it is cleared (host or any
 * member can mint a new link via POST /api/game-session/create-invite).
 * Already in the party (host or invitee): 200 + { gameId, alreadyMember: true }; invite token unchanged.
 * First-time join: 200 + { gameId, alreadyMember: false } and token cleared. Clients use alreadyMember to skip setup and open chat.
 * Re-opening a consumed URL returns INVITE_INVALID.
 */
router.post('/join', requireAuth, async (req, res) => {
  try {
    const raw = req.body && req.body.inviteToken;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'inviteToken required', code: 'INVITE_TOKEN_REQUIRED' });
    }
    const inviteToken = String(raw).trim();
    if (!inviteToken) {
      return res.status(400).json({ error: 'inviteToken required', code: 'INVITE_TOKEN_REQUIRED' });
    }
    const gs = await GameState.findOne({ inviteToken }).select('+inviteToken gameId memberUserIds ownerUserId');
    if (!gs) {
      return res.status(404).json({ error: 'Invalid or expired invite', code: 'INVITE_INVALID' });
    }
    const uid = toObjectId(req.userId);
    if (!uid) {
      return res.status(400).json({ error: 'Invalid user', code: 'USER_INVALID' });
    }
    const uidStr = String(req.userId);
    const gsPlain = typeof gs.toObject === 'function' ? gs.toObject() : gs;
    if (userIsGameMember(uidStr, gsPlain)) {
      return res.json({ gameId: gs.gameId, alreadyMember: true });
    }
    // Always record owner + joining user in memberUserIds so multi-member party logic and persist paths stay correct.
    const each = [];
    if (gs.ownerUserId) each.push(gs.ownerUserId);
    each.push(uid);
    const upd = await GameState.updateOne(
      {
        _id: gs._id,
        inviteToken,
        memberUserIds: { $nin: [uid] },
      },
      {
        $addToSet: { memberUserIds: { $each: each } },
        $unset: { inviteToken: '', inviteTokenCreatedAt: '' },
      }
    );
    if (upd.matchedCount === 0) {
      const gs2 = await GameState.findById(gs._id).select('gameId memberUserIds ownerUserId').lean();
      if (gs2 && userIsGameMember(uidStr, gs2)) {
        return res.json({ gameId: gs2.gameId, alreadyMember: true });
      }
      return res.status(404).json({ error: 'Invalid or expired invite', code: 'INVITE_INVALID' });
    }
    try {
      const { clearDraftPartyTtlIfMultiMember } = require('../services/draftPartyTtl');
      await clearDraftPartyTtlIfMultiMember(gs.gameId);
    } catch (e) {
      console.warn('clearDraftPartyTtlIfMultiMember after join:', e);
    }
    try {
      const { notifyGameStateUpdated } = require('../services/gameStateSseHub');
      notifyGameStateUpdated(gs.gameId);
    } catch (e) {
      /* ignore */
    }
    res.json({ gameId: gs.gameId, alreadyMember: false });
  } catch (e) {
    console.error('POST /api/auth/join failed:', e);
    return res.status(500).json({ error: 'Join failed' });
  }
});

/**
 * PATCH { nickname } — set display name (required for new players; 1–40 chars after trim).
 */
router.patch('/nickname', requireAuth, async (req, res) => {
  try {
    const raw = req.body && req.body.nickname;
    const nickname = typeof raw === 'string' ? raw.trim() : '';
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
      return res.status(400).json({
        error: `Nickname must be between ${NICKNAME_MIN} and ${NICKNAME_MAX} characters.`,
        code: 'NICKNAME_INVALID',
      });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    user.nickname = nickname;
    await user.save();
    res.json({ user: userPublicFields(user) });
  } catch (e) {
    console.error('PATCH /api/auth/nickname failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not save nickname' });
  }
});

/** GET current session (optional helper for client refresh) */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: userPublicFields(user),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load user' });
  }
});

module.exports = router;
