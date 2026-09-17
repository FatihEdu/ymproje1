const { generateCsrfToken } = require('../middlewares/csrf');

exports.getCsrfToken = (req, res) => {
	res.set('Cache-Control', 'no-store');
	res.set('Pragma', 'no-cache');
	return res.json({ csrfToken: generateCsrfToken(req, res) });
};
