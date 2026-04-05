const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/register', userController.getRegisterPage);
router.post('/register', userController.registerUser);

module.exports = router;
