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
router.use(authenticate, authorize('client', 'admin'));
router.get('/options', authorize('client'), actions.bookingOptions);
router.get('/walk-in/options', authorize('admin'), actions.walkInOptions);
router.get('/assignment-options', authorize('admin'), actions.assignmentOptions);
router.get('/walk-in/clients', authorize('admin'), actions.walkInClients);
router.get('/walk-in/clients/:clientId/vehicles', authorize('admin'), actions.walkInVehicles);
router.post('/walk-in', authorize('admin'), actions.walkInCreate);
router.get('/', actions.bookingList);
router.post('/', authorize('client'), actions.bookingCreate);
router.get('/:id', actions.bookingGet);
router.post('/:id/cancel', actions.bookingCancel);
router.post('/:id/confirm', authorize('admin'), actions.bookingConfirm);
router.post('/:id/reject', authorize('admin'), actions.bookingReject);
router.post('/:id/check-in', authorize('admin'), actions.bookingCheckIn);
router.post('/:id/assign', authorize('admin'), actions.bookingAssign);
module.exports = router;
