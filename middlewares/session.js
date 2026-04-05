const session = require('express-session');

const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function sessionMiddleware() {
  const parsedMax = Number.parseInt(process.env.SESSION_MAX_AGE_MS, 10);
  const sessionMaxAge = Number.isFinite(parsedMax) && parsedMax > 0
    ? parsedMax
    : DEFAULT_SESSION_MAX_AGE_MS; // default 24 hours

  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret', // should be set to a secure value in production
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // only save session if something is stored
    cookie: {
      secure: false, // secure should be true in production with HTTPS
      httpOnly: true, // helps mitigate XSS attacks but javascript won't be able to access this cookie
      sameSite: 'lax', // reasonable default to mitigate CSRF
      maxAge: sessionMaxAge // set cookie expiration based on env or default
    }
  });
}

module.exports = sessionMiddleware;
