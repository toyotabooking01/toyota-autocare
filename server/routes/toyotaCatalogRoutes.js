const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const actions = require('../controllers/toyotaCatalogController');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate, authorize('client', 'staff', 'admin'));
router.get('/catalog', actions.catalog);
router.get('/models', actions.models);
router.get('/years', actions.years);
router.get('/variants', actions.variants);
router.get('/external-image', actions.externalImage);

module.exports = router;
