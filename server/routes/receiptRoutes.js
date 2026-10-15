const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const receipts = require('../services/receiptService');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
});
router.use(authenticate, authorize('client', 'staff', 'admin'));
router.get('/:id', async (req, res) => res.json({ item: await receipts.get(req.params.id, req.user) }));
router.post('/:id/retry-document', authorize('staff', 'admin'), async (req, res) => res.json({ item: await receipts.retryDocument(req.params.id, req.user) }));
router.post('/:id/retry-email', authorize('staff', 'admin'), async (req, res) => res.json({ item: await receipts.retryEmail(req.params.id, req.user) }));
module.exports = router;
