const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const work = require('../services/additionalWorkService');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate, authorize('client', 'mechanic', 'staff', 'admin'));
router.get('/:id', async (req, res) => res.json({ item: await work.get(req.params.id, req.user) }));
for (const [path, action, roles] of [
  ['send', 'send', ['staff', 'admin']], ['reject', 'reject', ['staff', 'admin']],
  ['cancel', 'cancel', ['staff', 'admin']], ['approve', 'approve', ['client']],
  ['decline', 'decline', ['client']], ['perform', 'perform', ['mechanic', 'admin']],
]) router.post(`/:id/${path}`, authorize(...roles), async (req, res) =>
  res.json({ item: await work.mutate(req.params.id, req.user, action, req.body) }));
module.exports = router;
