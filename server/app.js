const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { pool, withTransaction } = require('./db');
const sseManager = require('./sseManager');
const { isUuid, generateUniqueCode, sendJson } = require('./utils');

function createApp() {
  const app = express();
  // keep legacy name sendEvent for backward compatibility in this file
  const sendEvent = sseManager.broadcast;

  // Expose X-Server-Now header to browsers so clients can read server time without changing response shapes
  app.use(cors({ exposedHeaders: ['X-Server-Now'] }));
  app.use(express.json());
  // Respond to CORS preflight requests for all routes
  app.options('*', cors());

  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // For SPA routes, fallback to index.html for GET requests not matching API/SSE
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/sse')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.get('/sse/:channel', (req, res) => {
    const { channel } = req.params;
    res.set({
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    });
    res.flushHeaders();
    const unsub = sseManager.subscribe(channel, res);

    req.on('close', () => {
      try { unsub(); } catch (e) { /* ignore */ }
    });
  });

  // mount routers
  const messagesRouter = require('./routes/messages')({ pool, sseManager, utils: { isUuid, sendJson } });
  app.use('/api/messages', messagesRouter);

  const attemptsRouter = require('./routes/attempts')({ pool, sseManager, utils: { sendJson } });
  app.use('/api', attemptsRouter);

  const sessionsRouter = require('./routes/sessions')({ pool, sseManager, utils: { generateUniqueCode, sendJson } });
  app.use('/api/sessions', sessionsRouter);

  const playersRouter = require('./routes/players')({ pool, sseManager, utils: { isUuid, sendJson } });
  app.use('/api/players', playersRouter);

  // Admin routes (mounted only when ADMIN_CLEANUP_TOKEN is set)
  try {
    if (process.env.ADMIN_CLEANUP_TOKEN) {
      const adminRouter = require('./routes/admin')({ pool, utils: { sendJson } });
      app.use('/api/admin', adminRouter);
    } else {
      console.info('ADMIN_CLEANUP_TOKEN not set; admin routes not mounted');
    }
  } catch (e) {
    // If admin routes can't be loaded for any reason, log and continue without crashing
    console.warn('admin routes not mounted', e && e.message);
  }

  return app;
}

module.exports = { createApp };
