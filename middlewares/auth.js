function requireAuth(req, res, next) {
  if (req?.session?.user) return next();
  // Not authenticated -> redirect to login
  return res.redirect('/login');
}

module.exports = { requireAuth };
