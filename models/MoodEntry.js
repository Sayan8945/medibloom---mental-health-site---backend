const mongoose = require('mongoose');

/**
 * One document per user per day. `date` is always normalized to UTC
 * midnight (see utils/moodUtils.js#startOfDay) so the compound unique index
 * enforces "one check-in per day" at the database level.
 *
 * Mood scale (1-5, higher = better — mirrors utils/scoring.js convention):
 *   5 Very Happy 😊  4 Happy 🙂  3 Neutral 😐  2 Sad 😔  1 Very Stressed 😰
 */
const moodEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    energyLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    stressLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    sleepQuality: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 250,
      trim: true,
    },
    // Normalized to UTC midnight — the "day" this check-in belongs to.
    date: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// One check-in per user per day — enforced at the database level.
moodEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MoodEntry', moodEntrySchema);
