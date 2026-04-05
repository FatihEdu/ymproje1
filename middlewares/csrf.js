const { doubleCsrf } = require('csrf-csrf');

const isProduction = process.env.NODE_ENV === 'production';

// Use __Host- prefix (HTTPS-only) in production; plain name in dev so HTTP works
const cookieName = isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token';

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.SESSION_SECRET || 'dev-secret',
  getSessionIdentifier: (req) =>
    (req.session && (req.session.id || req.sessionID)) ||
    req.sessionID ||
    '',
  cookieName,
  cookieOptions: {
    secure: isProduction, // require HTTPS in production only
    sameSite: 'strict',
    httpOnly: true,
  },
  getCsrfTokenFromRequest: (req) =>
    (req.headers && (req.headers['x-csrf-token'] || req.headers['csrf-token'])) ||
    (req.body && (req.body._csrf || req.body.csrfToken)) ||
    (req.query && (req.query._csrf || req.query.csrfToken)),
});

function csrfMiddleware() {
  // requires cookie-parser + session support; uses a maintained CSRF implementation
  return doubleCsrfProtection;
}

module.exports = csrfMiddleware;
module.exports.generateCsrfToken = generateCsrfToken;
