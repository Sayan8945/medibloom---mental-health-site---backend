const mongoose = require('mongoose');

/**
 * Caches the last generated recommendation set for a user, tied to the
 * survey response it was generated from. On each request the controller
 * checks whether the user's latest response still matches `sourceResponseId`
 * — if so, the cached set is served instead of calling Gemini again.
 * One document per user (upserted), so this table never grows unbounded.
 */
const recommendationSetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // The SurveyResponse these recommendations were generated from.
    // null for generic (non-personalized) sets.
    sourceResponseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SurveyResponse',
      default: null,
    },
    personalized: { type: Boolean, default: false },
    recommendations: { type: Array, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RecommendationSet', recommendationSetSchema);
