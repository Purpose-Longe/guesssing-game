require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const debug = require('debug')('app:server');
const db = require('./config/db');
const PORT = process.env.PORT || 3000;

(async () => {
  await db.connect(process.env.MONGODB_URI);
  const mongoose = db.mongoose;
  const RoomModel = require('./models/Room')(mongoose);
  const PlayerModel = require('./models/Player')(mongoose);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const timers = {}; // in-memory timers map

  const gameServiceFactory = require('./services/gameService');
  const gameService = gameServiceFactory(RoomModel, PlayerModel, timers);

  // REST routes (auth + api)
  require('./routes/api')({ app, RoomModel, PlayerModel, gameService });

  // socket handlers
  require('./sockets/socketHandler')({ io, RoomModel, PlayerModel, gameService, timers });

  // Recover timers for in-progress rooms on boot
  async function recoverTimersOnBoot() {
    try {
      const rooms = await RoomModel.find({ state: 'in_progress', timeoutAt: { $ne: null } }).exec();
      for (const r of rooms) {
        const msLeft = new Date(r.timeoutAt).getTime() - Date.now();
        if (msLeft <= 0) {
          // expired already — end the round without winner
          await gameService.endRoundNoWinner(r.roomId, 'Recovered: already expired');
          debug(`Recovered room ${r.roomId}: already expired, ended round.`);
        } else {
          // schedule timer to end round when remaining time elapses
          if (timers[r.roomId]) clearTimeout(timers[r.roomId]);
          timers[r.roomId] = setTimeout(async () => {
            await gameService.endRoundNoWinner(r.roomId, 'Recovered: time expired');
          }, msLeft);
          debug(`Recovered room ${r.roomId}: timer set for ${msLeft}ms`);
        }
      }
    } catch (err) {
      console.error('Error recovering timers on boot', err);
    }
  }

  await recoverTimersOnBoot();

  server.listen(PORT, () => debug(`Server listening on http://localhost:${PORT}`));
})();
