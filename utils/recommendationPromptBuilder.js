/**
 * Recommendation prompt builder — turns a wellness context object (see
 * services/wellnessContextService.js) into a Gemini prompt requesting
 * structured, personalized wellness recommendations. Mirrors the style of
 * chatPromptBuilder.js.
 *
 * Icons are intentionally NOT requested from the model — the frontend maps
 * `category` to a fixed icon/colour so iconography stays consistent
 * regardless of what the model returns.
 */

// Static, curated fallback used when the user has no survey data yet, or
// has disabled personalized AI. No Gemini call needed for this list.
const GENERIC_RECOMMENDATIONS = [
  {
    id: 'generic-sleep',
    title: 'Build a consistent sleep routine',
    description: 'Go to bed and wake up at the same time every day, even on weekends — consistency helps more than extra hours alone.',
    category: 'sleep',
    priority: 'medium',
  },
  {
    id: 'generic-movement',
    title: 'Add short movement breaks',
    description: 'A 5-10 minute walk between tasks lowers stress hormones and resets focus better than pushing through fatigue.',
    category: 'lifestyle',
    priority: 'medium',
  },
  {
    id: 'generic-breathing',
    title: 'Try box breathing when stressed',
    description: 'Inhale for 4 seconds, hold for 4, exhale for 4, hold for 4. Repeat for 2 minutes to calm your nervous system.',
    category: 'stress',
    priority: 'medium',
  },
  {
    id: 'generic-social',
    title: 'Reach out to one person this week',
    description: 'A short check-in message with a friend or family member goes a long way for emotional support.',
    category: 'social',
    priority: 'low',
  },
  {
    id: 'generic-journal',
    title: 'Journal for five minutes a day',
    description: 'Writing down what you\u2019re feeling — without editing yourself — helps process emotions before they build up.',
    category: 'mood',
    priority: 'low',
  },
];

const ASSESSMENT_CTA = {
  id: 'generic-assessment',
  title: 'Take your first assessment',
  description: 'Complete a wellness check-in so we can tailor recommendations to your actual scores and trends.',
  category: 'general',
  priority: 'high',
};

/**
 * @param {boolean} hasData - whether the user has completed any assessments
 * @returns {Array} generic recommendation objects
 */
function getGenericRecommendations(hasData) {
  return hasData ? GENERIC_RECOMMENDATIONS : [ASSESSMENT_CTA, ...GENERIC_RECOMMENDATIONS.slice(0, 4)];
}

/**
 * Build a Gemini prompt requesting personalized recommendations from a
 * wellness context. Expects `context.hasData === true`.
 * @param {object} context - result of getUserWellnessContext()
 */
function buildRecommendationPrompt(context) {
  const {
    name,
    wellnessScore, wellnessBand, wellnessTrend,
    stressScore, stressBand, stressTrend,
    anxietyScore, anxietyBand, anxietyTrend,
    depressionScore, depressionBand, depressionTrend,
    sleepScore, sleepBand, sleepTrend,
    lifestyleScore, lifestyleBand,
    socialScore, socialBand,
    daysSinceLastSurvey, age, occupation,
  } = context;

  const extraLines = [
    age ? `- Age: ${age}` : null,
    occupation ? `- Occupation: ${occupation}` : null,
  ].filter(Boolean).join('\n');

  return `You are MediBloom AI, generating personalized, actionable wellness recommendations
for a user based on their self-reported mental wellness check-in. Never diagnose or
claim medical certainty; frame every suggestion as a gentle, practical self-care action.

User context:
- Wellness score: ${wellnessScore}/100 (${wellnessBand}), trend: ${wellnessTrend}
- Stress score: ${stressScore}/100 (${stressBand}), trend: ${stressTrend}
- Anxiety score: ${anxietyScore}/100 (${anxietyBand}), trend: ${anxietyTrend}
- Mood/depression score: ${depressionScore}/100 (${depressionBand}), trend: ${depressionTrend}
- Sleep quality score: ${sleepScore}/100 (${sleepBand}), trend: ${sleepTrend}
- Lifestyle score: ${lifestyleScore}/100 (${lifestyleBand})
- Social wellbeing score: ${socialScore}/100 (${socialBand})
- Days since last check-in: ${daysSinceLastSurvey}
${extraLines ? extraLines + '\n' : ''}
Generate exactly 5 recommendations, ordered by priority (most important first).
Prioritize dimensions with the lowest scores or a "Declining" trend. Each
recommendation must be specific and actionable — no generic platitudes — and
its description must be 1-2 sentences. Use each category at most twice.
Address the user by first name ("${name || 'there'}") in at most one
recommendation, not all of them.`;
}

module.exports = { buildRecommendationPrompt, getGenericRecommendations };
