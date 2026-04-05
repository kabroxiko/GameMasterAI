const WebSocket = require('ws');
const { URL } = require('url');
const { verifySessionToken } = require('./auth/jwtSession');
const { assertGameMember } = require('./services/gameAccess');
const { attachGameStateWebSocketClient } = require('./services/gameStateSseHub');

/**
 * Attach WS upgrade handler to an HTTP server: `GET` upgrade to
 * `/api/game-state/ws/:gameId?access_token=<jwt>` (same auth model as SSE).
 * @param {import('http').Server} httpServer
 */
function setupGameStateWebSocketUpgrade(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let u;
    try {
      const host = req.headers.host || '127.0.0.1';
      u = new URL(req.url, `http://${host}`);
    } catch (e) {
      socket.destroy();
      return;
    }

    const m = u.pathname.match(/^\/api\/game-state\/ws\/(.+)$/);
    if (!m) {
      socket.destroy();
      return;
    }

    const gameId = decodeURIComponent(m[1]);
    const token = u.searchParams.get('access_token');
    if (!token || !String(token).trim()) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      } catch (e) {
        /* ignore */
      }
      socket.destroy();
      return;
    }

    const jwtPayload = verifySessionToken(String(token).trim());
    if (!jwtPayload || !jwtPayload.sub) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      } catch (e) {
        /* ignore */
      }
      socket.destroy();
      return;
    }

    const userId = String(jwtPayload.sub);
    socket.pause();

    (async () => {
      try {
        await assertGameMember(userId, gameId);
      } catch (err) {
        const statusLine =
          err && err.status === 404 ? '404 Not Found' : err && err.status === 400 ? '400 Bad Request' : '403 Forbidden';
        try {
          socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\n\r\n`);
        } catch (e) {
          /* ignore */
        }
        socket.destroy();
        return;
      }

      try {
        socket.resume();
      } catch (e) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        attachGameStateWebSocketClient(ws, gameId, userId);
      });
    })();
  });
}

module.exports = { setupGameStateWebSocketUpgrade };
