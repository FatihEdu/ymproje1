const bcrypt = require('bcryptjs');
const User = require('../models/userModel');

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 20;
const DEFAULT_SALT_ROUNDS = 10;

exports.registerUser = async (req, res) => {
	const { username: rawUsername, password } = req.body;
	const username = typeof rawUsername === 'string' ? rawUsername.trim() : rawUsername;

	if (!username || !password) {
		return res.redirect('/register?error=empty');
	}

	const existingUser = User.getByUsername(username);
	if (existingUser) {
		return res.redirect('/register?error=duplicate');
	}

	const parsed = Number.parseInt(process.env.SALT_ROUNDS, 10);
	const saltRounds = Number.isFinite(parsed) && parsed >= MIN_SALT_ROUNDS && parsed <= MAX_SALT_ROUNDS
		? parsed
		: DEFAULT_SALT_ROUNDS;
	try {
		const hashed = await bcrypt.hash(password, saltRounds);
		User.save({ username, password: hashed });
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
		return res.status(500).send('Internal server error');
	}
};

exports.loginUser = async (req, res) => {
	const { username: rawUsername, password } = req.body;
	const username = typeof rawUsername === 'string' ? rawUsername.trim() : rawUsername;
	if (!username || !password) {
		return res.redirect('/login?error=1');
	}

	try {
		const found = User.getByUsername(username);
		if (!found) {
			return res.redirect('/login?error=1');
		}
		const match = await bcrypt.compare(password, found.password);
		if (!match) {
			return res.redirect('/login?error=1');
		}
		if (req?.session) {
			return req.session.regenerate((err) => {
				if (err) {
					console.error('Session regenerate error:', err);
					return res.status(500).send('Internal server error');
				}
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
			return res.redirect('/');
		});
	} else {
		return res.redirect('/');
	}
};
