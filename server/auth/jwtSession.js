const jwt = require('jsonwebtoken');

function jwtSecret() {
  const s = process.env.DM_JWT_SECRET;
  if (s && String(s).trim()) return String(s).trim();
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
    return 'dev-only-insecure-jwt-secret-change-for-production';
  }
  throw new Error('DM_JWT_SECRET is required in production');
}

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function signSessionToken(userDoc) {
  if (!userDoc || !userDoc._id) throw new Error('signSessionToken: invalid user');
  // Session JWT carries only the subject id — no PII in the token payload.
  const payload = { sub: String(userDoc._id) };
  return jwt.sign(payload, jwtSecret(), { expiresIn: DEFAULT_TTL_SEC });
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch (e) {
    return null;
  }
}

module.exports = {
  jwtSecret,
  signSessionToken,
  verifySessionToken,
};
