const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const engagement = require('../services/engagementService');
const { listResponse } = require('../utils/pagination');

function available(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
}
const notifications = express.Router();
notifications.use(available, authenticate, authorize('client'));
notifications.get('/', async (req, res) => res.json({ items: await engagement.notifications(req.user._id) }));
notifications.get('/unread-count', async (req, res) => res.json({ count: await engagement.unreadCount(req.user._id) }));
notifications.patch('/read-all', async (req, res) => res.json(await engagement.markAllRead(req.user._id)));
notifications.patch('/:id/read', async (req, res) => res.json({ item: await engagement.markRead(req.user._id, req.params.id) }));

const reminders = express.Router();
reminders.use(available, authenticate, authorize('client', 'admin'));
reminders.get('/', async (req, res) => res.json(listResponse(await engagement.reminders(req.user.role === 'client' ? req.user._id : undefined, req.query))));
module.exports = { notifications, reminders };
