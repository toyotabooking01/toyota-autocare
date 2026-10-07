const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const actions = require('../controllers/bookingScheduleController');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate);
router.get('/available', authorize('client'), actions.scheduleAvailable);
router.use(authorize('admin'));
router.get('/', actions.scheduleList);
router.post('/', actions.scheduleCreate);
router.get('/:id', actions.scheduleGet);
router.patch('/:id', actions.scheduleUpdate);
router.patch('/:id/enabled', actions.scheduleEnabled);
module.exports = router;
