const { doubleCsrf } = require('csrf-csrf');

const { doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.SESSION_SECRET,
  getSessionIdentifier: (req) =>
    (req.session && (req.session.id || req.sessionID)) ||
    req.sessionID ||
    '',
  getCsrfTokenFromRequest: (req) =>
    (req.headers && (req.headers['x-csrf-token'] || req.headers['csrf-token'])) ||
    (req.body && (req.body._csrf || req.body.csrfToken)) ||
    (req.query && (req.query._csrf || req.query.csrfToken)),
});

function csrfMiddleware() {
  // requires session support; uses a maintained CSRF implementation
  return doubleCsrfProtection;
}

module.exports = csrfMiddleware;
