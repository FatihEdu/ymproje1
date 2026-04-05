const csurf = require('csurf');

function csrfMiddleware() {
  // requires session or cookie parser; using session storage
  return csurf();
}

module.exports = csrfMiddleware;
