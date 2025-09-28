const { Schema } = require('mongoose');
const PlayerRefSchema = new Schema({
  socketId: { type: String, required: true },
  playerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
  username: { type: String, required: true },
  score: { type: Number, default: 0 },
  attemptsLeft: { type: Number, default: 0 },
  isMaster: { type: Boolean, default: false }
}, { _id: false });

const RoomSchema = new Schema({
  roomId: { type: String, required: true, unique: true },
  masterId: { type: String },
  players: { type: [PlayerRefSchema], default: [] },
  state: { type: String, enum: ['waiting', 'in_progress'], default: 'waiting' },
  question: { type: String, default: null },
  answer: { type: String, default: null },
  duration: { type: Number, default: 60 },
  points: { type: Number, default: 10 },
  public: { type: Boolean, default: true },
  timeoutAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose => mongoose.model('Room', RoomSchema);
