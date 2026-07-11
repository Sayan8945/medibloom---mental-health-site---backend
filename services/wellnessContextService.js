/**
 * Wellness context service — builds a compact, token-efficient summary of a
 * user's wellness journey for the Gemini chatbot. Reuses the canonical
 * scoring logic in utils/scoring.js so numbers always match what the user
 * sees on the Analytics / Survey History pages.
 *
 * Never sends full survey documents anywhere — only summarized scores,
 * bands, and trends.
 */
const SurveyResponse = require('../models/SurveyResponse');
const { computeScores } = require('../utils/scoring');

// Only need the latest 2 responses to compute "current vs previous" trends
const RECENT_LIMIT = 2;

// Qualitative band for a 0-100 score (higher = better across all dimensions)
function band(score) {
  if (score === null || score === undefined) return 'Unknown';
  if (score >= 70) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Needs Attention';
}

// Trend direction between the latest and previous score for a dimension
function trend(current, previous) {
  if (current === null || current === undefined) return 'Stable';
  if (previous === null || previous === undefined) return 'Stable';
  const delta = current - previous;
  if (delta >= 5) return 'Improving';
  if (delta <= -5) return 'Declining';
  return 'Stable';
}

/**
 * Build a compact wellness context object for a user, for use in an AI
 * system prompt. Returns { hasData: false } when the user has no completed
 * assessments (first-time users, guests, etc.) — the caller should fall
 * back to fully generic chatbot behaviour in that case.
 *
 * @param {import('mongoose').Types.ObjectId|string} userId
 */
async function getUserWellnessContext(userId) {
  if (!userId) return { hasData: false };

  const [assessmentsCompleted, recent] = await Promise.all([
    SurveyResponse.countDocuments({ userId }),
    SurveyResponse.find({ userId })
      .select('submittedAt createdAt basicInfo emotional anxiety depression social lifestyle stress')
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(RECENT_LIMIT)
      .lean(),
  ]);

  if (assessmentsCompleted === 0 || recent.length === 0) {
    return { hasData: false };
  }

  const [latestDoc, previousDoc] = recent;
  const latest   = computeScores(latestDoc);
  const previous = previousDoc ? computeScores(previousDoc) : null;

  const lastAssessmentDate = latestDoc.submittedAt || latestDoc.createdAt;
  const daysSinceLastSurvey = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastAssessmentDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    hasData: true,
    assessmentsCompleted,
    lastAssessmentDate,
    daysSinceLastSurvey,

    wellnessScore: latest.overall,      wellnessBand: band(latest.overall),
    stressScore: latest.stress,         stressBand: band(latest.stress),
    anxietyScore: latest.anxiety,       anxietyBand: band(latest.anxiety),
    depressionScore: latest.depression, depressionBand: band(latest.depression),
    sleepScore: latest.sleep,           sleepBand: band(latest.sleep),
    lifestyleScore: latest.lifestyle,   lifestyleBand: band(latest.lifestyle),
    socialScore: latest.social,         socialBand: band(latest.social),

    wellnessTrend: trend(latest.overall, previous?.overall),
    stressTrend: trend(latest.stress, previous?.stress),
    anxietyTrend: trend(latest.anxiety, previous?.anxiety),
    depressionTrend: trend(latest.depression, previous?.depression),
    sleepTrend: trend(latest.sleep, previous?.sleep),

    age: latestDoc.basicInfo?.age || null,
    occupation: latestDoc.basicInfo?.occupation || null,
  };
}

module.exports = { getUserWellnessContext };
