const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const HttpError = require('../utils/HttpError');

const HOLD_MS = 15 * 60 * 1000;
const expiredMessage = 'The temporary booking hold has expired. Please select a schedule again.';
const occupied = { $add: ['$currentBookingCount', { $ifNull: ['$temporaryHoldCount', 0] }] };
const capacityAvailable = { $lt: [occupied, '$maximumCapacity'] };
const capacityWithin = maximum => ({ $lte: [occupied, maximum] });

async function releaseExpired(filter = {}, now = new Date()) {
  const stale = await Booking.find({ ...filter, status: 'awaiting_downpayment', holdStatus: 'active',
    holdExpiresAt: { $lte: now } }).select('_id').lean();
  for (const item of stale) {
    await mongoose.connection.transaction(async session => {
      const previous = await Booking.findOneAndUpdate({ _id: item._id, status: 'awaiting_downpayment',
        holdStatus: 'active', holdExpiresAt: { $lte: now } },
      { $set: { status: 'cancelled', holdStatus: 'released', holdReleasedAt: now,
        holdReleaseReason: 'expired', cancellationReason: 'downpayment_hold_expired', holdExpiresAt: null } },
      { returnDocument: 'before', session });
      if (!previous) return;
      const released = await Schedule.updateOne({ _id: previous.schedule, temporaryHoldCount: { $gt: 0 } },
        { $inc: { temporaryHoldCount: -1 } }, { session });
      if (released.modifiedCount !== 1) throw new HttpError(409, 'Temporary capacity could not be released.');
    });
  }
}

module.exports = { HOLD_MS, expiredMessage, capacityAvailable, capacityWithin, releaseExpired };
