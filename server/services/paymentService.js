const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Service = require('../models/Service');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const engagement = require('./engagementService');

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
  const query = Service.find({ _id: { $in: booking.services } }).select('_id estimatedPrice');
  const services = await (session ? query.session(session) : query).lean();
  if (services.length !== booking.services.length) throw new HttpError(409, 'Service price is unavailable.');
  return services.reduce((sum, service) => sum + cents(service.estimatedPrice), 0);
}
async function load(rawId, actor, session) {
  const query = Booking.findById(id(rawId)).select('client services status finalTotalCents releasedAt releasedBy releasedByRole');
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
  const paymentStatus = latestFinal?.status === 'verified' && remainingBalanceCents === 0 ? 'paid'
    : latestFinal?.status === 'submitted' ? 'pending_verification'
      : latestFinal?.status === 'rejected' ? 'rejected' : 'final_payment_due';
  return { bookingId: String(booking._id), bookingStatus: booking.status, finalTotalCents, downpaymentPaidCents,
    finalPaidCents, totalPaidCents, remainingBalanceCents, paymentStatus,
    finalServiceTotal: finalTotalCents / 100, downpaymentPaid: downpaymentPaidCents / 100,
    finalPaymentDue: Math.max(0, finalTotalCents - downpaymentPaidCents) / 100,
    totalPaid: totalPaidCents / 100, remainingBalance: remainingBalanceCents / 100,
    payments: payments.map(item => ({ id: String(item._id), stage: item.stage, amountCents: item.amountCents,
      method: item.method, reference: item.reference, proof: item.proof, status: item.status,
      submittedAt: item.createdAt, verifiedBy: item.verifiedBy, verifiedByRole: item.verifiedByRole,
      verifiedAt: item.verifiedAt, rejectedAt: item.rejectedAt })),
    release: booking.releasedAt ? { at: booking.releasedAt, by: booking.releasedBy, byRole: booking.releasedByRole } : null };
}
async function summary(rawId, actor) { return calculate(await load(rawId, actor)); }
function releaseReason(summary) {
  if (summary.paymentStatus === 'pending_verification') return 'Final payment is still awaiting verification.';
  if (summary.paymentStatus === 'rejected') return 'Final payment was rejected. Submit a new final payment.';
  if (!summary.payments.some(item => item.stage === 'final')) return 'Final payment has not yet been submitted.';
  if (summary.remainingBalanceCents > 0 || summary.paymentStatus !== 'paid') return 'Full payment is required before the vehicle can be released.';
  return null;
}
async function submit(rawId, actor, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['stage', 'amount', 'method', 'reference', 'proof'].includes(key)))
    throw new HttpError(400, 'Invalid payment submission.');
  if (!['downpayment', 'final'].includes(raw.stage)) throw new HttpError(400, 'Select a payment stage.');
  if (!['cash', 'bank_transfer', 'gcash', 'maya', 'no_charge'].includes(raw.method)) throw new HttpError(400, 'Select a payment method.');
  if (raw.method === 'no_charge' && raw.amount !== 0) throw new HttpError(400, 'No-charge payment amount must be zero.');
  if (typeof raw.reference !== 'undefined' && (typeof raw.reference !== 'string' || raw.reference.length > 120)) throw new HttpError(400, 'Invalid payment reference.');
  if (typeof raw.proof !== 'undefined' && (typeof raw.proof !== 'string' || raw.proof.length > 500)) throw new HttpError(400, 'Invalid payment proof.');
  const amountCents = cents(raw.amount);
  if (amountCents === 0 && raw.method !== 'no_charge') throw new HttpError(400, 'Payment amount must be greater than zero.');
  let created;
  try {
    await mongoose.connection.transaction(async session => {
      const booking = await load(rawId, actor, session);
      if (raw.stage === 'final' ? booking.status !== 'ready_for_release'
        : !['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(booking.status))
        throw new HttpError(409, 'Payment is unavailable at this booking stage.');
      const current = await calculate(booking, session);
      if (raw.stage === 'final' && current.paymentStatus === 'paid') throw new HttpError(409, 'Final payment is already verified.');
      if (current.payments.some(item => item.stage === raw.stage && item.status === 'submitted'))
        throw new HttpError(409, 'A payment is already awaiting verification.');
      const due = raw.stage === 'final' ? current.remainingBalanceCents : current.finalTotalCents - current.totalPaidCents;
      if (amountCents > due || (amountCents === 0 && due !== 0)) throw new HttpError(409, 'Payment exceeds the remaining balance.');
      [created] = await Payment.create([{ booking: booking._id, client: booking.client, stage: raw.stage, amountCents,
        method: raw.method, reference: raw.reference?.trim() || '', proof: raw.proof?.trim() || '',
        status: 'submitted', submittedBy: actor._id }], { session });
      const locked = await Booking.updateOne({ _id: booking._id, status: booking.status }, { $inc: { __v: 1 } }, { session });
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
    if (error.code === 11000) throw new HttpError(409, 'A payment is already awaiting verification.');
    throw error;
  }
  return summary(rawId, actor);
}
async function decide(rawId, rawPaymentId, actor, decision) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  if (!['verify', 'reject'].includes(decision)) throw new HttpError(400, 'Invalid payment decision.');
  await mongoose.connection.transaction(async session => {
    const booking = await load(rawId, actor, session);
    const payment = await Payment.findOne({ _id: id(rawPaymentId), booking: booking._id, status: 'submitted' }).session(session).lean();
    if (!payment) throw new HttpError(409, 'Payment is unavailable for verification.');
    if (payment.stage === 'final' && booking.status !== 'ready_for_release') throw new HttpError(409, 'Booking is not ready for release.');
    if (payment.stage === 'downpayment' && !['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service', 'final_inspection'].includes(booking.status))
      throw new HttpError(409, 'Downpayment verification is unavailable at this booking stage.');
    const current = await calculate(booking, session);
    if (decision === 'verify' && payment.amountCents > current.remainingBalanceCents)
      throw new HttpError(409, 'Payment exceeds the remaining balance.');
    const now = new Date();
    const fields = decision === 'verify' ? { status: 'verified', verifiedBy: actor._id, verifiedByRole: actor.role, verifiedAt: now }
      : { status: 'rejected', rejectedBy: actor._id, rejectedAt: now };
    const changed = await Payment.updateOne({ _id: payment._id, status: 'submitted' }, { $set: fields }, { session });
    if (!changed.modifiedCount) throw new HttpError(409, 'Payment was already processed.');
    const locked = await Booking.updateOne({ _id: booking._id, status: booking.status }, { $inc: { __v: 1 } }, { session });
    if (!locked.modifiedCount) throw new HttpError(409, 'Booking changed during payment verification.');
    if (payment.stage === 'final') await engagement.recordNotification(session, { user: booking.client,
      eventKey: `payment:${payment._id}:${fields.status}`, title: decision === 'verify' ? 'Final payment verified' : 'Final payment rejected',
      paymentId: payment._id,
      message: decision === 'verify' ? 'Your final payment has been verified.' : 'Your final payment was rejected. Please submit a new payment.',
      type: 'payment', bookingId: booking._id, relatedUserId: booking.client, path: '/client/bookings' });
  });
  return summary(rawId, actor);
}
module.exports = { totalCents, calculate, summary, releaseReason, submit, decide };
