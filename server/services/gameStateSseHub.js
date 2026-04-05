/**
 * In-process realtime fan-out: when GameState is persisted, subscribers for that gameId get a lightweight event.
 * - SSE: GET /api/game-state/events/:gameId (EventSource)
 * - WebSocket: WS /api/game-state/ws/:gameId?access_token=…
 * Clients still use GET /api/game-state/load to fetch the snapshot (no full state over the wire here).
 */

const WebSocketLib = require('ws');
const WS_OPEN = WebSocketLib.WebSocket.OPEN;

/** @type {Map<string, Set<{ res: import('express').Response, gameId: string, heartbeat: ReturnType<typeof setInterval> | null }>>} */
const subscribersByGame = new Map();

/** @type {Map<string, Set<{ ws: import('ws').WebSocket, userId: string }>>} */
const wsSubscribersByGame = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const debounceByGame = new Map();

const DEBOUNCE_MS = 150;

function detachSseClient(gameId, client) {
  if (client.heartbeat) {
    clearInterval(client.heartbeat);
    client.heartbeat = null;
  }
  const bucket = subscribersByGame.get(gameId);
  if (!bucket) return;
  bucket.delete(client);
  if (bucket.size === 0) subscribersByGame.delete(gameId);
}

function detachWsClient(gameId, entry) {
  const bucket = wsSubscribersByGame.get(gameId);
  if (!bucket) return;
  bucket.delete(entry);
  if (bucket.size === 0) wsSubscribersByGame.delete(gameId);
}

/**
 * @param {string} gameId
 * @param {string} _userId
 * @param {import('express').Response} res
 * @returns {() => void}
 */
function attachSseClient(gameId, _userId, res) {
  const gid = String(gameId || '').trim();
  if (!gid) {
    return () => {};
  }
  let bucket = subscribersByGame.get(gid);
  if (!bucket) {
    bucket = new Set();
    subscribersByGame.set(gid, bucket);
  }
  const client = { res, gameId: gid, heartbeat: null };
  bucket.add(client);
  client.heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      detachSseClient(gid, client);
    }
  }, 28000);
  return () => detachSseClient(gid, client);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} gameId
 * @param {string} userId
 * @returns {() => void}
 */
function attachGameStateWebSocketClient(ws, gameId, userId) {
  const gid = String(gameId || '').trim();
  const uid = String(userId || '').trim();
  if (!gid || !uid) {
    return () => {};
  }
  let bucket = wsSubscribersByGame.get(gid);
  if (!bucket) {
    bucket = new Set();
    wsSubscribersByGame.set(gid, bucket);
  }
  const entry = { ws, userId: uid };
  bucket.add(entry);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    detachWsClient(gid, entry);
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
  return cleanup;
}

function flushNotify(gid) {
  debounceByGame.delete(gid);
  const payload = JSON.stringify({ type: 'game-state-updated', gameId: gid });
  const line = `event: message\ndata: ${payload}\n\n`;

  const sseBucket = subscribersByGame.get(gid);
  if (sseBucket && sseBucket.size > 0) {
    for (const client of [...sseBucket]) {
      try {
        client.res.write(line);
      } catch (e) {
        detachSseClient(gid, client);
      }
    }
  }

  const wsBucket = wsSubscribersByGame.get(gid);
  if (wsBucket && wsBucket.size > 0) {
    for (const c of [...wsBucket]) {
      if (c.ws.readyState === WS_OPEN) {
        try {
          c.ws.send(payload);
        } catch (e) {
          detachWsClient(gid, c);
        }
      }
    }
  }
}

/**
 * Call after a successful GameState write so other tabs/players can soft-refresh.
 * Debounced per gameId to coalesce rapid writes.
 * @param {string} [gameId]
 */
function notifyGameStateUpdated(gameId) {
  const gid = gameId != null ? String(gameId).trim() : '';
  if (!gid) return;
  const prev = debounceByGame.get(gid);
  if (prev) clearTimeout(prev);
  debounceByGame.set(
    gid,
    setTimeout(() => {
      flushNotify(gid);
    }, DEBOUNCE_MS)
  );
}

module.exports = {
  attachSseClient,
  attachGameStateWebSocketClient,
  notifyGameStateUpdated,
};
