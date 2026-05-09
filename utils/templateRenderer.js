const path = require('node:path');
const fs = require('node:fs');
const { generateCsrfToken } = require('../middlewares/csrf');

const templates = {
	index: fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8'),
	register: fs.readFileSync(path.join(__dirname, '../views/register.html'), 'utf8'),
	login: fs.readFileSync(path.join(__dirname, '../views/login.html'), 'utf8'),
	favs: fs.readFileSync(path.join(__dirname, '../views/favs.html'), 'utf8'),
	notFound: fs.readFileSync(path.join(__dirname, '../views/404.html'), 'utf8'),
	navbar: fs.readFileSync(path.join(__dirname, '../views/navbar.html'), 'utf8'),
	navbarAuthLoggedin: fs.readFileSync(path.join(__dirname, '../views/navbar-auth-loggedin.html'), 'utf8'),
	navbarAuthLoggedout: fs.readFileSync(path.join(__dirname, '../views/navbar-auth-loggedout.html'), 'utf8')
};

function buildNavbar(req, res) {
	const isLoggedIn = Boolean(req.session?.user);
	const authHtml = isLoggedIn
		? templates.navbarAuthLoggedin.replace('<!--CSRF-->', `<input type="hidden" name="_csrf" value="${generateCsrfToken(req, res)}">`)
		: templates.navbarAuthLoggedout;
	return templates.navbar.replace('<!--NAV_AUTH-->', authHtml);
}

function injectNavbar(template, req, res) {
	return template.replace('<!--NAVBAR-->', buildNavbar(req, res));
}

module.exports = {
	templates,
	buildNavbar,
	injectNavbar
};
