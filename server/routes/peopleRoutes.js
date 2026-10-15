const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const HttpError = require('../utils/HttpError');
const staffAccounts = require('../services/staffAccountService');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Database is temporarily unavailable.'));
  next();
}, authenticate, authorize('admin', 'staff'));

router.get('/staff', authorize('admin'), async (req, res) => {
  const items = await User.find({ role: 'staff' }).select(staffAccounts.projection)
    .sort({ createdAt: -1 }).lean();
  const activity = items.length ? await Booking.aggregate([
    { $match: { lastProcessedBy: { $in: items.map(item => item._id) } } },
    { $group: { _id: '$lastProcessedBy', processedBookings: { $sum: 1 } } },
  ]) : [];
  const counts = new Map(activity.map(item => [String(item._id), item.processedBookings]));
  res.json({ items: items.map(item => ({ ...item, processedBookings: counts.get(String(item._id)) || 0 })) });
});
router.get('/staff/next-id', authorize('admin'), async (req, res) => {
  res.json({ staffId: await staffAccounts.previewNextStaffId() });
});
router.post('/staff', authorize('admin'), async (req, res) => {
  res.status(201).json(await staffAccounts.create(req.body));
});
router.patch('/staff/:id/status', authorize('admin'), async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !['active', 'inactive'].includes(req.body?.status)
    || Object.keys(req.body).length !== 1) throw new HttpError(400, 'Invalid staff status update.');
  const item = await User.findOneAndUpdate({ _id: req.params.id, role: 'staff', isArchived: false,
    status: { $ne: req.body.status } },
    { $set: { status: req.body.status }, $inc: { authVersion: 1 } }, { returnDocument: 'after' })
    .select(staffAccounts.projection);
  if (item) {
    await require('../services/engagementService').recordAccountEvent(item, req.body.status === 'active' ? 'enabled' : 'disabled');
    return res.json({ item });
  }
  const existing = await User.findOne({ _id: req.params.id, role: 'staff', isArchived: false }).select(staffAccounts.projection);
  if (!existing) throw new HttpError(404, 'Staff account not found.');
  res.json({ item: existing });
});
router.get('/customers', async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search.length > 100) throw new HttpError(400, 'Invalid search.');
  const pattern = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const filter = { role: 'client', ...(search ? { $or: [{ fullName: pattern }, { email: pattern }, { contactEmail: pattern }, { phone: pattern }] } : {}) };
  const items = await User.find(filter).select('fullName email contactEmail phone status isArchived isWalkInCustomer').sort({ fullName: 1 }).limit(100).lean();
  res.json({ items: items.map(item => ({ ...item, email: item.isWalkInCustomer ? item.contactEmail || '' : item.email,
    contactEmail: undefined })) });
});
router.get('/customers/:id', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new HttpError(400, 'Invalid customer ID.');
  const customer = await User.findOne({ _id: req.params.id, role: 'client' }).select('fullName email contactEmail phone status isArchived isWalkInCustomer').lean();
  if (!customer) throw new HttpError(404, 'Customer not found.');
  const [vehicles, bookings] = await Promise.all([
    Vehicle.find({ owner: customer._id }).select('make model year plateNumber isArchived').lean(),
    Booking.find({ client: customer._id }).sort({ bookingDate: -1 }).limit(50)
      .select('bookingDate bookingTime status bookingType vehicle services').populate('services', 'name').lean(),
  ]);
  res.json({ customer: { ...customer, email: customer.isWalkInCustomer ? customer.contactEmail || '' : customer.email,
    contactEmail: undefined }, vehicles, bookings });
});
module.exports = router;
