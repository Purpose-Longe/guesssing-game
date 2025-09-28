const jwt = require('jsonwebtoken');

module.exports = ({ io, RoomModel, PlayerModel, gameService, timers }) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('authenticate', async ({ token }, cb) => {
      try {
        if (!token) return cb?.({ error: 'No token provided' });
        const payload = jwt.verify(token, JWT_SECRET);
        // payload: { userId, username }
        socket.data.userId = payload.userId;
        socket.data.username = payload.username;
        cb?.({ ok: true });
      } catch (err) {
        cb?.({ error: 'Invalid token' });
      }
    });

    socket.on('create_session', async ({ username, roomId, public: isPublic, duration, points }, cb) => {
      try {
        // if authenticated, use persistent user info
        const playerId = socket.data.userId || null;
        const uname = socket.data.username || username;
        const room = await gameService.createRoom({ requestedId: roomId, masterSocketId: socket.id, username: uname, opts: { public: !!isPublic, duration, points }, playerId });
        socket.join(room.roomId);
        socket.data.roomId = room.roomId;
        socket.data.username = uname;
        cb?.({ ok: true, roomId: room.roomId });
        io.to(room.roomId).emit('system_message', `${uname} created the session`);
        emitRoomUpdate(room.roomId);
      } catch (err) {
        cb?.({ error: err.message });
      }
    });

    socket.on('join_session', async ({ username, roomId }, cb) => {
      try {
        const playerId = socket.data.userId || null;
        const uname = socket.data.username || username;
        const room = await gameService.joinRoom({ roomId, socketId: socket.id, username: uname, playerId });
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.username = uname;
        cb?.({ ok: true, roomId });
        io.to(roomId).emit('system_message', `${uname} joined the session`);
        emitRoomUpdate(roomId);
      } catch (err) {
        cb?.({ error: err.message });
      }
    });

    socket.on('set_question', async ({ roomId, question, answer }, cb) => {
      try {
        const room = await gameService.setQuestion({ roomId, socketId: socket.id, question, answer });
        cb?.({ ok: true });
        io.to(roomId).emit('system_message', 'Game master has created a question');
        emitRoomUpdate(roomId);
      } catch (err) { cb?.({ error: err.message }); }
    });

    socket.on('start_game', async ({ roomId, duration }, cb) => {
      try {
        const room = await gameService.startGame({ roomId, socketId: socket.id, duration });
        io.to(roomId).emit('round_started', { question: room.question, duration: room.timeoutAt ? Math.round((new Date(room.timeoutAt) - Date.now())/1000) : room.duration });
        emitRoomUpdate(roomId);
        cb?.({ ok: true });
      } catch (err) { cb?.({ error: err.message }); }
    });

    socket.on('guess', async ({ roomId, guess }, cb) => {
      try {
        const res = await gameService.handleGuess({ roomId, socketId: socket.id, guess });
        if (res.winner) {
          io.to(roomId).emit('round_ended', { winner: res.winner, answer: res.room ? res.room.answer : null });
        } else if (res.correct === false) {
          io.to(roomId).emit('player_update', { id: socket.id, attemptsLeft: res.attemptsLeft });
        }
        emitRoomUpdate(roomId);
        cb?.({ ok: true, correct: !!res.winner });
      } catch (err) { cb?.({ error: err.message }); }
    });

    socket.on('send_message', ({ roomId, text }, cb) => {
      const from = socket.data.username || 'Anon';
      io.to(roomId).emit('chat_message', { from, text: String(text || ''), ts: Date.now(), id: socket.id });
      cb?.({ ok: true });
    });

    socket.on('private_message', ({ toSocketId, text }, cb) => {
      const from = socket.data.username || 'Anon';
      io.to(toSocketId).emit('private_message', { from, text, ts: Date.now(), fromId: socket.id });
      cb?.({ ok: true });
    });

    socket.on('leave_session', async ({ roomId }, cb) => {
      try {
        const room = await gameService.leaveRoom({ roomId, socketId: socket.id });
        socket.leave(roomId);
        socket.data.roomId = null;
        cb?.({ ok: true });
        if (room) io.to(roomId).emit('system_message', `${socket.data.username || 'A player'} left the session`);
        emitRoomUpdate(roomId);
      } catch (err) { cb?.({ error: err.message }); }
    });

    socket.on('disconnect', async () => {
      const rid = socket.data.roomId;
      if (rid) {
        await gameService.leaveRoom({ roomId: rid, socketId: socket.id });
        emitRoomUpdate(rid);
      }
    });

    async function emitRoomUpdate(roomId) {
      const room = await RoomModel.findOne({ roomId });
      if (!room) return;
      const players = room.players.map(p => ({ socketId: p.socketId, username: p.username, score: p.score, attemptsLeft: p.attemptsLeft, isMaster: p.isMaster }));
      io.to(roomId).emit('room_update', { id: roomId, players, state: room.state, playerCount: room.players.length, masterId: room.masterId, timeoutAt: room.timeoutAt });
    }
  });
};
