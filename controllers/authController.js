/**
 * Auth controller — handles /api/auth/* endpoints.
 */

// GET /api/auth/me
const getMe = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false, user: null });
  }
  const { _id, fullName, email, avatar, provider, verified, createdAt } = req.user;
  return res.json({
    authenticated: true,
    user: { id: _id, fullName, email, avatar, provider, verified, createdAt },
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

module.exports = { getMe, getStatus, logout };
