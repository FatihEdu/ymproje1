function requireAuth(req, res, next) {
  if (req?.session?.user) return next();
  // For API routes, return 401 JSON instead of redirecting
  if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

module.exports = { requireAuth };
