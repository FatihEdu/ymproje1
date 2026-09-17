const express = require('express');
const pageController = require('../controllers/pageController');
const { requireAuth } = require('../middlewares/auth');
const { csrfSessionInit } = require('../middlewares/csrf');

const router = express.Router();

router.get('/', pageController.getHomePage);
router.get('/register', csrfSessionInit, pageController.getRegisterPage); // csrfSessionInit marks session as modified so a connect.sid cookie is issued before generateCsrfToken() is called
router.get('/login', csrfSessionInit, pageController.getLoginPage);
router.get('/favs', requireAuth, csrfSessionInit, pageController.getFavsPage);

module.exports = router;
