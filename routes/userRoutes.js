const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middlewares/auth');
const { csrfSessionInit } = require('../middlewares/csrf');

const router = express.Router();

router.get('/', userController.getHomePage);
router.get('/register', csrfSessionInit, userController.getRegisterPage); // First csrfSessionInit to ensure session exists for token generation and then getRegisterPage to render the page with the token
router.post('/register', userController.registerUser);
router.get('/login', csrfSessionInit, userController.getLoginPage);
router.post('/login', userController.loginUser);
router.get('/favs', requireAuth, csrfSessionInit, userController.getFavsPage);
router.get('/auth/me', userController.authMe);
router.post('/logout', requireAuth, userController.logoutUser);

module.exports = router;
