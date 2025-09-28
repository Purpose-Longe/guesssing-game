const { Schema } = require('mongoose');
const PlayerSchema = new Schema({
  username: { type: String, required: true, unique: true, maxlength: 24 },
  passwordHash: { type: String },
  totalScore: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose => mongoose.model('Player', PlayerSchema);
