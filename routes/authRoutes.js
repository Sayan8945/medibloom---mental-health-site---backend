const express  = require('express');
const passport = require('passport');
const { getMe, getStatus, logout, updateSettings } = require('../controllers/authController');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();

// ── Initiate Google OAuth ──────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
);

// ── Google OAuth callback ──────────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/?auth=failed`,
    session: true,
  }),
  (req, res) => {
    // Successful authentication — redirect to frontend
    res.redirect(`${process.env.CLIENT_URL}/?auth=success`);
  }
);

// ── REST endpoints ─────────────────────────────────────────────
router.get('/me',     getMe);
router.get('/status', getStatus);
router.post('/logout', logout);
router.patch('/settings', isAuthenticated, updateSettings);

module.exports = router;
