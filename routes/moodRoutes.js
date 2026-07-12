const express = require('express');
const {
  createMoodEntry,
  getTodayEntry,
  getMoodHistory,
  updateMoodEntry,
  getMoodAnalytics,
} = require('../controllers/moodController');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();

// All mood routes require authentication — users only ever see their own
// check-ins (ownership is also re-checked inside the controller for
// id-based routes, matching the surveyController.getSurveyById pattern).
router.use(isAuthenticated);

router.post('/', createMoodEntry);
router.get('/today', getTodayEntry);
router.get('/history', getMoodHistory);
router.get('/analytics', getMoodAnalytics);
router.put('/:id', updateMoodEntry);

module.exports = router;
