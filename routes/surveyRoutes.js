const express = require('express');
const { submitSurvey, getSurveyHistory, getSurveyById } = require('../controllers/surveyController');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();

// Public submission (auth is optional — userId attached if logged in)
router.post('/', submitSurvey);

// Protected: only logged-in users can view their history
router.get('/history', isAuthenticated, getSurveyHistory);

// Get a single response by ID
router.get('/:id', getSurveyById);

module.exports = router;
