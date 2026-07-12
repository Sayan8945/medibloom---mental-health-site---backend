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
function buildGenericSystemPrompt(name, context) {
  const nameLine = name
    ? `\nThe user's name is ${name}. Address them by their first name naturally in conversation (not in every message).`
    : '';
  const moodBlock = buildMoodContextBlock(context || {});
  const moodNote = moodBlock
    ? `\nYou do not have this user's survey/assessment history, but they do have\nrecent daily mood check-ins below — use those to personalize your replies.\n${moodBlock}`
    : `\nYou do not currently have this user's wellness history, so keep your\nresponses general and helpful rather than referencing specific scores.`;
  return `${BASE_RULES}${nameLine}${moodNote}`;
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
${buildMoodContextBlock(context)}
Guidelines:
- If a trend is "Improving", acknowledge the positive progress genuinely.
- If a trend is "Declining", gently and non-judgmentally explore possible
  causes (e.g. recent changes in work, sleep, relationships) — do not alarm
  the user.
- If it's been more than 14 days since their last assessment, you may
  casually suggest checking in with a new assessment, without being pushy.
- If daily check-in data is present and shows a concerning pattern (e.g.
  rising stress alongside falling sleep), you may gently ask what's changed
  recently, similar to the assessment-trend guidance above.
- Never present this context as a diagnosis. Frame everything as
  observations from their self-reported check-ins.`;
}

/**
 * Renders the optional daily mood check-in section appended to the
 * personalized system prompt. Returns an empty string when the user has no
 * mood check-ins yet, so guests/new users see no change in behavior.
 */
function buildMoodContextBlock(context) {
  if (!context.hasMoodData) return '';

  const {
    currentMoodLabel, currentEnergyLevel, currentStressLevel, currentSleepQuality,
    moodTrend, stressTrendRecent, sleepTrendRecent, energyTrendRecent,
  } = context;

  return `
Recent daily check-in (today or most recent day logged):
- Current Mood: ${currentMoodLabel}
- Stress Level: ${currentStressLevel}/10
- Sleep Quality: ${currentSleepQuality}/10
- Energy Level: ${currentEnergyLevel}/10
Recent Trend (last several days): mood ${moodTrend}, stress ${stressTrendRecent}, sleep ${sleepTrendRecent}, energy ${energyTrendRecent}
`;
}

/**
 * Build the system prompt to prepend to a Gemini conversation.
 * @param {object|null} context - result of getUserWellnessContext(), or null
 * @param {boolean} personalizationEnabled - user's privacy setting
 */
function buildSystemPrompt(context, personalizationEnabled) {
  if (!personalizationEnabled || !context) {
    return buildGenericSystemPrompt(context?.name);
  }
  if (!context.hasData) {
    // No survey history, but may still have daily mood check-ins to
    // personalize with (buildGenericSystemPrompt appends them if present).
    return buildGenericSystemPrompt(context.name, context);
  }
  return buildPersonalizedSystemPrompt(context);
}

module.exports = { buildSystemPrompt, buildGenericSystemPrompt, buildPersonalizedSystemPrompt };
