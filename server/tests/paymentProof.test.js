const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const User = require('../models/User');
const payments = require('../services/paymentService');
const cloudinaryService = require('../services/cloudinaryService');
const engagement = require('../services/engagementService');
const holds = require('../services/bookingHoldService');
const originalReleaseExpired = holds.releaseExpired;
before(() => { holds.releaseExpired = async () => {}; });
after(() => { holds.releaseExpired = originalReleaseExpired; });

const id = () => String(new mongoose.Types.ObjectId());
const bookingId = id(); const clientId = id(); const adminId = id();
const client = { _id: clientId, role: 'client' };
const image = { secureUrl: 'https://example.invalid/proof.png', publicId: 'toyota-autocare/payments/final-payments/proof',
  width: 12, height: 16, format: 'png', bytes: 20 };
const file = { buffer: Buffer.from('image'), mimetype: 'image/png' };

test('Payment stores structured proof metadata and keeps legacy text optional', async () => {
  const base = { booking: bookingId, client: clientId, stage: 'final', amountCents: 100,
    method: 'gcash', submittedBy: clientId };
  await new Payment({ ...base, proofImage: image }).validate();
  await new Payment({ ...base, proof: 'legacy reference' }).validate();
  await assert.rejects(new Payment({ ...base, proofImage: { ...image, secureUrl: 'http://insecure.invalid' } }).validate());
  await assert.rejects(new Payment({ ...base, proofImage: { ...image, bytes: -1 } }).validate());
});

function setup(t, { bookingStatus = 'ready_for_release', total = 100000 } = {}) {
  const records = [];
  const calls = { uploads: [], deleted: [], created: 0 };
  t.mock.method(mongoose.connection, 'transaction', callback => callback({}));
  t.mock.method(Booking, 'findById', () => ({ select: () => {
    const query = { lean: async () => ({ _id: bookingId, client: clientId, services: [id()],
      status: bookingStatus, finalTotalCents: total }) };
    query.session = () => query; return query;
  } }));
  t.mock.method(Payment, 'find', () => ({ sort: () => {
    const query = { lean: async () => records }; query.session = () => query; return query;
  } }));
  t.mock.method(Payment, 'create', async documents => {
    calls.created++;
    const record = { _id: id(), ...documents[0], createdAt: new Date() };
    records.push(record);
    return [record];
  });
  t.mock.method(Booking, 'updateOne', async () => ({ modifiedCount: 1 }));
  t.mock.method(User, 'find', () => ({ select: () => ({ session: () => ({ lean: async () => [] }) }) }));
  t.mock.method(engagement, 'recordNotification', async () => {});
  t.mock.method(cloudinaryService, 'uploadImage', async (_buffer, type) => {
    calls.uploads.push(type); return image;
  });
  t.mock.method(cloudinaryService, 'deleteAsset', async publicId => { calls.deleted.push(publicId); return true; });
  return { records, calls };
}

test('digital methods require a proof; cash can submit without one', async t => {
  const { records, calls } = setup(t);
  for (const method of ['gcash', 'maya', 'bank_transfer']) {
    await assert.rejects(payments.submit(bookingId, client, { stage: 'final', amount: 1000, method }), { status: 400 });
  }
  assert.equal(calls.created, 0);
  await payments.submit(bookingId, client, { stage: 'final', amount: 1000, method: 'cash' });
  assert.equal(records[0].proofImage, undefined);
  assert.equal(records[0].proof, undefined);
  assert.equal(calls.uploads.length, 0);
});

test('no-charge payment can submit without proof when the balance is zero', async t => {
  const { records, calls } = setup(t, { total: 0 });
  await payments.submit(bookingId, client, { stage: 'final', amount: 0, method: 'no_charge' });
  assert.equal(records[0].status, 'submitted');
  assert.equal(records[0].proofImage, undefined);
  assert.equal(calls.uploads.length, 0);
});

test('digital uploads use stage-controlled folders and expose safe summary metadata', async t => {
  const { records, calls } = setup(t, { bookingStatus: 'confirmed' });
  const down = await payments.submit(bookingId, client, { stage: 'downpayment', amount: '100.00', method: 'gcash' }, file);
  assert.deepEqual(calls.uploads, ['downpayment']);
  assert.deepEqual(records[0].proofImage, image);
  assert.equal(records[0].proof, undefined);
  assert.deepEqual(down.payments[0].proofImage, { secureUrl: image.secureUrl, width: image.width,
    height: image.height, format: image.format });
  assert.equal(down.payments[0].proofImage.publicId, undefined);
  assert.equal(records[0].status, 'submitted');
  records[0].status = 'rejected';
  await payments.submit(bookingId, client, { stage: 'downpayment', amount: 100, method: 'maya' }, file);
  assert.equal(records[0].proofImage.publicId, image.publicId); // Rejected evidence is retained.
  assert.deepEqual(calls.uploads, ['downpayment', 'downpayment']);
});

