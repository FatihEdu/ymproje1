const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const { generateCsrfToken } = require('../middlewares/csrf');

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 20;
const DEFAULT_SALT_ROUNDS = 10;

// Cache templates at startup to avoid blocking the event loop on every request
const registerTemplate = fs.readFileSync(path.join(__dirname, '../views/register.html'), 'utf8');
const loginTemplate = fs.readFileSync(path.join(__dirname, '../views/login.html'), 'utf8');
const favsTemplate = fs.readFileSync(path.join(__dirname, '../views/favs.html'), 'utf8');

exports.getRegisterPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	res.send(registerTemplate.replace('<!--CSRF-->', tokenInput));
};

exports.getLoginPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	const errorHtml = req.query.error ? '<p style="color:red">Invalid username or password.</p>' : '';
	res.send(loginTemplate.replace('<!--CSRF-->', tokenInput).replace('<!--ERROR-->', errorHtml));
};

exports.getFavsPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	res.send(favsTemplate.replace('<!--CSRF-->', tokenInput));
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
	 return res.redirect('/login');
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
	if (req?.session) {
		req.session.destroy((err) => {
			if (err) {
				console.error('Session destroy error:', err);
				return res.status(500).send('Error logging out');
			}
			res.clearCookie('connect.sid');
			return res.sendFile(path.join(__dirname, '../views/logout.html'));
		});
	} else {
		return res.sendFile(path.join(__dirname, '../views/logout.html'));
	}
};