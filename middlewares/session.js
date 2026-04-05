const session = require('express-session');

const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function sessionMiddleware() {
  const parsedMax = Number.parseInt(process.env.SESSION_MAX_AGE_MS, 10);
  const sessionMaxAge = Number.isFinite(parsedMax) && parsedMax > 0
    ? parsedMax
    : DEFAULT_SESSION_MAX_AGE_MS; // default 24 hours
  const configuredSessionSecret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!configuredSessionSecret && isProduction) {
    throw new Error('SESSION_SECRET must be set in production');
  }

  const allowInMemoryStoreInProduction = process.env.SESSION_ALLOW_MEMORY_STORE_IN_PRODUCTION === 'true';

  if (isProduction && !allowInMemoryStoreInProduction) {
    throw new Error('Session store is not configured for production. Configure a persistent express-session store or set SESSION_ALLOW_MEMORY_STORE_IN_PRODUCTION=true to explicitly allow MemoryStore.');
  }

  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret', // should be set to a secure value in production
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // only save session if something is stored
    store: new session.MemoryStore(), // explicitly allow MemoryStore only outside production
    cookie: {
      secure: isProduction ? 'auto' : false, // send secure cookies in production when the request is HTTPS
      httpOnly: true, // helps mitigate XSS attacks but javascript won't be able to access this cookie
      sameSite: 'lax', // reasonable default to mitigate CSRF
      maxAge: sessionMaxAge // set cookie expiration based on env or default
    }
  });
}

module.exports = sessionMiddleware;
