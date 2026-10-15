const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const jobs = require('../services/jobOrderService');
const { listResponse } = require('../utils/pagination');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate, authorize('admin', 'staff', 'mechanic'));
router.get('/', async (req, res) => res.json(listResponse(await jobs.list(req.user.role === 'mechanic' ? req.user._id : undefined, req.query))));
router.get('/active', authorize('mechanic', 'admin'), async (req, res) => res.json({ item: await jobs.active(req.user.role === 'mechanic' ? req.user._id : undefined) }));
router.get('/:id', async (req, res) => res.json({ item: await jobs.get(req.params.id, req.user.role === 'mechanic' ? req.user._id : undefined) }));
router.put('/:id/work', authorize('mechanic', 'admin'), async (req, res) => res.json({ item: await jobs.saveWork(req.params.id, req.user, req.body) }));
router.patch('/:id/duration', authorize('staff', 'mechanic', 'admin'), async (req, res) => res.json(await jobs.updateEstimatedDuration(req.params.id, req.user, req.body)));
router.post('/:id/start', authorize('mechanic', 'admin'), async (req, res) => res.json({ item: await jobs.transition(req.params.id, req.user, 'start') }));
router.post('/:id/final-inspection', authorize('mechanic', 'admin'), async (req, res) => res.json({ item: await jobs.transition(req.params.id, req.user, 'final-inspection') }));
router.post('/:id/ready-for-release', authorize('staff', 'admin'), async (req, res) => res.json({ item: await jobs.transition(req.params.id, req.user, 'ready-for-release') }));
router.post('/:id/complete', authorize('staff', 'admin'), async (req, res) => res.json({ item: await jobs.transition(req.params.id, req.user, 'complete') }));
module.exports = router;
