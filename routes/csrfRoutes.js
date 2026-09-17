const express = require('express');
const csrfController = require('../controllers/csrfController');
const { csrfSessionInit } = require('../middlewares/csrf');

const router = express.Router();

router.get('/csrf-token', csrfSessionInit, csrfController.getCsrfToken);

module.exports = router;
