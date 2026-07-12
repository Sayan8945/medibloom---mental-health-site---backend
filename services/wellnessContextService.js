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
const MoodEntry = require('../models/MoodEntry');
const { computeScores } = require('../utils/scoring');
const { trendDirection, MOOD_SCALE } = require('../utils/moodUtils');

// Only need the latest 2 responses to compute "current vs previous" trends
const RECENT_LIMIT = 2;

// How many recent daily check-ins to consider for mood trend context
const RECENT_MOOD_LIMIT = 7;

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
 * system prompt. Returns { hasData: false, name } when the user has no
 * completed assessments (first-time users, guests, etc.) — the caller
 * should fall back to a lightly-personalized (name only) or fully generic
 * chatbot behaviour in that case.
 *
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} [fullName] - the authenticated user's display name, if any
 */
async function getUserWellnessContext(userId, fullName) {
  const name = fullName ? fullName.split(' ')[0] : null;
  if (!userId) return { hasData: false, name };

  const [assessmentsCompleted, recent, recentMoodEntries] = await Promise.all([
    SurveyResponse.countDocuments({ userId }),
    SurveyResponse.find({ userId })
      .select('submittedAt createdAt basicInfo emotional anxiety depression social lifestyle stress')
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(RECENT_LIMIT)
      .lean(),
    MoodEntry.find({ userId })
      .sort({ date: -1 })
      .limit(RECENT_MOOD_LIMIT)
      .lean(),
  ]);

  // Daily mood check-in context — kept separate from survey-derived
  // "hasData" below since a user may have mood check-ins without ever
  // having completed a full survey (or vice versa).
  const moodContext = buildMoodContext(recentMoodEntries);

  if (assessmentsCompleted === 0 || recent.length === 0) {
    return { hasData: false, name, ...moodContext };
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
    name,
    assessmentsCompleted,
    lastAssessmentDate,
    daysSinceLastSurvey,
    // Id of the survey response this context was built from — callers that
    // cache derived data (e.g. recommendations) key their cache on this so
    // it invalidates automatically when the user submits a new assessment.
    latestResponseId: latestDoc._id,

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

    ...moodContext,
  };
}

/**
 * Build a compact context block from a user's most recent daily mood
 * check-ins (newest first), for use alongside the survey-derived context.
 * Returns `{ hasMoodData: false }` when there are no check-ins yet.
 */
function buildMoodContext(recentMoodEntries) {
  if (!recentMoodEntries || recentMoodEntries.length === 0) {
    return { hasMoodData: false };
  }

  // Entries arrive newest-first; reverse to oldest->newest for trend calc.
  const chronological = [...recentMoodEntries].reverse();
  const latest = recentMoodEntries[0];

  return {
    hasMoodData: true,
    currentMoodLabel: MOOD_SCALE[latest.mood]?.label || 'Unknown',
    currentMoodValue: latest.mood,
    currentEnergyLevel: latest.energyLevel,
    currentStressLevel: latest.stressLevel,
    currentSleepQuality: latest.sleepQuality,
    lastCheckInDate: latest.date,
    moodTrend: trendDirection(chronological.map((e) => e.mood), 0.5),
    stressTrendRecent: trendDirection(chronological.map((e) => e.stressLevel)),
    sleepTrendRecent: trendDirection(chronological.map((e) => e.sleepQuality)),
    energyTrendRecent: trendDirection(chronological.map((e) => e.energyLevel)),
  };
}

module.exports = { getUserWellnessContext };
