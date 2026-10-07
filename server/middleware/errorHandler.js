const HttpError = require('../utils/HttpError');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  if (error.code === 11000) return res.status(409).json({ message: 'A record with those details already exists.' });
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid request data.' });
  }
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    message: status === 400 ? 'Invalid request body' : 'Request could not be processed',
  });
}

module.exports = errorHandler;
