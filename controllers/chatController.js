/**
 * Chat controller — /api/chat/*
 *
 * The chatbot widget is public (rendered on the homepage for signed-out
 * visitors too), so this route does not require authentication. When a
 * session IS present, the reply is personalized using the user's own
 * wellness history — subject to their privacy setting. Guests and users
 * with personalization disabled get fully generic responses.
 */
const { getUserWellnessContext } = require('../services/wellnessContextService');
const { buildSystemPrompt } = require('../utils/chatPromptBuilder');
const { generateChatReply } = require('../services/geminiService');

const MAX_HISTORY_MESSAGES = 20;   // cap turns sent to Gemini — keeps tokens low
const MAX_MESSAGE_LENGTH   = 2000; // per-message character cap

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return null;

  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  const cleaned = [];

  for (const entry of trimmed) {
    if (!entry || typeof entry !== 'object') return null;
    const { role, text } = entry;
    if (role !== 'user' && role !== 'model') return null;
    if (typeof text !== 'string' || !text.trim()) return null;
    cleaned.push({ role, text: text.slice(0, MAX_MESSAGE_LENGTH) });
  }

  return cleaned;
}

// POST /api/chat
const sendMessage = async (req, res) => {
  try {
    const history = sanitizeHistory(req.body?.history);
    if (!history || history.length === 0) {
      return res.status(400).json({ error: 'A valid conversation history is required.' });
    }

    // Ownership: only ever look up the currently authenticated user's own
    // data — never accept a userId from the request body.
    const isLoggedIn = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
    const personalizationEnabled = isLoggedIn ? req.user.settings?.personalizedAI !== false : false;

    let context = { hasData: false, name: isLoggedIn ? req.user.fullName?.split(' ')[0] : null };
    if (isLoggedIn && personalizationEnabled) {
      try {
        context = await getUserWellnessContext(req.user._id, req.user.fullName);
      } catch (ctxErr) {
        // Edge case: context lookup failing should never break the chat —
        // fall back to a name-only greeting and log server-side.
        console.error('[chat] Wellness context lookup failed:', ctxErr.message);
        context = { hasData: false, name: req.user.fullName?.split(' ')[0] };
      }
    }

    const systemPrompt = buildSystemPrompt(context, personalizationEnabled);
    const reply = await generateChatReply(systemPrompt, history);

    return res.json({
      success: true,
      reply,
      personalized: personalizationEnabled && context.hasData,
    });
  } catch (err) {
    console.error('[chat] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
};

module.exports = { sendMessage };
