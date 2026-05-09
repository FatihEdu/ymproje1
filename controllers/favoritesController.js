const User = require('../models/userModel');

exports.getFavorites = (req, res) => {
	const username = req.session.user.username;
	const favorites = User.getFavorites(username);
	return res.json({ favorites });
};

exports.addFavorite = (req, res) => {
	const username = req.session.user.username;
	const pair = (req.body?.pair || '').trim();
	const providerName = (req.body?.providerName || '').trim();

	if (!pair || !providerName) {
		return res.status(400).json({ error: 'pair and providerName are required' });
	}

	const ok = User.addFavorite(username, { pair, providerName });
	if (!ok) return res.status(404).json({ error: 'User not found' });

	return res.json({ ok: true, favorites: User.getFavorites(username) });
};

exports.removeFavorite = (req, res) => {
	const username = req.session.user.username;
	const pair = (req.body?.pair || '').trim();
	const providerName = (req.body?.providerName || '').trim();

	if (!pair || !providerName) {
		return res.status(400).json({ error: 'pair and providerName are required' });
	}

	const ok = User.removeFavorite(username, { pair, providerName });
	if (!ok) return res.status(404).json({ error: 'User not found' });

	return res.json({ ok: true, favorites: User.getFavorites(username) });
};
