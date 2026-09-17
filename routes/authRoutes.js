const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/auth/me', authController.authMe);
router.post('/logout', requireAuth, authController.logoutUser);

module.exports = router;
