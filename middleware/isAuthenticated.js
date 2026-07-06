/**
 * Express middleware — blocks unauthenticated requests.
 * Attach to any route that requires a logged-in user.
 */
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required. Please sign in.' });
};

module.exports = isAuthenticated;
