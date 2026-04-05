// Express app (API routes + CORS). No Mongo connect, no listen — see server.js.
const express = require('express');
const bodyParser = require('body-parser');

const gameSessionRouter = require('./routes/gameSession');
const gameStateRoutes = require('./routes/gameState');
const authRoutes = require('./routes/authRoutes');

const FRONTEND_URL = (process.env.DM_FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');

/** Public browser URL when served behind a reverse proxy (https://game.example.com). Used for CORS. */
const DM_PUBLIC_URL = (process.env.DM_PUBLIC_URL || '').trim().replace(/\/$/, '');

/**
 * Express "trust proxy" so req.ip, req.protocol, req.secure follow X-Forwarded-* / Forwarded when
 * DM_TRUST_PROXY is set (required behind nginx, Caddy, Traefik, etc.).
 * @returns {boolean | number | string | undefined} value passed to app.set('trust proxy', …)
 */
function resolveTrustProxySetting() {
  const raw = process.env.DM_TRUST_PROXY;
  if (raw == null || raw === '') {
    return undefined;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  const n = parseInt(raw, 10);
  if (String(n) === raw.trim() && n >= 0) return n;
  return raw.trim();
}

function buildAllowedOrigins() {
  const list = new Set([FRONTEND_URL]);
  if (DM_PUBLIC_URL) list.add(DM_PUBLIC_URL);
  (process.env.DM_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .forEach((o) => list.add(o));
  try {
    const href = /^https?:\/\//i.test(FRONTEND_URL) ? FRONTEND_URL : `http://${FRONTEND_URL}`;
    const u = new URL(href);
    if (u.port) {
      list.add(`http://localhost:${u.port}`);
      list.add(`http://127.0.0.1:${u.port}`);
    }
  } catch (e) {
    /* ignore */
  }
  return [...list];
}

/**
 * Best-effort public origin for this request (after trust proxy). For logging/diagnostics only;
 * do not use unvalidated Host for security decisions.
 */
function getRequestPublicOrigin(req) {
  if (!req || typeof req.get !== 'function') return null;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  if (!host) return null;
  return `${proto}://${host}`.replace(/\/$/, '');
}

function createHttpApp() {
  const allowedOrigins = buildAllowedOrigins();
  const app = express();

  const trustProxy = resolveTrustProxySetting();
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'test') {
      res.header('Access-Control-Allow-Origin', origin || '*');
    } else {
      if (!origin) {
        res.header('Access-Control-Allow-Origin', '*');
      } else if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      } else {
        res.header('Access-Control-Allow-Origin', FRONTEND_URL);
      }
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/game-session', gameSessionRouter);
  app.use('/api/game-state', gameStateRoutes);

  /**
   * Public deploy probe (no auth). After deploy, curl this URL; if `deployMarker` is missing or stale,
   * the Node process does not include recent route changes (e.g. generate-character policy).
   */
  app.get('/api/meta', (req, res) => {
    res.json({
      api: 'gmai',
      deployMarker: '2026-03-31-generate-character-no-campaign-gate',
    });
  });

  return app;
}

module.exports = {
  createHttpApp,
  FRONTEND_URL,
  DM_PUBLIC_URL,
  resolveTrustProxySetting,
  getRequestPublicOrigin,
  buildAllowedOrigins,
};
