const SurveyResponse = require('../models/SurveyResponse');

// Allowlist of sections accepted from the client
const ALLOWED_SECTIONS = [
  'basicInfo', 'lifestyle', 'stress', 'emotional',
  'anxiety', 'depression', 'social', 'digital',
  'coping', 'history', 'consent',
];

// POST /api/survey
const submitSurvey = async (req, res) => {
  try {
    // Only pick known sections — ignore any extra fields from the client
    const payload = { submittedAt: new Date() };
    ALLOWED_SECTIONS.forEach((key) => {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    });

    // Attach authenticated user data if logged in
    if (req.user) {
      payload.userId   = req.user._id;
      payload.email    = req.user.email;
      payload.fullName = req.user.fullName;
    }

    const response = await SurveyResponse.create(payload);
    return res.status(201).json({ success: true, id: response._id });
  } catch (err) {
    console.error('[survey] Submission error:', err.message);
    return res.status(500).json({ error: 'Failed to save survey response.' });
  }
};

// GET /api/survey/history
const getSurveyHistory = async (req, res) => {
  try {
    const responses = await SurveyResponse
      .find({ userId: req.user._id })
      .select('submittedAt createdAt emotional anxiety depression social lifestyle stress basicInfo coping')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.json({ success: true, responses });
  } catch (err) {
    console.error('[survey] History error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch survey history.' });
  }
};

// GET /api/survey/:id
const getSurveyById = async (req, res) => {
  try {
    const response = await SurveyResponse.findById(req.params.id).lean();
    if (!response) return res.status(404).json({ error: 'Not found.' });

    if (response.userId && req.user?._id?.toString() !== response.userId.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json(response);
  } catch (err) {
    console.error('[survey] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch survey response.' });
  }
};

module.exports = { submitSurvey, getSurveyHistory, getSurveyById };
