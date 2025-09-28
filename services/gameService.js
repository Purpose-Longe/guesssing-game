const shortid = require('shortid');

module.exports = (RoomModel, PlayerModel, timers) => {

  function sanitizeName(name) {
    if (!name) return null;
    name = String(name).trim();
    if (name.length === 0 || name.length > 24) return null;
    return name.replace(/[^a-zA-Z0-9 _\-]/g, '').slice(0,24);
  }

  async function createRoom({ requestedId, masterSocketId, username, opts = {}, playerId = null }) {
    username = sanitizeName(username);
    if (!username) throw new Error('Invalid username');
    const roomId = requestedId ? String(requestedId).trim() : shortid.generate();
    const existing = await RoomModel.findOne({ roomId });
    if (existing) throw new Error('Room already exists');
    const p = { socketId: masterSocketId, username, isMaster: true, score: 0, attemptsLeft: 0, playerId: playerId || null };
    const room = new RoomModel({
      roomId,
      masterId: masterSocketId,
      players: [p],
      public: opts.public ?? true,
      duration: opts.duration ?? 60,
      points: opts.points ?? 10
    });
    await room.save();
    return room;
  }

  async function joinRoom({ roomId, socketId, username, playerId = null }) {
    username = sanitizeName(username);
    if (!username) throw new Error('Invalid username');
    const room = await RoomModel.findOne({ roomId });
    if (!room) throw new Error('Room not found');
    if (room.state === 'in_progress') throw new Error('Game in progress. Cannot join');

    if (room.players.some(p => p.username === username)) username = `${username}_${shortid.generate().slice(0,3)}`;

    room.players.push({ socketId, username, isMaster: false, score: 0, attemptsLeft: 0, playerId: playerId || null });
    await room.save();
    return room;
  }

  async function setQuestion({ roomId, socketId, question, answer }) {
    if (!question || !answer) throw new Error('Question and answer required');
    const room = await RoomModel.findOne({ roomId });
    if (!room) throw new Error('Room not found');
    if (room.masterId !== socketId) throw new Error('Only master can set question');
    if (room.state === 'in_progress') throw new Error('Cannot set question while in progress');
    room.question = String(question).trim().slice(0,500);
    room.answer = String(answer).trim();
    await room.save();
    return room;
  }

  async function startGame({ roomId, socketId, duration }) {
    const room = await RoomModel.findOne({ roomId });
    if (!room) throw new Error('Room not found');
    if (room.masterId !== socketId) throw new Error('Only master can start');
    if (room.state === 'in_progress') throw new Error('Already in progress');
    if (!room.question || !room.answer) throw new Error('Set question & answer before starting');
    if (room.players.length < 3) throw new Error('Need at least 3 players to start');

    const roundDuration = Number(duration) > 0 ? Number(duration) : room.duration;
    room.state = 'in_progress';
    room.players = room.players.map(p => {
      p.attemptsLeft = p.isMaster ? 0 : 3;
      return p;
    });
    room.timeoutAt = new Date(Date.now() + roundDuration*1000);
    await room.save();

    if (timers[roomId]) { clearTimeout(timers[roomId]); delete timers[roomId]; }
    timers[roomId] = setTimeout(async () => {
      await endRoundNoWinner(roomId, 'Time expired');
    }, roundDuration*1000);

    return room;
  }

  async function handleGuess({ roomId, socketId, guess }) {
    if (!guess) throw new Error('Empty guess');
    const room = await RoomModel.findOne({ roomId });
    if (!room) throw new Error('Room not found');
    if (room.state !== 'in_progress') throw new Error('No active round');

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) throw new Error('You are not in this room');
    if (player.isMaster) throw new Error('Master cannot guess');
    if (player.attemptsLeft <= 0) throw new Error('No attempts left');

    player.attemptsLeft -= 1;
    const normalizedGuess = String(guess).trim().toLowerCase();
    const normalizedAnswer = String(room.answer).trim().toLowerCase();

    if (normalizedGuess === normalizedAnswer) {
      player.score += room.points;
      // update persistent player score if exists
      if (player.playerId) {
        try {
          await PlayerModel.findByIdAndUpdate(player.playerId, { $inc: { totalScore: room.points } }, { new: true });
        } catch (e) {
          console.warn('Failed to update persistent player score', e);
        }
      }

      if (timers[roomId]) { clearTimeout(timers[roomId]); delete timers[roomId]; }

      const winner = { socketId: player.socketId, username: player.username };

      rotateMasterInRoom(room);

      room.question = null;
      room.answer = null;
      room.state = 'waiting';
      room.timeoutAt = null;

      await room.save();
      return { room, winner };
    }

    await room.save();

    const anyLeft = room.players.some(p => !p.isMaster && p.attemptsLeft > 0);
    if (!anyLeft) {
      if (timers[roomId]) { clearTimeout(timers[roomId]); delete timers[roomId]; }
      await endRoundNoWinner(roomId, 'All attempts used');
      return { room, winner: null };
    }

    return { room, correct: false, attemptsLeft: player.attemptsLeft };
  }

  async function endRoundNoWinner(roomId, reason = 'Time expired') {
    const room = await RoomModel.findOne({ roomId });
    if (!room) return null;

    rotateMasterInRoom(room);
    room.question = null;
    room.answer = null;
    room.state = 'waiting';
    room.timeoutAt = null;
    await room.save();

    if (timers[roomId]) { clearTimeout(timers[roomId]); delete timers[roomId]; }
    return { room, reason };
  }

  function rotateMasterInRoom(room) {
    if (!room) return;
    let idx = room.players.findIndex(p => p.socketId === room.masterId);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + 1) % room.players.length;
    room.players.forEach(p => p.isMaster = false);
    room.players[nextIdx].isMaster = true;
    room.masterId = room.players[nextIdx].socketId;
  }

  async function leaveRoom({ roomId, socketId }) {
    const room = await RoomModel.findOne({ roomId });
    if (!room) return null;
    const idx = room.players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return room;
    const removed = room.players.splice(idx,1)[0];

    if (room.players.length === 0) {
      await RoomModel.deleteOne({ roomId });
      if (timers[roomId]) { clearTimeout(timers[roomId]); delete timers[roomId]; }
      return null;
    }

    if (removed.socketId === room.masterId) rotateMasterInRoom(room);
    await room.save();
    return room;
  }

  async function getPublicRooms() {
    return RoomModel.find({ public: true }).select('roomId players state createdAt').lean().exec();
  }

  async function getLeaderboard(limit = 20) {
    // persistent player leaderboard from PlayerModel
    return PlayerModel.find().sort({ totalScore: -1 }).limit(limit).select('username totalScore -_id').lean().exec();
  }

  return {
    createRoom, joinRoom, setQuestion, startGame, handleGuess, endRoundNoWinner, leaveRoom, getPublicRooms, getLeaderboard
  };
};
