const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Receipt = require('../models/Receipt');
const Counter = require('../models/Counter');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const cloudinary = require('../services/cloudinaryService');
const email = require('../services/emailService');
const pdf = require('../services/receiptPdfService');
const service = require('../services/receiptService');

const objectId = () => new mongoose.Types.ObjectId();
const query = value => ({ select() { return this; }, session() { return this; }, lean: async () => value });
const booking = () => ({ _id: objectId(), client: objectId(), vehicle: objectId(), services: [objectId()],
  estimatedServiceItems: [{ serviceId: objectId(), name: 'Original Service', priceCents: 100000 }],
  estimatedTotalCents: 100000, downpaymentRequiredCents: 50000,
  status: 'awaiting_downpayment', holdStatus: 'payment_submitted' });
const payment = () => ({ _id: objectId(), stage: 'downpayment', status: 'verified', amountCents: 50000,
  method: 'gcash', reference: 'G123' });

test('Receipt enforces unique payment/type and number with immutable business fields', () => {
  const indexes = Receipt.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.payment === 1 && keys.type === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.receiptNumber === 1 && options.unique));
  for (const field of ['receiptNumber', 'bookingSnapshot', 'clientSnapshot', 'vehicleSnapshot',
    'serviceItems', 'financialSnapshot', 'paymentSnapshot']) assert.equal(Receipt.schema.path(field).options.immutable, true);
});

test('verified downpayment creates one numbered authoritative snapshot and reuses existing receipt', async t => {
  const b = booking(); const p = payment(); const actor = { _id: objectId(), role: 'staff' };
  const now = new Date('2026-10-15T01:00:00Z');
  let stored; const sequences = new Map();
  t.mock.method(Receipt, 'findOne', () => query(stored));
  t.mock.method(User, 'findById', () => query({ fullName: 'Original Client', email: 'client@example.invalid' }));
  t.mock.method(Vehicle, 'findById', () => query({ make: 'Toyota', model: 'Vios', year: 2024,
    variant: 'G', plateNumber: 'ABC1234' }));
  t.mock.method(Counter, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(update, { $inc: { sequence: 1 } });
    assert.equal(options.session, 'session');
    const next = (sequences.get(filter._id) || 0) + 1;
    sequences.set(filter._id, next);
    return { sequence: next };
  });
  t.mock.method(Receipt, 'create', async ([record], options) => {
    assert.equal(options.session, 'session');
    stored = { ...record, _id: objectId() };
    return [stored];
  });
  const result = await service.createForVerification('session', b, p, actor, now);
  assert.equal(String(result), String(stored._id));
  assert.equal(stored.receiptNumber, 'RCT-2026-000001');
  assert.equal(String(stored.payment), String(p._id));
  assert.equal(String(stored.booking), String(b._id));
  assert.equal(String(stored.client), String(b.client));
  assert.equal(stored.clientSnapshot.fullName, 'Original Client');
  assert.equal(stored.vehicleSnapshot.plateNumber, 'ABC1234');
  assert.equal(stored.serviceItems[0].name, 'Original Service');
  assert.equal(stored.serviceItems[0].priceCents, 100000);
  assert.equal(stored.financialSnapshot.amountPaidCents, 50000);
  assert.equal(stored.financialSnapshot.estimatedRemainingCents, 50000);
  assert.equal(stored.document.status, 'pending');
  await service.createForVerification('session', b, p, actor, now);
  assert.equal(sequences.get('receipt:2026'), 1);
  b.estimatedServiceItems[0].name = 'Changed Service';
  b.estimatedServiceItems[0].priceCents = 999999;
  assert.equal(stored.serviceItems[0].name, 'Original Service');
  stored = null;
  await service.createForVerification('session', b, { ...p, _id: objectId() }, actor,
    new Date('2026-12-31T16:00:00Z'));
  assert.equal(stored.receiptNumber, 'RCT-2027-000001');
  assert.equal(sequences.get('receipt:2027'), 1);
});

test('unverified and final payments cannot create downpayment receipts', async () => {
  const b = booking(); const p = payment();
  for (const [stage, status] of [['downpayment', 'submitted'], ['downpayment', 'rejected'], ['final', 'verified']]) {
    await assert.rejects(service.createForVerification(null, b, { ...p, stage, status },
      { _id: objectId(), role: 'staff' }, new Date()), { status: 409 });
  }
});

test('PDF renders entirely from the stored receipt snapshot', async () => {
  const receipt = { receiptNumber: 'RCT-2026-000001', issuedAt: new Date(),
    bookingSnapshot: { bookingReference: 'booking-reference' },
    clientSnapshot: { fullName: 'Original Client', email: 'client@example.invalid' },
    vehicleSnapshot: { year: 2024, make: 'Toyota', model: 'Vios', variant: 'G', plateNumber: 'ABC1234' },
    serviceItems: [{ name: 'Original Service', priceCents: 100000 }],
    financialSnapshot: { estimatedTotalCents: 100000, amountPaidCents: 50000, estimatedRemainingCents: 50000 },
    paymentSnapshot: { method: 'gcash', reference: 'G123', verifiedAt: new Date(), verifiedByRole: 'staff' } };
  const buffer = await pdf.render(receipt);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 1000);
});

