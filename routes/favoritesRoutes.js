const express = require('express');
const favoritesController = require('../controllers/favoritesController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/api/favorites', requireAuth, favoritesController.getFavorites);
router.post('/api/favorites', requireAuth, favoritesController.addFavorite);
router.post('/api/favorites/remove', requireAuth, favoritesController.removeFavorite);

module.exports = router;
