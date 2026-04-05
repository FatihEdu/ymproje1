const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/register', userController.getRegisterPage);
router.post('/register', userController.registerUser);
router.get('/login', userController.getLoginPage);
router.post('/login', userController.loginUser);
router.get('/favs', requireAuth, userController.getFavsPage);
router.get('/auth/me', userController.authMe);
router.get('/logout', requireAuth, userController.logoutUser);

module.exports = router;
