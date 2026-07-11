/**
 * Auth controller — handles /api/auth/* endpoints.
 */

// GET /api/auth/me
const getMe = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false, user: null });
  }
  const { _id, fullName, email, avatar, provider, verified, createdAt, settings } = req.user;
  return res.json({
    authenticated: true,
    user: {
      id: _id, fullName, email, avatar, provider, verified, createdAt,
      settings: { personalizedAI: settings?.personalizedAI !== false },
    },
  });
};

// PATCH /api/auth/settings
// Body: { personalizedAI: boolean }
const updateSettings = async (req, res) => {
  const { personalizedAI } = req.body || {};
  if (typeof personalizedAI !== 'boolean') {
    return res.status(400).json({ error: '"personalizedAI" must be a boolean.' });
  }

  req.user.set('settings.personalizedAI', personalizedAI);
  await req.user.save();

  return res.json({
    success: true,
    settings: { personalizedAI: req.user.settings.personalizedAI },
  });
};

// GET /api/auth/status
const getStatus = (req, res) => {
  res.json({ authenticated: !!req.user });
};

// POST /api/auth/logout
const logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed. Please try again.' });
    }
    req.session.destroy((sessionErr) => {
      res.clearCookie('connect.sid', { path: '/' });
      if (sessionErr) {
        return res.status(500).json({ error: 'Session cleanup failed.' });
      }
      return res.json({ success: true, message: 'You have been logged out successfully.' });
    });
  });
};

module.exports = { getMe, getStatus, logout, updateSettings };
