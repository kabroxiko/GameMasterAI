const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    googleSub: { type: String, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    name: { type: String, trim: true },
    picture: { type: String, trim: true },
    /** In-game display name; required before using the app (set once via PATCH /api/auth/nickname). */
    nickname: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
