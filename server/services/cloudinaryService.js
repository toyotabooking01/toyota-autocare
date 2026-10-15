const { cloudinary, ensureConfigured } = require('../config/cloudinary');
const HttpError = require('../utils/HttpError');

const folders = Object.freeze({
  downpayment: 'toyota-autocare/payments/downpayments',
  'final-payment': 'toyota-autocare/payments/final-payments',
  'additional-service-evidence': 'toyota-autocare/additional-service-evidence',
  receipt: 'toyota-autocare/receipts',
  invoice: 'toyota-autocare/invoices',
});

function uploadImage(buffer, uploadType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, 'A valid image is required.');
  if (!Object.hasOwn(folders, uploadType)) throw new HttpError(400, 'Invalid image upload type.');
  ensureConfigured();
  return new Promise((resolve, reject) => {
    try {
      const stream = cloudinary.uploader.upload_stream({ folder: folders[uploadType], resource_type: 'image' },
        (error, result) => {
          if (error || !result?.secure_url || !result?.public_id) {
            reject(new HttpError(503, 'Image storage is temporarily unavailable.'));
            return;
          }
          resolve({ secureUrl: result.secure_url, publicId: result.public_id,
            width: result.width, height: result.height, format: result.format, bytes: result.bytes });
        });
      stream.on('error', () => reject(new HttpError(503, 'Image storage is temporarily unavailable.')));
      stream.end(buffer);
    } catch {
      reject(new HttpError(503, 'Image storage is temporarily unavailable.'));
    }
  });
}

async function deleteAsset(publicId) {
  if (typeof publicId !== 'string' || !publicId.trim() || publicId !== publicId.trim()
    || /[\r\n*?]/.test(publicId) || publicId.endsWith('/')) {
    throw new HttpError(400, 'Invalid image asset ID.');
  }
  ensureConfigured();
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return result?.result === 'ok';
  } catch {
    throw new HttpError(503, 'Image storage is temporarily unavailable.');
  }
}

function uploadReceiptPdf(buffer, receiptNumber, receiptId) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString() !== '%PDF-'
    || !/^RCT-\d{4}-\d{6,}$/.test(receiptNumber) || !/^[a-f\d]{24}$/.test(String(receiptId)))
    throw new HttpError(400, 'Invalid receipt document.');
  ensureConfigured();
  return new Promise((resolve, reject) => {
    try {
      const stream = cloudinary.uploader.upload_stream({ folder: folders.receipt,
        public_id: `${receiptNumber}-${receiptId}.pdf`, resource_type: 'raw', overwrite: true }, (error, result) => {
        if (error || !result?.secure_url?.startsWith('https://') || !result?.public_id
          || !Number.isSafeInteger(result.bytes) || result.bytes < 1)
          return reject(new HttpError(503, 'Document storage is temporarily unavailable.'));
        resolve({ secureUrl: result.secure_url, publicId: result.public_id, bytes: result.bytes });
      });
      stream.on('error', () => reject(new HttpError(503, 'Document storage is temporarily unavailable.')));
      stream.end(buffer);
    } catch { reject(new HttpError(503, 'Document storage is temporarily unavailable.')); }
  });
}

function uploadInvoicePdf(buffer, invoiceNumber, invoiceId) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString() !== '%PDF-'
    || !/^INV-\d{4}-\d{6,}$/.test(invoiceNumber) || !/^[a-f\d]{24}$/.test(String(invoiceId)))
    throw new HttpError(400, 'Invalid invoice document.');
  ensureConfigured();
  return new Promise((resolve, reject) => {
    try {
      const stream = cloudinary.uploader.upload_stream({ folder: folders.invoice,
        public_id: `${invoiceNumber}-${invoiceId}.pdf`, resource_type: 'raw', overwrite: true }, (error, result) => {
        if (error || !result?.secure_url?.startsWith('https://') || !result?.public_id
          || !Number.isSafeInteger(result.bytes) || result.bytes < 1)
          return reject(new HttpError(503, 'Document storage is temporarily unavailable.'));
        resolve({ secureUrl: result.secure_url, publicId: result.public_id, bytes: result.bytes });
      });
      stream.on('error', () => reject(new HttpError(503, 'Document storage is temporarily unavailable.')));
      stream.end(buffer);
    } catch { reject(new HttpError(503, 'Document storage is temporarily unavailable.')); }
  });
}

async function downloadGeneratedPdf(document) {
  let url;
  try { url = new URL(document?.secureUrl); } catch { throw new HttpError(503, 'Document storage is temporarily unavailable.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.includes('/raw/upload/')
    || !Number.isSafeInteger(document.bytes) || document.bytes < 1 || document.bytes > 5 * 1024 * 1024)
    throw new HttpError(503, 'Document storage is temporarily unavailable.');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 5 * 1024 * 1024)
      throw new Error();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length !== document.bytes || buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error();
    return buffer;
  } catch { throw new HttpError(503, 'Document storage is temporarily unavailable.'); }
}

module.exports = { uploadImage, deleteAsset, uploadReceiptPdf, uploadInvoicePdf, downloadGeneratedPdf };
