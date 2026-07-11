/**
 * Chat prompt builder — turns a wellness context object into a compact
 * Gemini system prompt. Kept deliberately short to minimize token usage;
 * only summarized scores/bands/trends are ever included, never raw
 * survey answers or full chat history.
 */

const BASE_RULES = `You are MediBloom AI, a supportive mental wellness assistant.
Be warm, concise, and conversational. Never diagnose mental illnesses or claim
medical certainty. Encourage professional support when appropriate (e.g. a
therapist or doctor) for anything beyond general wellness guidance.`;

/**
 * Generic system prompt — used when the user has no wellness data yet,
 * has disabled personalization, or is a signed-out guest. Still greets by
 * name when we have one (logged-in user, just no survey history yet).
 */
function buildGenericSystemPrompt(name) {
  const nameLine = name
    ? `\nThe user's name is ${name}. Address them by their first name naturally in conversation (not in every message).`
    : '';
  return `${BASE_RULES}${nameLine}
You do not currently have this user's wellness history, so keep your
responses general and helpful rather than referencing specific scores.`;
}

/**
 * Personalized system prompt — built from a compact wellness context
 * (see services/wellnessContextService.js). Expects `context.hasData === true`.
 */
function buildPersonalizedSystemPrompt(context) {
  const {
    name,
    wellnessScore, wellnessBand, wellnessTrend,
    stressScore, stressBand, stressTrend,
    anxietyScore, anxietyBand, anxietyTrend,
    depressionScore, depressionBand, depressionTrend,
    sleepScore, sleepBand, sleepTrend,
    lifestyleScore, lifestyleBand,
    socialScore, socialBand,
    assessmentsCompleted, daysSinceLastSurvey,
  } = context;

  const nameLine = name
    ? `The user's name is ${name}. Address them by their first name naturally in conversation (not in every message).\n`
    : '';

  return `${BASE_RULES}
${nameLine}
Current user context (from their wellness assessments — use it to personalize
your replies, but never quote these numbers verbatim unless it feels natural):
- Wellness score: ${wellnessScore}/100 (${wellnessBand}), trend: ${wellnessTrend}
- Stress score: ${stressScore}/100 (${stressBand}), trend: ${stressTrend}
- Anxiety score: ${anxietyScore}/100 (${anxietyBand}), trend: ${anxietyTrend}
- Depression/mood score: ${depressionScore}/100 (${depressionBand}), trend: ${depressionTrend}
- Sleep quality score: ${sleepScore}/100 (${sleepBand}), trend: ${sleepTrend}
- Lifestyle score: ${lifestyleScore}/100 (${lifestyleBand})
- Social wellbeing score: ${socialScore}/100 (${socialBand})
- Assessments completed: ${assessmentsCompleted} (last one ${daysSinceLastSurvey} day${daysSinceLastSurvey === 1 ? '' : 's'} ago)

Guidelines:
- If a trend is "Improving", acknowledge the positive progress genuinely.
- If a trend is "Declining", gently and non-judgmentally explore possible
  causes (e.g. recent changes in work, sleep, relationships) — do not alarm
  the user.
- If it's been more than 14 days since their last assessment, you may
  casually suggest checking in with a new assessment, without being pushy.
- Never present this context as a diagnosis. Frame everything as
  observations from their self-reported check-ins.`;
}

/**
 * Build the system prompt to prepend to a Gemini conversation.
 * @param {object|null} context - result of getUserWellnessContext(), or null
 * @param {boolean} personalizationEnabled - user's privacy setting
 */
function buildSystemPrompt(context, personalizationEnabled) {
  if (!personalizationEnabled || !context || !context.hasData) {
    return buildGenericSystemPrompt(context?.name);
  }
  return buildPersonalizedSystemPrompt(context);
}

module.exports = { buildSystemPrompt, buildGenericSystemPrompt, buildPersonalizedSystemPrompt };
