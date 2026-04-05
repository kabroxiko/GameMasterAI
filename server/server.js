// Temporary shim to avoid Node deprecation warnings from old dependencies that call util._extend.
try {
  const util = require('util');
  if (util && typeof util._extend === 'function') {
    util._extend = Object.assign;
  }
} catch (e) {
  /* ignore */
}

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const mongoose = require('mongoose');
const { createHttpApp, FRONTEND_URL, buildAllowedOrigins, resolveTrustProxySetting } = require('./httpApp');
const { setupGameStateWebSocketUpgrade } = require('./setupGameStateWebSocket');

const app = createHttpApp();
const httpServer = http.createServer(app);
setupGameStateWebSocketUpgrade(httpServer);

mongoose
  .connect(process.env.DM_MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      const { recoverPendingGameStateOnStartup } = require('./services/recoverPendingGameStateOnStartup');
      await recoverPendingGameStateOnStartup();
    } catch (e) {
      console.warn('recoverPendingGameStateOnStartup failed:', e);
    }
  })
  .catch((error) => console.error('Error connecting to MongoDB:', error));

function resolveSpaDistDir() {
  const v = process.env.DM_SERVE_SPA_DIST;
  if (!v || v === '0' || v === 'false') return null;
  if (v === '1' || v === 'true') {
    return path.join(__dirname, '..', 'client', 'dungeonmaster', 'dist');
  }
  return path.isAbsolute(v) ? v : path.join(__dirname, '..', v);
}

const spaDistDir = resolveSpaDistDir();
if (spaDistDir) {
  const express = require('express');
  if (fs.existsSync(spaDistDir)) {
    app.use(express.static(spaDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(path.join(spaDistDir, 'index.html'), (err) => next(err));
    });
    console.log(`Serving SPA static files from ${spaDistDir}`);
  } else {
    console.warn(`DM_SERVE_SPA_DIST is set but dist folder not found: ${spaDistDir}`);
  }
}

const PORT = process.env.PORT || 5001;
const BIND_HOST = process.env.DM_BIND_HOST || process.env.HOST;

if (require.main === module) {
  const onListen = () => {
    const bindLabel = BIND_HOST || '(all interfaces)';
    console.log(`Server listening on ${bindLabel} port ${PORT}`);
    console.log(`FRONTEND_URL=${FRONTEND_URL}  NODE_ENV=${process.env.NODE_ENV || 'undefined'}`);
    const tp = resolveTrustProxySetting();
    console.log(`DM_TRUST_PROXY=${tp === undefined ? '(unset, Express default)' : JSON.stringify(tp)}`);
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'dev') {
      console.log('CORS allowed origins:', buildAllowedOrigins().join(', '));
    }
  };
  if (BIND_HOST) {
    httpServer.listen(PORT, BIND_HOST, onListen);
  } else {
    httpServer.listen(PORT, onListen);
  }
}

module.exports = app;
