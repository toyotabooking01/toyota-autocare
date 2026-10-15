const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const reports = require('../services/reportService');
const analytics = require('../services/reportAnalyticsService');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate, authorize('admin'));
router.get('/summary', async (req, res) => res.json(await reports.summary(req.query)));
router.get('/analytics', async (req, res) => res.json(await analytics.analytics(req.query)));
router.get('/export/:kind', async (req, res) => analytics.exportCsv(req.params.kind, req.query, res));
module.exports = router;
