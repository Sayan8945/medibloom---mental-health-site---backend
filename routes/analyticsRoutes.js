const express = require('express');
const { getTrends, getComparison, getSummary } = require('../controllers/analyticsController');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();

// All analytics routes require authentication — users only see their own data
router.get('/trends',     isAuthenticated, getTrends);
router.get('/comparison', isAuthenticated, getComparison);
router.get('/summary',    isAuthenticated, getSummary);

module.exports = router;
