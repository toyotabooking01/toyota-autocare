const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const archive = require('../services/archiveService');
const { listResponse } = require('../utils/pagination');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
}, authenticate, authorize('admin'));
router.get('/:category', async (req, res) => res.json(listResponse(await archive.list(req.params.category, req.query))));
router.get('/:category/:id', async (req, res) => res.json({ item: await archive.get(req.params.category, req.params.id) }));
router.post('/:category/:id/archive', async (req, res) => {
  const action = { users: archive.user, vehicles: archive.vehicle, services: archive.service }[req.params.category];
  if (!action) throw new HttpError(400, 'Invalid archive category.');
  res.json({ item: await action(req.params.id, true, req.user, req.body) });
});
router.post('/:category/:id/restore', async (req, res) => {
  const action = { users: archive.user, vehicles: archive.vehicle, services: archive.service }[req.params.category];
  if (!action) throw new HttpError(400, 'Invalid archive category.');
  res.json({ item: await action(req.params.id, false, req.user, req.body) });
});
module.exports = router;
