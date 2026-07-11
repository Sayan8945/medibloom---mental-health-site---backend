/**
 * Wellness scoring — mirrors the frontend scoring logic exactly
 * (frontend: StepResults.jsx / SurveyHistoryPage.jsx computeScores).
 * Keep these two in sync. All scores are 0-100 where higher = better.
 */

const avg = (vals) => {
  const clean = vals.filter((v) => v !== null && v !== undefined && !isNaN(v));
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

const invert = (score, max = 4) =>
  score === null || score === undefined ? null : max - score;

const toPercent = (score, max = 4) =>
  score === null || score === undefined ? 50 : Math.round((score / max) * 100);

/**
 * Compute the six dimension scores + overall from a survey response document.
 * @param {Object} r  A SurveyResponse (plain object)
 * @returns {{emotional,anxiety,depression,social,stress,lifestyle,overall}}
 */
function computeScores(r = {}) {
  const em = r.emotional || {};
  const a  = r.anxiety   || {};
  const d  = r.depression || {};
  const so = r.social    || {};
  const l  = r.lifestyle || {};
  const s  = r.stress    || {};

  const emotionalRaw = avg([
    em.happiness, em.motivation, em.hopefulness, em.emotionalStability,
    invert(em.loneliness), invert(em.irritability), invert(em.moodChanges),
  ]);
  const anxietyRaw = avg([
    a.nervousWithoutReason, a.excessiveWorry, a.difficultyRelaxing,
    a.racingThoughts, a.avoidanceBehavior, a.frequentTension,
  ]);
  const depressionRaw = avg([
    d.lostInterest, d.fatigue, d.concentrationIssues,
    d.feelHopeless, d.feelWorthless, d.difficultyGettingUp, d.emotionallyNumb,
  ]);
  const socialRaw = avg([
    so.familySupport, so.friendSupport, so.socialInteraction,
    so.expressEmotions, so.senseOfBelonging, so.communityInvolvement,
  ]);
  const stressRaw = avg([
    s.workStressLevel, s.deadlineStruggle, s.feelOverwhelmed,
    invert(s.enjoyWork), s.experienceBurnout,
  ]);
  const lifestyleScore =
    l.sleepQuality && l.waterIntake
      ? ((l.sleepQuality / 5) * 0.4 +
         (Math.min(l.waterIntake, 10) / 10) * 0.3 +
         ((l.outdoorActivity || 0) / 7) * 0.3) * 100
      : 50;

  // Sleep score derived from sleepQuality (1-5 → 0-100)
  const sleep = l.sleepQuality ? Math.round((l.sleepQuality / 5) * 100) : 50;

  const emotional  = toPercent(emotionalRaw);
  const anxiety    = toPercent(invert(anxietyRaw));
  const depression = toPercent(invert(depressionRaw));
  const social     = toPercent(socialRaw);
  const stress     = toPercent(invert(stressRaw));
  const lifestyle  = Math.round(lifestyleScore);
  const overall    = Math.round(
    (emotional + anxiety + depression + social + stress + lifestyle) / 6
  );

  return { emotional, anxiety, depression, social, stress, lifestyle, sleep, overall };
}

module.exports = { computeScores };
