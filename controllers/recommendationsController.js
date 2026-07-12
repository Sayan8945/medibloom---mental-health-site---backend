/**
 * Recommendations controller — /api/recommendations
 *
 * Reuses the same wellness context used by the chatbot (see
 * services/wellnessContextService.js) so scores/trends always match what
 * the user sees on Analytics. Respects the same `personalizedAI` privacy
 * setting as chat: users without data, or who've disabled personalization,
 * get a curated generic list instead of an AI call.
 *
 * AI-generated sets are cached per user (RecommendationSet) and keyed to
 * the survey response they were generated from — the cache is reused until
 * the user submits a new assessment, or explicitly requests `?refresh=true`.
 * This avoids calling Gemini on every page load.
 */
const { getUserWellnessContext } = require('../services/wellnessContextService');
const { generateRecommendations } = require('../services/geminiService');
const {
  buildRecommendationPrompt,
  getGenericRecommendations,
} = require('../utils/recommendationPromptBuilder');
const RecommendationSet = require('../models/RecommendationSet');

// GET /api/recommendations?refresh=true
const getRecommendations = async (req, res) => {
  try {
    const personalizationEnabled = req.user.settings?.personalizedAI !== false;
    const forceRefresh = req.query.refresh === 'true';

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
        cached: false,
        recommendations: getGenericRecommendations(context.hasData),
      });
    }

    // Serve the cached set when it was generated from the user's current
    // latest response and a refresh wasn't explicitly requested.
    if (!forceRefresh) {
      const cached = await RecommendationSet.findOne({ userId: req.user._id }).lean();
      if (
        cached &&
        cached.personalized &&
        cached.sourceResponseId &&
        String(cached.sourceResponseId) === String(context.latestResponseId)
      ) {
        return res.json({
          success: true,
          personalized: true,
          cached: true,
          generatedAt: cached.updatedAt,
          recommendations: cached.recommendations,
        });
      }
    }

    try {
      const prompt = buildRecommendationPrompt(context);
      const aiRecommendations = await generateRecommendations(prompt);
      const recommendations = aiRecommendations.map((r, i) => ({ id: `ai-${i}`, ...r }));

      const saved = await RecommendationSet.findOneAndUpdate(
        { userId: req.user._id },
        { sourceResponseId: context.latestResponseId, personalized: true, recommendations },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        personalized: true,
        cached: false,
        generatedAt: saved.updatedAt,
        recommendations,
      });
    } catch (aiErr) {
      // AI unavailable — fall back to the generic list rather than erroring
      // out the whole page. Never overwrite a valid cache with a failure.
      console.error('[recommendations] Gemini generation failed:', aiErr.message);
      return res.json({
        success: true,
        personalized: false,
        cached: false,
        recommendations: getGenericRecommendations(true),
      });
    }
  } catch (err) {
    console.error('[recommendations] Error:', err.message);
    return res.status(500).json({ error: 'Failed to generate recommendations.' });
  }
};

module.exports = { getRecommendations };
