const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const controller = require('../controllers/masterDataController');

function routes(kind) {
  const router = express.Router();
  const actions = controller(kind);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
    next();
  });
  router.use(authenticate, authorize('admin'));
  router.get('/', actions.list);
  if (kind === 'bay') router.get('/name-availability', actions.bayNameAvailability);
  router.get('/:id', actions.get);
  router.post('/', actions.create);
  router.patch('/:id', actions.update);
  router.post('/:id/archive', actions.archive);
  router.post('/:id/restore', actions.restore);
  return router;
}
module.exports = routes;
