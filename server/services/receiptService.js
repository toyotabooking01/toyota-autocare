const mongoose = require('mongoose');
const Receipt = require('../models/Receipt');
const Counter = require('../models/Counter');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const Invoice = require('../models/Invoice');
const HttpError = require('../utils/HttpError');
const pdf = require('./receiptPdfService');
const cloudinary = require('./cloudinaryService');
const email = require('./emailService');

const safeError = () => 'Processing is temporarily unavailable.';
const stale = () => new Date(Date.now() - 10 * 60 * 1000);
const id = value => {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid receipt ID.');
  return value;
};

async function createForVerification(session, booking, payment, actor, verifiedAt) {
  if (payment.stage !== 'downpayment' || payment.status !== 'verified' || booking.status !== 'awaiting_downpayment'
    || booking.holdStatus !== 'payment_submitted') throw new HttpError(409, 'Receipt requires a verified protected downpayment.');
  const existing = await Receipt.findOne({ payment: payment._id, type: 'downpayment' }).session(session).lean();
  if (existing) return existing._id;
  const [client, vehicle] = await Promise.all([
    User.findById(booking.client).select('fullName email').session(session).lean(),
    Vehicle.findById(booking.vehicle).select('make model year variant plateNumber').session(session).lean(),
  ]);
  if (!client || !vehicle) throw new HttpError(409, 'Receipt customer or vehicle is unavailable.');
  let serviceItems = booking.estimatedServiceItems;
  if (!serviceItems?.length) {
    const services = await Service.find({ _id: { $in: booking.services } }).select('_id name estimatedPrice').session(session).lean();
    if (services.length !== booking.services.length) throw new HttpError(409, 'Receipt services are unavailable.');
    serviceItems = booking.services.map(serviceId => {
      const item = services.find(value => String(value._id) === String(serviceId));
      return { serviceId, name: item.name, priceCents: Math.round(item.estimatedPrice * 100) };
    });
  }
  if (!Number.isSafeInteger(booking.estimatedTotalCents) || !Number.isSafeInteger(booking.downpaymentRequiredCents)
    || !Number.isSafeInteger(payment.amountCents) || payment.amountCents !== booking.downpaymentRequiredCents)
    throw new HttpError(409, 'Receipt financial snapshot is unavailable.');
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(verifiedAt);
  const counter = await Counter.findOneAndUpdate({ _id: `receipt:${year}` }, { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', session });
  if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new HttpError(503, 'Receipt number is unavailable.');
  const [receipt] = await Receipt.create([{
    receiptNumber: `RCT-${year}-${String(counter.sequence).padStart(6, '0')}`, type: 'downpayment',
    payment: payment._id, booking: booking._id, client: booking.client, issuedAt: verifiedAt,
    bookingSnapshot: { bookingReference: String(booking._id) },
    clientSnapshot: { fullName: client.fullName, email: client.email },
    vehicleSnapshot: { make: vehicle.make, model: vehicle.model, year: vehicle.year,
      variant: vehicle.variant || '', plateNumber: vehicle.plateNumber },
    serviceItems: serviceItems.map(item => ({ serviceId: item.serviceId, name: item.name,
      priceCents: item.priceCents })),
    financialSnapshot: { estimatedTotalCents: booking.estimatedTotalCents,
      downpaymentRequiredCents: booking.downpaymentRequiredCents, amountPaidCents: payment.amountCents,
      estimatedRemainingCents: Math.max(0, booking.estimatedTotalCents - payment.amountCents) },
    paymentSnapshot: { method: payment.method, reference: payment.reference || '', verifiedAt,
      verifiedBy: String(actor._id), verifiedByRole: actor.role },
    document: { status: 'pending' }, emailDelivery: { status: 'pending' },
  }], { session });
  return receipt._id;
}

async function nextNumber(session, at) {
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(at);
  const counter = await Counter.findOneAndUpdate({ _id: `receipt:${year}` }, { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', session });
  if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new HttpError(503, 'Receipt number is unavailable.');
  return `RCT-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

async function createForFinalVerification(session, booking, payment, actor, summary, verifiedAt) {
  if (payment.stage !== 'final' || payment.status !== 'verified' || booking.status !== 'ready_for_release'
    || !Number.isSafeInteger(booking.finalTotalCents) || summary.finalTotalCents !== booking.finalTotalCents)
    throw new HttpError(409, 'Final payment receipt requires a verified locked bill.');
  const verified = summary.payments.filter(item => item.status === 'verified');
  if (!verified.some(item => item.id === String(payment._id))
    || !Number.isSafeInteger(summary.totalPaidCents) || !Number.isSafeInteger(summary.remainingBalanceCents)
    || !Number.isSafeInteger(summary.downpaymentPaidCents) || !Number.isSafeInteger(summary.finalPaidCents)
    || summary.downpaymentPaidCents + summary.finalPaidCents !== summary.totalPaidCents
    || summary.remainingBalanceCents !== Math.max(0, booking.finalTotalCents - summary.totalPaidCents)
    || summary.totalPaidCents > booking.finalTotalCents)
    throw new HttpError(409, 'Verified payment settlement is inconsistent.');
  const [client, vehicle, invoice] = await Promise.all([
    User.findById(booking.client).select('fullName email').session(session).lean(),
    Vehicle.findById(booking.vehicle).select('make model year variant plateNumber').session(session).lean(),
    Invoice.findOne({ booking: booking._id, type: 'final_service' }).session(session).lean(),
  ]);
  if (!client || !vehicle) throw new HttpError(409, 'Receipt customer or vehicle is unavailable.');
  if (invoice && invoice.financialSnapshot.finalServiceTotalCents !== booking.finalTotalCents)
    throw new HttpError(409, 'Locked invoice and booking totals differ.');
  const original = invoice?.financialSnapshot.originalServicesTotalCents
    ?? booking.originalServicesTotalCents ?? booking.estimatedTotalCents ?? booking.finalTotalCents;
  const additional = invoice?.financialSnapshot.additionalWorkTotalCents
    ?? booking.additionalWorkTotalCents ?? booking.finalTotalCents - original;
  if (!Number.isSafeInteger(original) || !Number.isSafeInteger(additional) || original < 0 || additional < 0
    || original + additional !== booking.finalTotalCents)
    throw new HttpError(409, 'Receipt billing snapshot is inconsistent.');
  const base = { payment: payment._id, booking: booking._id, client: booking.client, issuedAt: verifiedAt,
    ...(invoice ? { invoice: invoice._id } : {}),
    bookingSnapshot: { bookingReference: String(booking._id) },
    clientSnapshot: { fullName: client.fullName, email: client.email },
    vehicleSnapshot: { make: vehicle.make, model: vehicle.model, year: vehicle.year,
      variant: vehicle.variant || '', plateNumber: vehicle.plateNumber },
    serviceItems: [], paymentSnapshot: { method: payment.method, reference: payment.reference || '',
      verifiedAt, verifiedBy: String(actor._id), verifiedByRole: actor.role },
    document: { status: 'pending' }, emailDelivery: { status: 'pending' } };
  const settlement = { invoiceNumber: invoice?.invoiceNumber || '', originalServicesTotalCents: original,
    additionalWorkTotalCents: additional, finalServiceTotalCents: booking.finalTotalCents,
    verifiedDownpaymentCents: summary.downpaymentPaidCents,
    verifiedFinalPaymentsCents: summary.finalPaidCents, thisPaymentCents: payment.amountCents,
    totalVerifiedPaymentsCents: summary.totalPaidCents, remainingBalanceCents: summary.remainingBalanceCents,
    payments: verified.map(item => ({ paymentId: item.id, stage: item.stage, amountCents: item.amountCents,
      method: item.method, verifiedAt: item.verifiedAt })) };
  const ids = [];
  let finalReceipt = await Receipt.findOne({ payment: payment._id, type: 'final_payment' }).session(session).lean();
  if (!finalReceipt) {
    [finalReceipt] = await Receipt.create([{ ...base, receiptNumber: await nextNumber(session, verifiedAt),
      type: 'final_payment', settlementSnapshot: settlement,
      financialSnapshot: { amountPaidCents: payment.amountCents },
      ...(summary.remainingBalanceCents === 0 ? { emailDelivery: { status: 'suppressed' } } : {}) }], { session });
  }
  ids.push(finalReceipt._id);
  if (summary.remainingBalanceCents === 0) {
    let fullReceipt = await Receipt.findOne({ booking: booking._id, type: 'full_payment' }).session(session).lean();
    if (!fullReceipt) {
      [fullReceipt] = await Receipt.create([{ ...base, receiptNumber: await nextNumber(session, verifiedAt),
        type: 'full_payment', settlementSnapshot: settlement,
        financialSnapshot: { amountPaidCents: summary.totalPaidCents } }], { session });
    }
    ids.push(fullReceipt._id);
  }
  return ids;
}

const publicReceipt = receipt => ({ id: String(receipt._id), paymentId: String(receipt.payment), receiptNumber: receipt.receiptNumber,
  type: receipt.type, issuedAt: receipt.issuedAt, bookingReference: receipt.bookingSnapshot.bookingReference,
  amountPaidCents: receipt.financialSnapshot.amountPaidCents,
  estimatedRemainingCents: receipt.financialSnapshot.estimatedRemainingCents,
  settlementSnapshot: receipt.settlementSnapshot ? {
    invoiceNumber: receipt.settlementSnapshot.invoiceNumber,
    originalServicesTotalCents: receipt.settlementSnapshot.originalServicesTotalCents,
    additionalWorkTotalCents: receipt.settlementSnapshot.additionalWorkTotalCents,
    finalServiceTotalCents: receipt.settlementSnapshot.finalServiceTotalCents,
    verifiedDownpaymentCents: receipt.settlementSnapshot.verifiedDownpaymentCents,
    verifiedFinalPaymentsCents: receipt.settlementSnapshot.verifiedFinalPaymentsCents,
    thisPaymentCents: receipt.settlementSnapshot.thisPaymentCents,
    totalVerifiedPaymentsCents: receipt.settlementSnapshot.totalVerifiedPaymentsCents,
    remainingBalanceCents: receipt.settlementSnapshot.remainingBalanceCents,
    payments: (receipt.settlementSnapshot.payments || []).map(item => ({ stage: item.stage, amountCents: item.amountCents,
      method: item.method, verifiedAt: item.verifiedAt })),
  } : null,
  method: receipt.paymentSnapshot.method, verifiedAt: receipt.paymentSnapshot.verifiedAt,
  document: { status: receipt.document?.status || 'pending',
    secureUrl: receipt.document?.status === 'generated' ? receipt.document.secureUrl || null : null },
  emailDelivery: { status: receipt.emailDelivery?.status || 'pending', sentAt: receipt.emailDelivery?.sentAt || null,
    lastAttemptAt: receipt.emailDelivery?.lastAttemptAt || null } });

async function list(bookingId, actor) {
  id(bookingId);
  if (!['client', 'staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  const booking = await require('../models/Booking').findById(bookingId).select('client').lean();
  if (!booking || (actor.role === 'client' && String(booking.client) !== String(actor._id)))
    throw new HttpError(404, 'Booking not found.');
  return (await Receipt.find({ booking: bookingId }).sort({ issuedAt: -1, _id: -1 }).lean()).map(publicReceipt);
}
async function get(receiptId, actor) {
  id(receiptId);
  if (!['client', 'staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  const receipt = await Receipt.findById(receiptId).lean();
  if (!receipt || (actor.role === 'client' && String(receipt.client) !== String(actor._id)))
    throw new HttpError(404, 'Receipt not found.');
  return publicReceipt(receipt);
}

async function ensureDocument(receiptId) {
  const receipt = await Receipt.findById(receiptId).lean();
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  if (receipt.document?.status === 'generated' && receipt.document.secureUrl) return receipt;
  const claim = await Receipt.findOneAndUpdate({ _id: receiptId, $or: [
    { 'document.status': { $in: ['pending', 'failed'] } },
    { 'document.status': 'processing', 'document.processingStartedAt': { $lt: stale() } },
  ] }, { $set: { 'document.status': 'processing', 'document.processingStartedAt': new Date() } },
  { returnDocument: 'after' }).lean();
  if (!claim) return Receipt.findById(receiptId).lean();
  try {
    const buffer = await pdf.render(claim);
    const asset = await cloudinary.uploadReceiptPdf(buffer, claim.receiptNumber, claim._id);
    await Receipt.updateOne({ _id: receiptId, 'document.status': 'processing' }, { $set: {
      'document.status': 'generated', 'document.secureUrl': asset.secureUrl, 'document.publicId': asset.publicId,
      'document.bytes': asset.bytes, 'document.generatedAt': new Date(), 'document.lastError': null,
    } });
    return { ...(await Receipt.findById(receiptId).lean()), pdfBuffer: buffer };
  } catch {
    await Receipt.updateOne({ _id: receiptId, 'document.status': 'processing' }, { $set: {
      'document.status': 'failed', 'document.lastErrorAt': new Date(), 'document.lastError': safeError(),
    } });
    return Receipt.findById(receiptId).lean();
  }
}

const redundantFinalEmail = receipt => receipt.type === 'final_payment'
  && receipt.settlementSnapshot?.remainingBalanceCents === 0;
async function sendReceiptEmail(receiptId, pdfBuffer) {
  const receipt = await Receipt.findById(receiptId).lean();
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  if (redundantFinalEmail(receipt) || ['sent', 'suppressed'].includes(receipt.emailDelivery?.status)
    || receipt.document?.status !== 'generated') return receipt;
  // An interrupted SMTP attempt is ambiguous. Only a Staff/Admin retry may restart it.
  const claim = await Receipt.findOneAndUpdate({ _id: receiptId, 'document.status': 'generated',
    'emailDelivery.status': { $in: ['pending', 'failed'] } },
  { $set: { 'emailDelivery.status': 'sending', 'emailDelivery.lastAttemptAt': new Date() } },
  { returnDocument: 'after' }).lean();
  if (!claim) return Receipt.findById(receiptId).lean();
  try {
    // Email retries attach the already-generated PDF, including historical layouts.
    const buffer = pdfBuffer || await cloudinary.downloadGeneratedPdf(claim.document);
    const subject = `Toyota AutoCare - ${claim.type === 'downpayment' ? 'Downpayment' : claim.type === 'full_payment' ? 'Full Payment' : 'Final Payment'} Receipt ${claim.receiptNumber}`;
    const message = claim.type === 'downpayment'
      ? `Your downpayment of ${pdf.money(claim.financialSnapshot.amountPaidCents)} has been verified. Your schedule is officially reserved, and your booking is still awaiting confirmation.\n\nReceipt: ${claim.receiptNumber}\nBooking: ${claim.bookingSnapshot.bookingReference}\nEstimated remaining balance: ${pdf.money(claim.financialSnapshot.estimatedRemainingCents)}\n\nToyota AutoCare`
      : claim.type === 'full_payment'
        ? `Your booking is fully paid and eligible for vehicle release.\n\nBooking: ${claim.bookingSnapshot.bookingReference}\nFull Payment Receipt: ${claim.receiptNumber}\nFinal service total: ${pdf.money(claim.settlementSnapshot.finalServiceTotalCents)}\nVerified downpayment: ${pdf.money(claim.settlementSnapshot.verifiedDownpaymentCents)}\nVerified final payment(s): ${pdf.money(claim.settlementSnapshot.verifiedFinalPaymentsCents)}\nTotal paid: ${pdf.money(claim.settlementSnapshot.totalVerifiedPaymentsCents)}\nRemaining balance: ${pdf.money(0)}\n\nVehicle release remains a separate service center action.\n\nToyota AutoCare`
        : `Your final payment of ${pdf.money(claim.settlementSnapshot.thisPaymentCents)} has been verified.\n\nReceipt: ${claim.receiptNumber}\nBooking: ${claim.bookingSnapshot.bookingReference}\nRemaining balance: ${pdf.money(claim.settlementSnapshot.remainingBalanceCents)}\n\nToyota AutoCare`;
    await email.sendEmail({ to: claim.clientSnapshot.email, subject, text: message,
      attachments: [{ filename: `Toyota-AutoCare-${claim.receiptNumber}.pdf`, content: buffer, contentType: 'application/pdf' }] });
    await Receipt.updateOne({ _id: receiptId, 'emailDelivery.status': 'sending' }, { $set: {
      'emailDelivery.status': 'sent', 'emailDelivery.sentAt': new Date(), 'emailDelivery.lastError': null,
    } });
  } catch {
    await Receipt.updateOne({ _id: receiptId, 'emailDelivery.status': 'sending' }, { $set: {
      'emailDelivery.status': 'failed', 'emailDelivery.lastErrorAt': new Date(), 'emailDelivery.lastError': safeError(),
    } });
  }
  return Receipt.findById(receiptId).lean();
}

async function processAfterVerification(receiptId) {
  try {
    const receipt = await ensureDocument(receiptId);
    if (receipt?.document?.status === 'generated') await sendReceiptEmail(receiptId, receipt.pdfBuffer);
  } catch { /* Payment and reservation have already committed. Recovery uses retry endpoints. */ }
}
async function retryDocument(receiptId, actor) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  id(receiptId);
  await ensureDocument(receiptId);
  return get(receiptId, actor);
}
async function retryEmail(receiptId, actor) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  id(receiptId);
  const receipt = await Receipt.findById(receiptId).lean();
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  if (redundantFinalEmail(receipt) || receipt.emailDelivery?.status === 'suppressed')
    throw new HttpError(409, 'This receipt does not require a separate email.');
  if (receipt.emailDelivery?.status === 'sending') {
    if (!receipt.emailDelivery.lastAttemptAt || new Date(receipt.emailDelivery.lastAttemptAt) >= stale())
      throw new HttpError(409, 'Email delivery is still in progress.');
    await Receipt.updateOne({ _id: receiptId, 'emailDelivery.status': 'sending',
      'emailDelivery.lastAttemptAt': { $lt: stale() } }, { $set: { 'emailDelivery.status': 'failed',
        'emailDelivery.lastErrorAt': new Date(), 'emailDelivery.lastError': 'Previous delivery status is uncertain.' } });
  }
  if (receipt.document?.status !== 'generated') throw new HttpError(409, 'Receipt document is not ready.');
  await sendReceiptEmail(receiptId);
  return get(receiptId, actor);
}

module.exports = { createForVerification, createForFinalVerification, list, get, ensureDocument, sendReceiptEmail,
  processAfterVerification, retryDocument, retryEmail, publicReceipt };
