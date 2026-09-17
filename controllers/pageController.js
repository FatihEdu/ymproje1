const { templates, injectNavbar } = require('../utils/templateRenderer');
const { generateCsrfToken } = require('../middlewares/csrf');

exports.getHomePage = (req, res) => {
	res.send(injectNavbar(templates.index, req, res));
};

exports.get404Page = (req, res) => {
	res.status(404).send(injectNavbar(templates.notFound, req, res));
};

exports.getRegisterPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	let errorHtml = '';
	if (req.query.error === 'empty') {
		errorHtml = '<p class="error-msg">Lütfen tüm alanları doldurun.</p>';
	} else if (req.query.error === 'duplicate') {
		errorHtml = '<p class="error-msg">Bu kullanıcı adı alınmış.</p>';
	}
	res.send(
		injectNavbar(templates.register, req, res)
			.replace('<!--CSRF-->', tokenInput)
			.replace('<!--ERROR-->', errorHtml)
	);
};

exports.getLoginPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	const errorHtml = req.query.error ? '<p class="error-msg">Kullanıcı adı veya şifre hatalı.</p>' : '';
	res.send(
		injectNavbar(templates.login, req, res)
			.replace('<!--CSRF-->', tokenInput)
			.replace('<!--ERROR-->', errorHtml)
	);
};

exports.getFavsPage = (req, res) => {
	const tokenInput = `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`;
	res.send(injectNavbar(templates.favs, req, res).replace('<!--CSRF-->', tokenInput));
};
