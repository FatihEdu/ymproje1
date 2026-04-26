const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middlewares/auth');
const { csrfSessionInit } = require('../middlewares/csrf');

const router = express.Router();

router.get('/', userController.getHomePage);
router.get('/register', csrfSessionInit, userController.getRegisterPage); // csrfSessionInit marks session as modified so a connect.sid cookie is issued before generateCsrfToken() is called
router.post('/register', userController.registerUser);
router.get('/login', csrfSessionInit, userController.getLoginPage);
router.post('/login', userController.loginUser);
router.get('/favs', requireAuth, csrfSessionInit, userController.getFavsPage);
router.get('/auth/me', userController.authMe);
router.get('/csrf-token', csrfSessionInit, userController.getCsrfToken);
router.get('/api/favorites', requireAuth, userController.getFavorites);
router.post('/api/favorites', requireAuth, userController.addFavorite);
router.post('/api/favorites/remove', requireAuth, userController.removeFavorite);
router.post('/logout', requireAuth, userController.logoutUser);

module.exports = router;
