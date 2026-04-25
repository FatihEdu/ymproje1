const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const { generateCsrfToken } = require('../middlewares/csrf');

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 20;
const DEFAULT_SALT_ROUNDS = 10;

// Cache templates at startup to avoid blocking the event loop on every request
const indexTemplate    = fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8');
const registerTemplate = fs.readFileSync(path.join(__dirname, '../views/register.html'), 'utf8');
const loginTemplate    = fs.readFileSync(path.join(__dirname, '../views/login.html'), 'utf8');
const favsTemplate     = fs.readFileSync(path.join(__dirname, '../views/favs.html'), 'utf8');
const logoutTemplate   = fs.readFileSync(path.join(__dirname, '../views/logout.html'), 'utf8');
const notFoundTemplate = fs.readFileSync(path.join(__dirname, '../views/404.html'), 'utf8');
const navbarTemplate        = fs.readFileSync(path.join(__dirname, '../views/navbar.html'), 'utf8');
const navbarAuthLoggedin    = fs.readFileSync(path.join(__dirname, '../views/navbar-auth-loggedin.html'), 'utf8');
const navbarAuthLoggedout   = fs.readFileSync(path.join(__dirname, '../views/navbar-auth-loggedout.html'), 'utf8');

/**
 * Build the navbar HTML.
 * When the user is logged in show a logout form; otherwise show Login / Register links.
 */
function buildNavbar(req, res) {
	const isLoggedIn = Boolean(req.session?.user);
	const authHtml = isLoggedIn
		? navbarAuthLoggedin.replace('<!--CSRF-->', `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`)
		: navbarAuthLoggedout;
	return navbarTemplate.replace('<!--NAV_AUTH-->', authHtml);
}

function injectNavbar(template, req, res) {
	return template.replace('<!--NAVBAR-->', buildNavbar(req, res));
}

exports.getHomePage = (req, res) => {
	res.send(injectNavbar(indexTemplate, req, res));
};
exports.get404Page = (req, res) => {
        res.status(404).send(injectNavbar(notFoundTemplate, req, res));
};
exports.getRegisterPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	res.send(injectNavbar(registerTemplate, req, res).replace('<!--CSRF-->', tokenInput));
};

exports.getLoginPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	const errorHtml = req.query.error ? '<p class="error-msg">Kullanıcı adı veya şifre hatalı.</p>' : '';
	res.send(injectNavbar(loginTemplate, req, res).replace('<!--CSRF-->', tokenInput).replace('<!--ERROR-->', errorHtml));
};

exports.getFavsPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	res.send(injectNavbar(favsTemplate, req, res).replace('<!--CSRF-->', tokenInput));
};

exports.registerUser = async (req, res) => {
 const { username, password } = req.body;

 if (!username || !password) {
 return res.status(400).send('Please fill all fields.');
 }

 const parsed = Number.parseInt(process.env.SALT_ROUNDS, 10);
 const saltRounds = Number.isFinite(parsed) && parsed >= MIN_SALT_ROUNDS && parsed <= MAX_SALT_ROUNDS
  ? parsed
  : DEFAULT_SALT_ROUNDS;
 try {
	 const hashed = await bcrypt.hash(password, saltRounds);
	 User.save({ username, password: hashed });
	 // Auto-login after successful registration
	 if (req?.session) {
	 	return req.session.regenerate((err) => {
	 		if (err) {
	 			console.error('Session regenerate error after register:', err);
	 			return res.status(500).send('Internal server error');
	 		}
	 		req.session.user = { username };
	 		return res.redirect('/favs');
	 	});
	 }
	 console.error('Register error: session is unavailable');
	 return res.status(500).send('Internal server error');
 } catch (err) {
	 console.error('Hashing error:', err);
	 res.status(500).send('Internal server error');
 }
};

exports.loginUser = async (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) {
		return res.redirect('/login?error=1');
	}

	try {
		const users = User.getAll();
		const found = users.find((u) => u.username === username);
		if (!found) {
			return res.redirect('/login?error=1');
		}
		const match = await bcrypt.compare(password, found.password);
		if (!match) {
			return res.redirect('/login?error=1');
		}
		// Login successful: regenerate session to prevent session fixation
		if (req?.session) {
			return req.session.regenerate((err) => {
				if (err) {
					console.error('Session regenerate error:', err);
					return res.status(500).send('Internal server error');
				}
				// minimal session user payload; avoid storing password
				req.session.user = { username };
				return res.redirect('/favs');
			});
		}
		console.error('Login error: session is unavailable');
		return res.status(500).send('Internal server error');
	} catch (err) {
		console.error('Login error:', err);
		return res.status(500).send('Internal server error');
	}
};

exports.authMe = (req, res) => {
	const user = req?.session?.user ?? null;
	return res.json({ user });
};

exports.logoutUser = (req, res) => {
	// Build the logout page HTML before destroying the session so the navbar
	// can still check whether the user was logged in (it will show logged-out
	// state since the session is being destroyed anyway).
	const logoutHtml = injectNavbar(logoutTemplate, { session: null }, res);

	if (req?.session) {
		req.session.destroy((err) => {
			if (err) {
				console.error('Session destroy error:', err);
				return res.status(500).send('Error logging out');
			}
			res.clearCookie('connect.sid');
			return res.send(logoutHtml);
		});
	} else {
		return res.send(logoutHtml);
	}
};