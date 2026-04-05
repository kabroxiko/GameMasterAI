const { verifySessionToken } = require('../auth/jwtSession');

function resolveBearerOrQueryToken(req) {
  const raw = req.headers.authorization;
  if (raw && typeof raw === 'string' && raw.startsWith('Bearer ')) {
    return raw.slice(7).trim();
  }
  const q = req.query && req.query.access_token;
  if (q != null && String(q).trim()) return String(q).trim();
  return null;
}

/**
 * Requires `Authorization: Bearer <jwt>`. Sets req.userId.
 * (Legacy tokens may still carry email/name claims; we do not expose them on req.)
 */
function requireAuth(req, res, next) {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  const token = raw.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
  }
  req.userId = String(payload.sub);
  next();
}

/**
 * Bearer **or** `?access_token=` (EventSource cannot set Authorization in all environments).
 */
function requireAuthSse(req, res, next) {
  const token = resolveBearerOrQueryToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }
  const payload = verifySessionToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
  }
  req.userId = String(payload.sub);
  next();
}

module.exports = { requireAuth, requireAuthSse, resolveBearerOrQueryToken };
