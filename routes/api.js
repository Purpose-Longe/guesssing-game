const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = ({ app, RoomModel, PlayerModel, gameService }) => {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

  // Auth: register
  router.post('/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'username and password required' });
      const existing = await PlayerModel.findOne({ username });
      if (existing) return res.status(400).json({ error: 'username taken' });
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const p = new PlayerModel({ username, passwordHash });
      await p.save();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'server error' }); }
  });

  // Auth: login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'username and password required' });
      const p = await PlayerModel.findOne({ username });
      if (!p) return res.status(400).json({ error: 'invalid credentials' });
      const match = await bcrypt.compare(password, p.passwordHash || '');
      if (!match) return res.status(400).json({ error: 'invalid credentials' });
      const token = jwt.sign({ userId: p._id.toString(), username: p.username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ ok: true, token });
    } catch (err) { res.status(500).json({ error: 'server error' }); }
  });

  // public rooms
  router.get('/rooms', async (req, res) => {
    const rooms = await gameService.getPublicRooms();
    res.json({ ok: true, rooms });
  });

  // leaderboard (persistent players)
  router.get('/leaderboard', async (req, res) => {
    const list = await gameService.getLeaderboard(20);
    // normalize to expected shape
    res.json({ ok: true, leaderboard: list.map(p => ({ username: p.username, score: p.totalScore || p.score || 0 })) });
  });

  app.use('/api', router);
};
