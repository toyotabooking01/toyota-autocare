const multer = require('multer');
const HttpError = require('../utils/HttpError');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
function validImage(file) {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer)) return false;
  if (file.mimetype === 'image/jpeg') return buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (file.mimetype === 'image/png') return buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    const allowed = allowedTypes.has(file.mimetype);
    callback(allowed ? null : new HttpError(400, 'Only JPEG, PNG, and WebP images are allowed.'), allowed);
  },
});

function uploadProof(req, res, next) {
  uploadField('proof')(req, res, next);
}
function uploadField(field) { return (req, res, next) => {
  upload.single(field)(req, res, error => {
    if (error instanceof multer.MulterError) {
      return next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 8 MB or smaller.' : 'Invalid image upload.'));
    }
    if (error) return next(error);
    if (req.file && !validImage(req.file)) return next(new HttpError(400, 'Image content does not match its file type.'));
    next();
  });
}; }
const uploadEvidence = uploadField('evidence');

module.exports = { uploadProof, uploadEvidence, MAX_IMAGE_BYTES, validImage };
