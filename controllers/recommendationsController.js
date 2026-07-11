/**
 * Recommendations controller — /api/recommendations
 *
 * Reuses the same wellness context used by the chatbot (see
 * services/wellnessContextService.js) so scores/trends always match what
 * the user sees on Analytics. Respects the same `personalizedAI` privacy
 * setting as chat: users without data, or who've disabled personalization,
 * get a curated generic list instead of an AI call.
 */
const { getUserWellnessContext } = require('../services/wellnessContextService');
const { generateRecommendations } = require('../services/geminiService');
const {
  buildRecommendationPrompt,
  getGenericRecommendations,
} = require('../utils/recommendationPromptBuilder');

// GET /api/recommendations
const getRecommendations = async (req, res) => {
  try {
    const personalizationEnabled = req.user.settings?.personalizedAI !== false;

    let context = { hasData: false };
    if (personalizationEnabled) {
      try {
        context = await getUserWellnessContext(req.user._id, req.user.fullName);
      } catch (ctxErr) {
        console.error('[recommendations] Wellness context lookup failed:', ctxErr.message);
        context = { hasData: false };
      }
    }

    if (!personalizationEnabled || !context.hasData) {
      return res.json({
        success: true,
        personalized: false,
        recommendations: getGenericRecommendations(context.hasData),
      });
    }

    try {
      const prompt = buildRecommendationPrompt(context);
      const aiRecommendations = await generateRecommendations(prompt);
      const recommendations = aiRecommendations.map((r, i) => ({ id: `ai-${i}`, ...r }));
      return res.json({ success: true, personalized: true, recommendations });
    } catch (aiErr) {
      // AI unavailable — fall back to the generic list rather than erroring
      // out the whole page.
      console.error('[recommendations] Gemini generation failed:', aiErr.message);
      return res.json({
        success: true,
        personalized: false,
        recommendations: getGenericRecommendations(true),
      });
    }
  } catch (err) {
    console.error('[recommendations] Error:', err.message);
    return res.status(500).json({ error: 'Failed to generate recommendations.' });
  }
};

module.exports = { getRecommendations };
