const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    provider: {
      type: String,
      enum: ['google'],
      default: 'google',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    // ── User-controlled preferences ──────────────────────────
    settings: {
      // "Allow AI assistant to use my survey history for personalized responses"
      personalizedAI: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
