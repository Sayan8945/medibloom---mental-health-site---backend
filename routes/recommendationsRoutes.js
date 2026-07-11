const express = require('express');
const { getRecommendations } = require('../controllers/recommendationsController');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();

// Requires authentication — recommendations are always tied to the caller's own data
router.get('/', isAuthenticated, getRecommendations);

module.exports = router;
