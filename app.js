require('dotenv').config();
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const bodyMiddleware = require('./middlewares/body');
const sessionMiddleware = require('./middlewares/session');

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware to parse form data
app.use(bodyMiddleware());

// Session middleware (configured in middlewares/session.js)
app.use(sessionMiddleware());

// CSRF protection (requires session + body parser)
app.use(require('./middlewares/csrf')());

// Mount the user router
app.use('/', userRoutes);

const server = app.listen(PORT, () => {
 console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
 console.error(`Error starting server: ${err}`);
});