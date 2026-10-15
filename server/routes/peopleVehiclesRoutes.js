const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const actions = require('../controllers/peopleVehiclesController');

function routes(kind) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
    next();
  });
  router.use(authenticate, authorize(kind === 'mechanic' ? 'admin' : 'client'));
  if (kind === 'mechanic') {
    router.get('/', actions.mechanicList);
    router.get('/next-id', actions.mechanicIdPreview);
    router.get('/:id', actions.mechanicGet);
    router.post('/', actions.mechanicCreate);
    router.patch('/:id', actions.mechanicUpdate);
    router.post('/:id/archive', actions.mechanicArchive);
    router.post('/:id/restore', actions.mechanicRestore);
  } else {
    router.get('/', actions.vehicleList);
    router.get('/:id', actions.vehicleGet);
    router.post('/', actions.vehicleCreate);
    router.patch('/:id', actions.vehicleUpdate);
  }
  return router;
}
module.exports = routes;
