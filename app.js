require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const userRoutes = require('./routes/userRoutes');
const userController = require('./controllers/userController');
const bodyMiddleware = require('./middlewares/body');
const sessionMiddleware = require('./middlewares/session');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets (CSS, JS, images, …)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse form data
app.use(bodyMiddleware());

// Cookie parser (required by csrf-csrf to read the CSRF cookie from requests)
app.use(cookieParser());

// Session middleware (configured in middlewares/session.js)
app.use(sessionMiddleware());

// CSRF protection (requires cookie-parser + session + body parser)
app.use(require('./middlewares/csrf')());

// Mount the user router
app.use('/', userRoutes);

// 404 handler
app.use(userController.get404Page);

// CSRF error handler – must be defined after routes
// csrf-csrf uses err.code === 'EBADCSRFTOKEN' (same default as csurf)
app.use((err, req, res, next) => {
	if (err.code === 'EBADCSRFTOKEN') {
		if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
			console.warn(`[Güvenlik] Geçersiz/Eksik CSRF Token: IP ${req.ip} - Path: ${req.path}`);
		}

		const expectsJson =
			req.path.startsWith('/api/') ||
			(req.accepts('json') && !req.accepts('html'));

		if (expectsJson) {
			return res.status(403).json({ error: 'Invalid CSRF token' });
		}
		return res.status(403).sendFile(path.join(__dirname, 'views', 'csrf-error.html'));
	}
	next(err);
});

const server = app.listen(PORT, () => {
 console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
 console.error(`Error starting server: ${err}`);
});