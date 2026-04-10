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
    path: '/',
    sameSite: 'strict', // strict and not lax because we don't want the token sent on any cross-site requests at all
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

function csrfSessionInit(req, res, next) {
  if (req?.session && !req.session.csrfInitialized) {
    // With saveUninitialized=false, mark session modified before token generation.
    req.session.csrfInitialized = true;
  }
  next();
}

module.exports = csrfMiddleware;
module.exports.generateCsrfToken = generateCsrfToken;
module.exports.csrfSessionInit = csrfSessionInit;
