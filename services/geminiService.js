/**
 * Gemini API client — thin wrapper around the REST generateContent endpoint.
 * Uses Node's built-in fetch (Node 18+, required by Express 5) so no extra
 * SDK dependency is needed.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * @param {string} systemPrompt - dynamic system instruction (context-aware)
 * @param {Array<{role: 'user'|'model', text: string}>} history - conversation so far
 * @returns {Promise<string>} the model's reply text
 */
async function generateChatReply(systemPrompt, history) {
  if (!GEMINI_API_KEY) {
    throw new Error('Chat assistant is not configured. Please contact support.');
  }

  const contents = history.map(({ role, text }) => ({
    role,
    parts: [{ text }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'The chat assistant is temporarily unavailable.';
    throw new Error(message);
  }

  const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!replyText) {
    throw new Error('The chat assistant could not generate a response. Please try again.');
  }

  return replyText.replace(/\*\*(.*?)\*\*/g, '$1').trim();
}

// Fixed schema for structured recommendation output — keeps Gemini from
// wrapping/deviating the JSON shape so the backend never has to guess.
const RECOMMENDATIONS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      title:       { type: 'STRING' },
      description: { type: 'STRING' },
      category:    { type: 'STRING', enum: ['stress', 'anxiety', 'mood', 'sleep', 'lifestyle', 'social', 'general'] },
      priority:    { type: 'STRING', enum: ['high', 'medium', 'low'] },
    },
    required: ['title', 'description', 'category', 'priority'],
  },
};

/**
 * Single-turn structured generation for personalized recommendations.
 * Uses responseSchema so Gemini returns strict JSON instead of prose.
 * @param {string} prompt - full instruction prompt (see recommendationPromptBuilder.js)
 * @returns {Promise<Array<{title:string, description:string, category:string, priority:string}>>}
 */
async function generateRecommendations(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Recommendations are not configured. Please contact support.');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECOMMENDATIONS_SCHEMA,
    },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'Recommendations are temporarily unavailable.';
    throw new Error(message);
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    throw new Error('Could not generate recommendations. Please try again.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Could not generate recommendations. Please try again.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Could not generate recommendations. Please try again.');
  }

  return parsed;
}

module.exports = { generateChatReply, generateRecommendations };
