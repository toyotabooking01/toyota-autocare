const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const history = require('../services/serviceHistoryService');
const { listResponse } = require('../utils/pagination');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
}, authenticate, authorize('client', 'staff', 'admin'));
router.get('/', async (req, res) => res.json(listResponse(await history.list(req.user, req.query))));
module.exports = router;
