const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/register', userController.getRegisterPage);
router.post('/register', userController.registerUser);
router.get('/login', userController.getLoginPage);
router.post('/login', userController.loginUser);

module.exports = router;
