const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const express = require('express');
const { cloudinary, ensureConfigured } = require('../config/cloudinary');
const { uploadImage, deleteAsset, uploadReceiptPdf } = require('../services/cloudinaryService');
const { uploadProof, MAX_IMAGE_BYTES } = require('../middleware/imageUpload');
const errorHandler = require('../middleware/errorHandler');

const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const values = ['test-cloud', 'test-key', 'test-secret-never-expose'];

function withConfiguration(run) {
  const previous = names.map(name => process.env[name]);
  names.forEach((name, index) => { process.env[name] = values[index]; });
  return Promise.resolve().then(run).finally(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
}

test('Cloudinary rejects each missing setting without revealing credentials', async () => {
  await withConfiguration(() => {
    for (const name of names) {
      const value = process.env[name];
      delete process.env[name];
      assert.throws(ensureConfigured, error => error.status === 503
        && !error.message.includes(values[1]) && !error.message.includes(values[2]));
      process.env[name] = value;
    }
    assert.equal(ensureConfigured(), cloudinary);
  });
});

test('upload types use server folders and return only normalized image fields', async () => {
  await withConfiguration(async () => {
    const original = cloudinary.uploader.upload_stream;
    const calls = [];
    cloudinary.uploader.upload_stream = (options, callback) => {
      calls.push(options);
      const stream = new PassThrough();
      stream.on('data', () => {});
      stream.on('end', () => callback(null, { secure_url: 'https://example.invalid/image', public_id: 'toyota-autocare/example',
        width: 10, height: 20, format: 'png', bytes: 3, api_key: values[1] }));
      return stream;
    };
    try {
      for (const type of ['downpayment', 'final-payment', 'additional-service-evidence', 'receipt']) {
        assert.deepEqual(await uploadImage(Buffer.from('img'), type), { secureUrl: 'https://example.invalid/image',
          publicId: 'toyota-autocare/example', width: 10, height: 20, format: 'png', bytes: 3 });
      }
      assert.deepEqual(calls.map(call => call.folder), [
        'toyota-autocare/payments/downpayments', 'toyota-autocare/payments/final-payments',
        'toyota-autocare/additional-service-evidence', 'toyota-autocare/receipts',
      ]);
      assert(calls.every(call => call.resource_type === 'image'));
      assert.throws(() => uploadImage('not a buffer', 'receipt'), { status: 400 });
      assert.throws(() => uploadImage(Buffer.from('img'), 'other'), { status: 400 });
    } finally { cloudinary.uploader.upload_stream = original; }
  });
});

test('Cloudinary upload and deletion errors are sanitized; deletion targets one ID', async () => {
  await withConfiguration(async () => {
    const originalUpload = cloudinary.uploader.upload_stream;
    const originalDestroy = cloudinary.uploader.destroy;
    cloudinary.uploader.upload_stream = (options, callback) => {
      const stream = new PassThrough();
      stream.on('data', () => {});
      stream.on('end', () => callback(new Error(values[2])));
      return stream;
    };
    try {
      await assert.rejects(uploadImage(Buffer.from('img'), 'receipt'), error => error.status === 503
        && !error.message.includes(values[2]));
      for (const id of ['', '  ', 'folder/*', 'folder/', null]) {
        await assert.rejects(deleteAsset(id), { status: 400 });
      }
      let requested;
      cloudinary.uploader.destroy = async (id, options) => {
        requested = { id, options };
        return { result: 'ok' };
      };
      assert.equal(await deleteAsset('toyota-autocare/receipts/example'), true);
      assert.deepEqual(requested, { id: 'toyota-autocare/receipts/example', options: { resource_type: 'image' } });
      cloudinary.uploader.destroy = async () => { throw new Error(values[2]); };
      await assert.rejects(deleteAsset('example'), error => error.status === 503
        && !error.message.includes(values[2]));
    } finally {
      cloudinary.uploader.upload_stream = originalUpload;
      cloudinary.uploader.destroy = originalDestroy;
    }
  });
});

test('receipt PDF upload uses the controlled raw folder and unguessable ID', async () => {
  await withConfiguration(async () => {
    const original = cloudinary.uploader.upload_stream;
    let options;
    cloudinary.uploader.upload_stream = (request, callback) => {
      options = request;
      const stream = new PassThrough();
      stream.on('data', () => {});
      stream.on('end', () => callback(null, { secure_url: 'https://example.invalid/receipt.pdf',
        public_id: 'toyota-autocare/receipts/receipt', bytes: 12, api_key: values[1] }));
      return stream;
    };
    try {
      const receiptId = '507f1f77bcf86cd799439011';
      const result = await uploadReceiptPdf(Buffer.from('%PDF-fixture'), 'RCT-2026-000001', receiptId);
      assert.deepEqual(result, { secureUrl: 'https://example.invalid/receipt.pdf',
        publicId: 'toyota-autocare/receipts/receipt', bytes: 12 });
      assert.equal(options.folder, 'toyota-autocare/receipts');
      assert.equal(options.resource_type, 'raw');
      assert.equal(options.public_id, `RCT-2026-000001-${receiptId}.pdf`);
      assert.throws(() => uploadReceiptPdf(Buffer.from('not-pdf'), 'RCT-2026-000001', receiptId), { status: 400 });
    } finally { cloudinary.uploader.upload_stream = original; }
  });
});

test('memory upload accepts JPEG, PNG, WebP and rejects unsupported types and oversized images', async () => {
  assert.equal(MAX_IMAGE_BYTES, 8 * 1024 * 1024);
  const app = express();
  app.post('/upload', uploadProof, (req, res) => res.json({ accepted: Buffer.isBuffer(req.file?.buffer) }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function send(type, size = 3) {
      const body = new FormData();
      body.append('proof', new Blob([Buffer.alloc(size)], { type }), 'proof.bin');
      const response = await fetch(`${origin}/upload`, { method: 'POST', body });
      return { status: response.status, body: await response.json() };
    }
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.deepEqual(await send(type), { status: 200, body: { accepted: true } });
    }
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'application/zip',
      'application/octet-stream', 'text/plain']) {
      const response = await send(type);
      assert.equal(response.status, 400);
      assert.equal(response.body.message, 'Only JPEG, PNG, and WebP images are allowed.');
    }
    const oversized = await send('image/png', MAX_IMAGE_BYTES + 1);
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.message, 'Image must be 8 MB or smaller.');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
