const SurveyResponse = require('../models/SurveyResponse');

// POST /api/survey
const submitSurvey = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      submittedAt: new Date(),
    };

    // Attach authenticated user data if logged in
    if (req.user) {
      payload.userId   = req.user._id;
      payload.email    = req.user.email;
      payload.fullName = req.user.fullName;
    }

    const response = await SurveyResponse.create(payload);
    return res.status(201).json({ success: true, id: response._id });
  } catch (err) {
    console.error('Survey submission error:', err.message);
    return res.status(500).json({ error: 'Failed to save survey response.' });
  }
};

// GET /api/survey/history  (authenticated user's own responses)
const getSurveyHistory = async (req, res) => {
  try {
    const responses = await SurveyResponse
      .find({ userId: req.user._id })
      .select('submittedAt createdAt emotional anxiety depression social lifestyle stress basicInfo coping')
      .sort({ createdAt: -1 })
      .limit(20);
    return res.json({ success: true, responses });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch survey history.' });
  }
};

// GET /api/survey/:id
const getSurveyById = async (req, res) => {
  try {
    const response = await SurveyResponse.findById(req.params.id);
    if (!response) return res.status(404).json({ error: 'Not found.' });

    // Only the owner or unauthenticated responses are accessible
    if (response.userId && req.user?._id?.toString() !== response.userId.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch survey response.' });
  }
};

module.exports = { submitSurvey, getSurveyHistory, getSurveyById };
