const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const Counter = require('../models/Counter');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const HttpError = require('../utils/HttpError');
const pdf = require('./invoicePdfService');
const { money } = require('./receiptPdfService');
const cloudinary = require('./cloudinaryService');
const email = require('./emailService');

const stale = () => new Date(Date.now() - 10 * 60 * 1000);
const safeError = () => 'Processing is temporarily unavailable.';
function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid invoice or booking ID.');
  return value;
}
async function createForRelease(session, booking, billing, payment, issuedAt) {
  const existing = await Invoice.findOne({ booking: booking._id, type: 'final_service' }).session(session).lean();
  if (existing) return existing._id;
  const [client, vehicle] = await Promise.all([
    User.findById(booking.client).select('fullName email').session(session).lean(),
    Vehicle.findById(booking.vehicle).select('make model year variant plateNumber').session(session).lean(),
  ]);
  if (!client || !vehicle) throw new HttpError(409, 'Invoice customer or vehicle is unavailable.');
  if (payment.finalTotalCents !== billing.finalTotalCents
    || !Number.isSafeInteger(payment.downpaymentPaidCents)
    || !Number.isSafeInteger(payment.finalPaidCents)
    || !Number.isSafeInteger(payment.remainingBalanceCents)
    || payment.downpaymentPaidCents < 0 || payment.finalPaidCents < 0
    || !Number.isSafeInteger(payment.downpaymentPaidCents + payment.finalPaidCents)
    || payment.remainingBalanceCents !== Math.max(0, billing.finalTotalCents
      - payment.downpaymentPaidCents - payment.finalPaidCents))
    throw new HttpError(409, 'Invoice payment snapshot is invalid.');
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(issuedAt);
  const counter = await Counter.findOneAndUpdate({ _id: `invoice:${year}` }, { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', session });
  if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new HttpError(503, 'Invoice number is unavailable.');
  const [invoice] = await Invoice.create([{
    invoiceNumber: `INV-${year}-${String(counter.sequence).padStart(6, '0')}`,
    type: 'final_service', booking: booking._id, client: booking.client, issuedAt,
    bookingSnapshot: { bookingReference: String(booking._id) },
    clientSnapshot: { fullName: client.fullName, email: client.email },
    vehicleSnapshot: { make: vehicle.make, model: vehicle.model, year: vehicle.year,
      variant: vehicle.variant || '', plateNumber: vehicle.plateNumber },
    originalServiceItems: billing.originalServiceItems,
    additionalWorkItems: billing.additionalWorkItems,
    financialSnapshot: { originalServicesTotalCents: billing.originalServicesTotalCents,
      additionalWorkTotalCents: billing.additionalWorkTotalCents, finalServiceTotalCents: billing.finalTotalCents,
      verifiedDownpaymentCents: payment.downpaymentPaidCents,
      otherVerifiedPaymentsCents: payment.finalPaidCents, amountDueCents: payment.remainingBalanceCents },
    document: { status: 'pending' }, emailDelivery: { status: 'pending' },
  }], { session });
  return invoice._id;
}
const publicInvoice = invoice => ({ id: String(invoice._id), invoiceNumber: invoice.invoiceNumber,
  type: invoice.type, issuedAt: invoice.issuedAt, bookingReference: invoice.bookingSnapshot.bookingReference,
  originalServiceItems: invoice.originalServiceItems.map(item => ({ name: item.name, priceCents: item.priceCents })),
  additionalWorkItems: invoice.additionalWorkItems.map(item => ({ kind: item.kind, name: item.name,
    description: item.description, quantity: item.quantity, unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.lineTotalCents })),
  financialSnapshot: invoice.financialSnapshot,
  document: { status: invoice.document?.status || 'pending',
    secureUrl: invoice.document?.status === 'generated' ? invoice.document.secureUrl || null : null },
  emailDelivery: { status: invoice.emailDelivery?.status || 'pending',
    sentAt: invoice.emailDelivery?.sentAt || null, lastAttemptAt: invoice.emailDelivery?.lastAttemptAt || null } });
async function list(bookingId, actor) {
  id(bookingId);
  if (!['client', 'staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  const booking = await Booking.findById(bookingId).select('client').lean();
  if (!booking || (actor.role === 'client' && String(booking.client) !== String(actor._id)))
    throw new HttpError(404, 'Booking not found.');
  return (await Invoice.find({ booking: bookingId, type: 'final_service' }).sort({ issuedAt: -1 }).lean()).map(publicInvoice);
}
async function get(invoiceId, actor) {
  id(invoiceId);
  if (!['client', 'staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice || (actor.role === 'client' && String(invoice.client) !== String(actor._id)))
    throw new HttpError(404, 'Invoice not found.');
  return publicInvoice(invoice);
}
async function ensureDocument(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.document?.status === 'generated' && invoice.document.secureUrl) return invoice;
  const claim = await Invoice.findOneAndUpdate({ _id: invoiceId, $or: [
    { 'document.status': { $in: ['pending', 'failed'] } },
    { 'document.status': 'processing', 'document.processingStartedAt': { $lt: stale() } },
  ] }, { $set: { 'document.status': 'processing', 'document.processingStartedAt': new Date() } },
  { returnDocument: 'after' }).lean();
  if (!claim) return Invoice.findById(invoiceId).lean();
  try {
    const buffer = await pdf.render(claim);
    const asset = await cloudinary.uploadInvoicePdf(buffer, claim.invoiceNumber, claim._id);
    await Invoice.updateOne({ _id: invoiceId, 'document.status': 'processing' }, { $set: {
      'document.status': 'generated', 'document.secureUrl': asset.secureUrl, 'document.publicId': asset.publicId,
      'document.bytes': asset.bytes, 'document.generatedAt': new Date(), 'document.lastError': null,
    } });
    return { ...(await Invoice.findById(invoiceId).lean()), pdfBuffer: buffer };
  } catch {
    await Invoice.updateOne({ _id: invoiceId, 'document.status': 'processing' }, { $set: {
      'document.status': 'failed', 'document.lastErrorAt': new Date(), 'document.lastError': safeError(),
    } });
    return Invoice.findById(invoiceId).lean();
  }
}
async function sendInvoiceEmail(invoiceId, pdfBuffer) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.emailDelivery?.status === 'sent' || invoice.document?.status !== 'generated') return invoice;
  const claim = await Invoice.findOneAndUpdate({ _id: invoiceId, 'document.status': 'generated',
    'emailDelivery.status': { $in: ['pending', 'failed'] } },
  { $set: { 'emailDelivery.status': 'sending', 'emailDelivery.lastAttemptAt': new Date() } },
  { returnDocument: 'after' }).lean();
  if (!claim) return Invoice.findById(invoiceId).lean();
  try {
    // Email retries attach the already-generated PDF, including historical layouts.
    const buffer = pdfBuffer || await cloudinary.downloadGeneratedPdf(claim.document);
    const financial = claim.financialSnapshot;
    await email.sendEmail({ to: claim.clientSnapshot.email,
      subject: `Toyota AutoCare - Final Service Invoice ${claim.invoiceNumber}`,
      text: `Your service work is at the ready-for-release stage.\n\nInvoice: ${claim.invoiceNumber}\nBooking: ${claim.bookingSnapshot.bookingReference}\nFinal service total: ${money(financial.finalServiceTotalCents)}\nVerified payments: ${money(financial.verifiedDownpaymentCents + financial.otherVerifiedPaymentsCents)}\nAmount due at invoice issuance: ${money(financial.amountDueCents)}\n\nPayment is required before vehicle release. Please view your booking for the current remaining balance.\n\nToyota AutoCare`,
      attachments: [{ filename: `Toyota-AutoCare-${claim.invoiceNumber}.pdf`, content: buffer,
        contentType: 'application/pdf' }] });
    await Invoice.updateOne({ _id: invoiceId, 'emailDelivery.status': 'sending' }, { $set: {
      'emailDelivery.status': 'sent', 'emailDelivery.sentAt': new Date(), 'emailDelivery.lastError': null,
    } });
  } catch {
    await Invoice.updateOne({ _id: invoiceId, 'emailDelivery.status': 'sending' }, { $set: {
      'emailDelivery.status': 'failed', 'emailDelivery.lastErrorAt': new Date(), 'emailDelivery.lastError': safeError(),
    } });
  }
  return Invoice.findById(invoiceId).lean();
}
async function processAfterRelease(invoiceId) {
  try {
    const invoice = await ensureDocument(invoiceId);
    if (invoice?.document?.status === 'generated') await sendInvoiceEmail(invoiceId, invoice.pdfBuffer);
  } catch { /* The billing transaction has committed. Staff/Admin can retry. */ }
}
async function retryDocument(invoiceId, actor) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  id(invoiceId);
  await ensureDocument(invoiceId);
  return get(invoiceId, actor);
}
async function retryEmail(invoiceId, actor) {
  if (!['staff', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  id(invoiceId);
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.emailDelivery?.status === 'sending') {
    if (!invoice.emailDelivery.lastAttemptAt || new Date(invoice.emailDelivery.lastAttemptAt) >= stale())
      throw new HttpError(409, 'Email delivery is still in progress.');
    await Invoice.updateOne({ _id: invoiceId, 'emailDelivery.status': 'sending',
      'emailDelivery.lastAttemptAt': { $lt: stale() } }, { $set: { 'emailDelivery.status': 'failed',
        'emailDelivery.lastErrorAt': new Date(), 'emailDelivery.lastError': 'Previous delivery status is uncertain.' } });
  }
  if (invoice.document?.status !== 'generated') throw new HttpError(409, 'Invoice document is not ready.');
  await sendInvoiceEmail(invoiceId);
  return get(invoiceId, actor);
}
module.exports = { createForRelease, list, get, ensureDocument, sendInvoiceEmail,
  processAfterRelease, retryDocument, retryEmail };
