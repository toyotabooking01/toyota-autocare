const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');
const Payment = require('../models/Payment');
const Service = require('../models/Service');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const engagement = require('./engagementService');
const cloudinaryService = require('./cloudinaryService');
const receiptService = require('./receiptService');
const { MAX_IMAGE_BYTES } = require('../middleware/imageUpload');
const holds = require('./bookingHoldService');
const { audit } = require('../utils/operationalActor');

const digitalMethods = new Set(['gcash', 'maya', 'bank_transfer']);
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const id = value => {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid record ID.');
  return value;
};
const cents = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001)
    throw new HttpError(400, 'Enter a valid amount in pesos and centavos.');
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) throw new HttpError(400, 'Payment amount is too large.');
  return result;
};
async function totalCents(booking, session) {
  if (booking.finalTotalCents != null) return booking.finalTotalCents;
  if (booking.estimatedTotalCents != null) return booking.estimatedTotalCents;
  const query = Service.find({ _id: { $in: booking.services } }).select('_id estimatedPrice');
  const services = await (session ? query.session(session) : query).lean();
  if (services.length !== booking.services.length) throw new HttpError(409, 'Service price is unavailable.');
  return services.reduce((sum, service) => sum + cents(service.estimatedPrice), 0);
}
async function load(rawId, actor, session) {
  const query = Booking.findById(id(rawId)).select('client vehicle schedule services estimatedServiceItems status bookingType estimatedTotalCents downpaymentRequiredCents holdStatus holdExpiresAt holdReleaseReason holdConvertedAt reservationActivatedAt finalTotalCents originalServicesTotalCents additionalWorkTotalCents releasedAt releasedBy releasedByRole');
  const booking = await (session ? query.session(session) : query).lean();
  if (!booking || (actor.role === 'client' && String(booking.client) !== String(actor._id))) throw new HttpError(404, 'Booking not found.');
  if (!['client', 'staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  return booking;
}
async function calculate(booking, session) {
  const query = Payment.find({ booking: booking._id }).sort({ createdAt: 1, _id: 1 });
  const payments = await (session ? query.session(session) : query).lean();
  const finalTotalCents = await totalCents(booking, session);
  const downpaymentPaidCents = payments.filter(item => item.stage === 'downpayment' && item.status === 'verified')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const finalPaidCents = payments.filter(item => item.stage === 'final' && item.status === 'verified')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const totalPaidCents = downpaymentPaidCents + finalPaidCents;
  const remainingBalanceCents = Math.max(0, finalTotalCents - totalPaidCents);
  const latestFinal = [...payments].reverse().find(item => item.stage === 'final');
  const latestDownpayment = [...payments].reverse().find(item => item.stage === 'downpayment');
  const paymentStatus = latestFinal?.status === 'verified' && remainingBalanceCents === 0 ? 'paid'
    : latestFinal?.status === 'submitted' ? 'pending_verification'
      : latestFinal?.status === 'rejected' ? 'rejected' : 'final_payment_due';
  return { bookingId: String(booking._id), bookingStatus: booking.status, finalTotalCents,
    estimatedTotalCents: booking.estimatedTotalCents, downpaymentRequiredCents: booking.downpaymentRequiredCents,
    holdStatus: booking.holdStatus, holdExpiresAt: booking.holdExpiresAt, holdReleaseReason: booking.holdReleaseReason,
    holdConvertedAt: booking.holdConvertedAt, reservationActivatedAt: booking.reservationActivatedAt,
    downpaymentStatus: latestDownpayment?.status || 'not_submitted',
    downpaymentPaidCents,
    finalPaidCents, totalPaidCents, remainingBalanceCents, paymentStatus,
    finalServiceTotal: finalTotalCents / 100, downpaymentPaid: downpaymentPaidCents / 100,
    finalPaymentDue: Math.max(0, finalTotalCents - downpaymentPaidCents) / 100,
    totalPaid: totalPaidCents / 100, remainingBalance: remainingBalanceCents / 100,
    payments: payments.map(item => ({ id: String(item._id), stage: item.stage, amountCents: item.amountCents,
      method: item.method, reference: item.reference, proof: item.proof,
      proofImage: item.proofImage ? { secureUrl: item.proofImage.secureUrl, width: item.proofImage.width,
        height: item.proofImage.height, format: item.proofImage.format } : null, status: item.status,
      submittedAt: item.createdAt, verifiedBy: item.verifiedBy, verifiedByRole: item.verifiedByRole,
      verifiedAt: item.verifiedAt, rejectedAt: item.rejectedAt })),
    release: booking.releasedAt ? { at: booking.releasedAt, by: booking.releasedBy, byRole: booking.releasedByRole } : null };
}
async function summary(rawId, actor) {
  await holds.releaseExpired({ _id: id(rawId) });
  return calculate(await load(rawId, actor));
}
function releaseReason(summary) {
  if (summary.paymentStatus === 'pending_verification') return 'Final payment is still awaiting verification.';
  if (summary.paymentStatus === 'rejected') return 'Final payment was rejected. Submit a new final payment.';
  if (!summary.payments.some(item => item.stage === 'final')) return 'Final payment has not yet been submitted.';
  if (summary.remainingBalanceCents > 0 || summary.paymentStatus !== 'paid') return 'Full payment is required before the vehicle can be released.';
  return null;
}
function submissionInput(raw, file) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['stage', 'amount', 'method', 'reference'].includes(key)))
    throw new HttpError(400, 'Invalid payment submission.');
  if (!['downpayment', 'final'].includes(raw.stage)) throw new HttpError(400, 'Select a payment stage.');
  if (!['cash', 'bank_transfer', 'gcash', 'maya', 'no_charge'].includes(raw.method)) throw new HttpError(400, 'Select a payment method.');
  if (typeof raw.reference !== 'undefined' && (typeof raw.reference !== 'string' || raw.reference.length > 120)) throw new HttpError(400, 'Invalid payment reference.');
  const amount = typeof raw.amount === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw.amount)
    ? Number(raw.amount) : raw.amount;
  const amountCents = cents(amount);
  if (raw.method === 'no_charge' && amountCents !== 0) throw new HttpError(400, 'No-charge payment amount must be zero.');
  if (digitalMethods.has(raw.method) && !file) throw new HttpError(400, 'Payment proof image is required.');
  if (!digitalMethods.has(raw.method) && file) throw new HttpError(400, 'This payment method does not use a proof image.');
  if (file && (!Buffer.isBuffer(file.buffer) || !file.buffer.length || !allowedImageTypes.has(file.mimetype)
    || file.buffer.length > MAX_IMAGE_BYTES)) throw new HttpError(400, 'Select a valid image up to 8 MB.');
  return amountCents;
}
async function assertAccess(rawId, actor) { await load(rawId, actor); }
async function checkBusiness(booking, actor, raw, amountCents, session) {
  const provisional = booking.status === 'awaiting_downpayment';
  if (!provisional && amountCents === 0 && raw.method !== 'no_charge')
    throw new HttpError(400, 'Payment amount must be greater than zero.');
  if (booking.holdReleaseReason === 'expired' || (provisional && booking.holdStatus === 'active'
    && (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= new Date()))) {
    throw new HttpError(409, holds.expiredMessage);
  }
  if (provisional) {
    if (raw.stage !== 'downpayment' || booking.holdStatus !== 'active')
      throw new HttpError(409, 'Downpayment is unavailable at this booking stage.');
    if (!digitalMethods.has(raw.method)) throw new HttpError(400, 'Choose GCash, Maya, or Bank Transfer.');
    if (!raw.reference?.trim()) throw new HttpError(400, 'Payment reference is required.');
    if (amountCents !== booking.downpaymentRequiredCents)
      throw new HttpError(400, 'Downpayment must equal the exact required 50% amount.');
  }
  if (raw.stage === 'final' ? booking.status !== 'ready_for_release'
    : !['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(booking.status))
    throw new HttpError(409, 'Payment is unavailable at this booking stage.');
  const current = await calculate(booking, session);
  if (raw.stage === 'final' && current.paymentStatus === 'paid') throw new HttpError(409, 'Final payment is already verified.');
  if (current.payments.some(item => item.stage === raw.stage && item.status === 'submitted'))
    throw new HttpError(409, 'A payment is already awaiting verification.');
  if (provisional && current.payments.some(item => item.stage === 'downpayment' && item.status === 'verified'))
    throw new HttpError(409, 'Downpayment is already verified.');
  const due = raw.stage === 'final' ? current.remainingBalanceCents : current.finalTotalCents - current.totalPaidCents;
  if (raw.stage === 'final' && actor.role === 'client' && amountCents !== due)
    throw new HttpError(400, 'Final payment must equal the current remaining balance.');
  if (amountCents > due || (amountCents === 0 && due !== 0)) throw new HttpError(409, 'Payment exceeds the remaining balance.');
}
async function submit(rawId, actor, raw, file) {
  const amountCents = submissionInput(raw, file);
  await holds.releaseExpired({ _id: id(rawId) });
  const preflight = await load(rawId, actor);
  if (preflight.status === 'awaiting_downpayment' && actor.role !== 'client')
    throw new HttpError(403, 'Only the booking client can submit this downpayment.');
  await checkBusiness(preflight, actor, raw, amountCents);
  const proofImage = file ? await cloudinaryService.uploadImage(file.buffer,
    raw.stage === 'downpayment' ? 'downpayment' : 'final-payment') : undefined;
  let created;
  try {
    await mongoose.connection.transaction(async session => {
      const booking = await load(rawId, actor, session);
      if (booking.status === 'awaiting_downpayment' && actor.role !== 'client')
        throw new HttpError(403, 'Only the booking client can submit this downpayment.');
      await checkBusiness(booking, actor, raw, amountCents, session);
      [created] = await Payment.create([{ booking: booking._id, client: booking.client, stage: raw.stage, amountCents,
        method: raw.method, reference: raw.reference?.trim() || '', ...(proofImage ? { proofImage } : {}),
        status: 'submitted', submittedBy: actor._id }], { session });
      const provisional = booking.status === 'awaiting_downpayment';
      const locked = await Booking.updateOne({ _id: booking._id, status: booking.status,
        ...(provisional ? { holdStatus: 'active', holdExpiresAt: { $gt: new Date() } } : {}) },
      { $inc: { __v: 1 }, ...(provisional ? { $set: { holdStatus: 'payment_submitted', holdExpiresAt: null } } : {}) }, { session });
      if (!locked.modifiedCount) throw new HttpError(409, 'Booking changed during payment submission.');
      if (raw.stage === 'final') await engagement.recordNotification(session, { user: booking.client,
        eventKey: `payment:${created._id}:submitted`, title: 'Final payment submitted', paymentId: created._id,
        message: 'Your final payment is awaiting verification.', type: 'payment', bookingId: booking._id,
        relatedUserId: booking.client, path: '/client/bookings' });
      if (raw.stage === 'final') {
        const staff = await User.find({ role: 'staff', status: 'active', isArchived: false }).select('_id').session(session).lean();
        for (const user of staff) await engagement.recordNotification(session, { user: user._id,
          eventKey: `payment:${created._id}:verify:staff:${user._id}`, title: 'Final payment verification required',
          message: 'A final payment is awaiting verification before vehicle release.', type: 'payment',
          bookingId: booking._id, paymentId: created._id, relatedUserId: booking.client, path: '/staff/bookings' });
      }
    });
  } catch (error) {
    if (proofImage) {
      try { await cloudinaryService.deleteAsset(proofImage.publicId); } catch { /* Preserve the payment failure. */ }
    }
    if (error.code === 11000) throw new HttpError(409, 'A payment is already awaiting verification.');
    await holds.releaseExpired({ _id: id(rawId) });
    throw error;
  }
  return summary(rawId, actor);
}
async function decide(rawId, rawPaymentId, actor, decision) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  if (!['verify', 'reject'].includes(decision)) throw new HttpError(400, 'Invalid payment decision.');
  let receiptIds = [];
  await mongoose.connection.transaction(async session => {
    receiptIds = [];
    const booking = await load(rawId, actor, session);
    const paymentId = id(rawPaymentId);
    const payment = await Payment.findOne({ _id: paymentId, booking: booking._id, status: 'submitted' }).session(session).lean();
    if (!payment) {
      const previous = await Payment.findOne({ _id: paymentId, booking: booking._id }).session(session).lean();
      if (previous?.stage === 'final' && previous.status === (decision === 'verify' ? 'verified' : 'rejected')) return;
      if (previous?.stage === 'downpayment' && previous.status === (decision === 'verify' ? 'verified' : 'rejected')) {
        if (decision === 'reject' || (booking.holdStatus === 'converted' &&
          ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection', 'ready_for_release', 'completed'].includes(booking.status))) return;
      }
      throw new HttpError(409, 'Payment is unavailable for verification.');
    }
    if (payment.stage === 'final' && booking.status !== 'ready_for_release') throw new HttpError(409, 'Booking is not ready for release.');
    if (payment.stage === 'downpayment' && !['awaiting_downpayment', 'pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(booking.status))
      throw new HttpError(409, 'Downpayment verification is unavailable at this booking stage.');
    const provisional = payment.stage === 'downpayment' && booking.status === 'awaiting_downpayment';
    if (provisional && (booking.holdStatus !== 'payment_submitted' || payment.amountCents !== booking.downpaymentRequiredCents))
      throw new HttpError(409, 'Submitted downpayment does not match the protected booking hold.');
    const current = await calculate(booking, session);
    if (decision === 'verify' && payment.amountCents > current.remainingBalanceCents)
      throw new HttpError(409, 'Payment exceeds the remaining balance.');
    const now = new Date();
    const fields = decision === 'verify' ? { status: 'verified', verifiedBy: actor._id, verifiedByRole: actor.role, verifiedAt: now }
      : { status: 'rejected', rejectedBy: actor._id, rejectedAt: now };
    const changed = await Payment.updateOne({ _id: payment._id, status: 'submitted' }, { $set: fields }, { session });
    if (!changed.modifiedCount) throw new HttpError(409, 'Payment was already processed.');
    if (provisional && decision === 'verify') {
      const locked = await Booking.updateOne({ _id: booking._id, status: 'awaiting_downpayment', holdStatus: 'payment_submitted' },
        { $set: { status: 'pending', holdStatus: 'converted', holdExpiresAt: null, holdConvertedAt: now,
          reservationActivatedAt: now, lastProcessedBy: actor._id, lastProcessedByRole: actor.role, lastProcessedAt: now },
        $push: { activity: audit(actor, 'downpayment_verified') } }, { session });
      if (locked.modifiedCount !== 1) throw new HttpError(409, 'Booking changed during downpayment verification.');
      const transferred = await Schedule.updateOne({ _id: booking.schedule, temporaryHoldCount: { $gt: 0 },
        $expr: { $and: [{ $lt: ['$currentBookingCount', '$maximumCapacity'] },
          holds.capacityWithin('$maximumCapacity')] } },
      { $inc: { temporaryHoldCount: -1, currentBookingCount: 1 } }, { session });
      if (transferred.modifiedCount !== 1) throw new HttpError(409, 'Protected schedule capacity could not be converted.');
      receiptIds = [await receiptService.createForVerification(session, booking,
        { ...payment, ...fields }, actor, now)];
      await engagement.recordDownpaymentOutcome(session, booking, payment, 'verified', actor);
      return;
    }
    if (provisional && decision === 'reject') {
      const locked = await Booking.updateOne({ _id: booking._id, status: 'awaiting_downpayment', holdStatus: 'payment_submitted' },
        { $set: { holdStatus: 'active', holdStartedAt: now,
          holdExpiresAt: new Date(now.getTime() + holds.HOLD_MS), lastProcessedBy: actor._id,
          lastProcessedByRole: actor.role, lastProcessedAt: now },
        $push: { activity: audit(actor, 'downpayment_rejected') } }, { session });
      if (locked.modifiedCount !== 1) throw new HttpError(409, 'Booking changed during downpayment rejection.');
      await engagement.recordDownpaymentOutcome(session, booking, payment, 'rejected', actor);
      return;
    }
    const locked = await Booking.updateOne({ _id: booking._id, status: booking.status }, { $inc: { __v: 1 } }, { session });
    if (!locked.modifiedCount) throw new HttpError(409, 'Booking changed during payment verification.');
    if (payment.stage === 'final') {
      const settled = decision === 'verify' ? await calculate(booking, session) : null;
      if (settled) receiptIds = await receiptService.createForFinalVerification(session, booking,
        { ...payment, ...fields }, actor, settled, now);
      await engagement.recordNotification(session, { user: booking.client,
        eventKey: `payment:${payment._id}:${fields.status}`, title: decision === 'reject' ? 'Final payment rejected'
          : settled.remainingBalanceCents === 0 ? 'Payment complete' : 'Final payment verified',
        paymentId: payment._id,
        message: decision === 'reject' ? 'Your final payment was rejected. Please submit a new payment.'
          : settled.remainingBalanceCents === 0 ? 'Your booking is fully paid and eligible for vehicle release.'
            : `Your final payment was verified. Remaining balance: PHP ${(settled.remainingBalanceCents / 100).toFixed(2)}.`,
        type: 'payment', bookingId: booking._id, relatedUserId: booking.client, path: '/client/bookings' });
    }
  });
  for (const receiptId of receiptIds) {
    try { await receiptService.processAfterVerification(receiptId); }
    catch { /* Post-commit document delivery must not change a verified payment. */ }
  }
  return summary(rawId, actor);
}
module.exports = { totalCents, calculate, summary, releaseReason, assertAccess, submit, decide };