test('document failure stays retryable; successful upload stores metadata without PDF bytes', async t => {
  const receiptId = objectId();
  const record = { _id: receiptId, receiptNumber: 'RCT-2026-000001',
    document: { status: 'pending' }, emailDelivery: { status: 'pending' } };
  t.mock.method(Receipt, 'findById', () => query({ ...record, document: { ...record.document } }));
  t.mock.method(Receipt, 'findOneAndUpdate', (_filter, update) => {
    record.document.status = update.$set['document.status'];
    return query({ ...record, document: { ...record.document } });
  });
  t.mock.method(Receipt, 'updateOne', async (_filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) record[key.split('.')[0]][key.split('.')[1]] = value;
  });
  t.mock.method(pdf, 'render', async () => Buffer.from('%PDF-fixture'));
  t.mock.method(cloudinary, 'uploadReceiptPdf', async () => { throw new Error('private Cloudinary failure'); });
  await service.ensureDocument(receiptId);
  assert.equal(record.document.status, 'failed');
  assert.equal(record.document.lastError, 'Processing is temporarily unavailable.');
  assert.equal(record.emailDelivery.status, 'pending');
  cloudinary.uploadReceiptPdf.mock.mockImplementation(async (_buffer, number, id) => {
    assert.equal(number, record.receiptNumber); assert.equal(String(id), String(receiptId));
    return { secureUrl: 'https://example.invalid/receipt.pdf', publicId: 'stored', bytes: 12 };
  });
  await service.ensureDocument(receiptId);
  assert.equal(record.document.status, 'generated');
  assert.equal(record.document.secureUrl, 'https://example.invalid/receipt.pdf');
  assert.equal(record.document.buffer, undefined);
  assert.equal(record.document.lastError, null);
});

test('email failure is sanitized and retry sends once with PDF attachment and awaiting-confirmation copy', async t => {
  const receiptId = objectId();
  const record = { _id: receiptId, receiptNumber: 'RCT-2026-000001',
    bookingSnapshot: { bookingReference: 'booking-reference' },
    clientSnapshot: { email: 'client@example.invalid' },
    financialSnapshot: { amountPaidCents: 50000, estimatedRemainingCents: 50000 },
    document: { status: 'generated' }, emailDelivery: { status: 'pending' } };
  t.mock.method(Receipt, 'findById', () => query({ ...record, emailDelivery: { ...record.emailDelivery } }));
  t.mock.method(Receipt, 'findOneAndUpdate', () => {
    record.emailDelivery.status = 'sending'; return query({ ...record, emailDelivery: { ...record.emailDelivery } });
  });
  t.mock.method(Receipt, 'updateOne', async (_filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) record[key.split('.')[0]][key.split('.')[1]] = value;
  });
  t.mock.method(email, 'sendEmail', async () => { throw new Error('secret SMTP failure'); });
  await service.sendReceiptEmail(receiptId, Buffer.from('%PDF-fixture'));
  assert.equal(record.emailDelivery.status, 'failed');
  assert.equal(record.emailDelivery.lastError, 'Processing is temporarily unavailable.');
  let sent;
  email.sendEmail.mock.mockImplementation(async payload => { sent = payload; });
  await service.sendReceiptEmail(receiptId, Buffer.from('%PDF-fixture'));
  assert.equal(record.emailDelivery.status, 'sent');
  assert.match(sent.text, /still awaiting confirmation/);
  assert.doesNotMatch(sent.text, /booking confirmed/i);
  assert.equal(sent.attachments[0].contentType, 'application/pdf');
  await service.sendReceiptEmail(receiptId);
  assert.equal(email.sendEmail.mock.callCount(), 2);
});

test('Client cannot view another client receipt; Mechanic cannot access; retry requires Staff/Admin', async t => {
  const receiptId = objectId(); const owner = objectId();
  t.mock.method(Receipt, 'findById', () => query({ _id: receiptId, client: owner,
    bookingSnapshot: { bookingReference: 'booking' }, financialSnapshot: { amountPaidCents: 1,
      estimatedRemainingCents: 2 }, paymentSnapshot: { method: 'gcash', verifiedAt: new Date() },
    document: { status: 'failed' }, emailDelivery: { status: 'pending' } }));
  await assert.rejects(service.get(receiptId, { _id: objectId(), role: 'client' }), { status: 404 });
  await assert.rejects(service.get(receiptId, { _id: owner, role: 'mechanic' }), { status: 403 });
  await assert.rejects(service.retryDocument(receiptId, { _id: owner, role: 'client' }), { status: 403 });
  assert.equal((await service.get(receiptId, { _id: owner, role: 'client' })).bookingReference, 'booking');
});

test('interrupted email needs a stale lease and explicit Staff retry', async t => {
  const receiptId = objectId();
  const record = { _id: receiptId, payment: objectId(), client: objectId(), receiptNumber: 'RCT-2026-000001',
    bookingSnapshot: { bookingReference: 'booking' }, clientSnapshot: { email: 'client@example.invalid' },
    financialSnapshot: { amountPaidCents: 50000, estimatedRemainingCents: 50000 },
    paymentSnapshot: { method: 'gcash', verifiedAt: new Date() }, document: { status: 'generated' },
    emailDelivery: { status: 'sending', lastAttemptAt: new Date() } };
  t.mock.method(Receipt, 'findById', () => query(record));
  t.mock.method(Receipt, 'updateOne', async (_filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) record[key.split('.')[0]][key.split('.')[1]] = value;
  });
  t.mock.method(Receipt, 'findOneAndUpdate', (_filter, update) => {
    record.emailDelivery.status = update.$set['emailDelivery.status'];
    return query(record);
  });
  t.mock.method(pdf, 'render', async () => Buffer.from('%PDF-fixture'));
  t.mock.method(email, 'sendEmail', async () => {});
  const staff = { _id: objectId(), role: 'staff' };
  await assert.rejects(service.retryEmail(receiptId, staff), { status: 409 });
  record.emailDelivery.lastAttemptAt = new Date(Date.now() - 11 * 60 * 1000);
  const result = await service.retryEmail(receiptId, staff);
  assert.equal(result.emailDelivery.status, 'sent');
  assert.equal(email.sendEmail.mock.callCount(), 1);
});