test('final stage selects final-payment; forged proof and verification fields are rejected', async t => {
  const { calls } = setup(t);
  for (const forged of [{ proofImage: { secureUrl: 'https://attacker.invalid', publicId: 'fake' } },
    { proof: 'https://attacker.invalid' }, { status: 'verified' }, { verifiedBy: id() }, { verifiedAt: new Date() },
    { folder: 'elsewhere' }]) {
    await assert.rejects(payments.submit(bookingId, client,
      { stage: 'final', amount: 100, method: 'gcash', ...forged }, file), { status: 400 });
  }
  assert.equal(calls.uploads.length, 0);
  await payments.submit(bookingId, client, { stage: 'final', amount: 100, method: 'bank_transfer' }, file);
  assert.deepEqual(calls.uploads, ['final-payment']);
});

test('invalid amounts and amounts above the due balance never upload a proof', async t => {
  const { calls } = setup(t);
  for (const amount of ['1e3', '-1', '1.234', 2000]) {
    await assert.rejects(payments.submit(bookingId, client,
      { stage: 'final', amount, method: 'gcash' }, file), { status: amount === 2000 ? 409 : 400 });
  }
  assert.equal(calls.uploads.length, 0);
});

test('Cloudinary failure leaves no Payment; database failure cleans up uploaded proof', async t => {
  const { calls } = setup(t);
  cloudinaryService.uploadImage.mock.mockImplementation(async () => { throw new Error('test-secret-never-expose'); });
  await assert.rejects(payments.submit(bookingId, client, { stage: 'final', amount: 100, method: 'gcash' }, file),
    /test-secret-never-expose/);
  assert.equal(calls.created, 0);
  cloudinaryService.uploadImage.mock.mockImplementation(async () => image);
  Payment.create.mock.mockImplementation(async () => { throw new Error('Database write failed'); });
  await assert.rejects(payments.submit(bookingId, client, { stage: 'final', amount: 100, method: 'gcash' }, file),
    /Database write failed/);
  assert.deepEqual(calls.deleted, [image.publicId]);
  cloudinaryService.deleteAsset.mock.mockImplementation(async () => { throw new Error('Cleanup failed'); });
  await assert.rejects(payments.submit(bookingId, client, { stage: 'final', amount: 100, method: 'gcash' }, file),
    /Database write failed/);
});

test('a competing submitted payment after upload triggers proof cleanup', async t => {
  const { calls } = setup(t);
  let reads = 0;
  Payment.find.mock.mockImplementation(() => ({ sort: () => {
    const query = { lean: async () => ++reads === 1 ? [] : [{ stage: 'final', status: 'submitted', amountCents: 100 }] };
    query.session = () => query; return query;
  } }));
  await assert.rejects(payments.submit(bookingId, client, { stage: 'final', amount: 100, method: 'gcash' }, file),
    { status: 409 });
  assert.equal(calls.created, 0);
  assert.deepEqual(calls.deleted, [image.publicId]);
});

test('legacy proof serializes safely; Admin can verify proof and Client cannot', async t => {
  const { records } = setup(t);
  const paymentId = id();
  const record = { _id: paymentId, booking: bookingId, client: clientId, stage: 'final', amountCents: 100000,
    status: 'submitted', method: 'gcash', proofImage: image, createdAt: new Date() };
  records.push(record);
  t.mock.method(Payment, 'findOne', () => ({ session: () => ({ lean: async () => record.status === 'submitted' ? record : null }) }));
  t.mock.method(Payment, 'updateOne', async (_filter, update) => { Object.assign(record, update.$set); return { modifiedCount: 1 }; });
  await assert.rejects(payments.decide(bookingId, paymentId, client, 'verify'), { status: 403 });
  const result = await payments.decide(bookingId, paymentId, { _id: adminId, role: 'admin' }, 'verify');
  assert.equal(record.status, 'verified');
  assert.equal(record.verifiedByRole, 'admin');
  assert.equal(result.payments[0].proofImage.secureUrl, image.secureUrl);
  records.push({ _id: id(), booking: bookingId, stage: 'downpayment', amountCents: 100,
    status: 'rejected', proof: 'old reference', createdAt: new Date() });
  const legacy = await payments.summary(bookingId, client);
  assert.equal(legacy.payments[1].proof, 'old reference');
  assert.equal(legacy.payments[1].proofImage, null);
});
