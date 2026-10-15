const HttpError = require('../utils/HttpError');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
  if (error.code === 11000) {
    const labels = { email: 'Email', employeeId: 'Employee ID', plateNumber: 'Plate number', name: 'Name', nameKey: 'Name', date: 'Date and time', timeSlot: 'Date and time' };
    const errors = Object.fromEntries(Object.keys(error.keyPattern || error.keyValue || {}).filter(key => labels[key]).map(key => [key === 'nameKey' ? 'name' : key,
      key === 'plateNumber' ? 'This plate number is already registered.' : `${labels[key]} already exists.`]));
    return res.status(409).json({ message: Object.values(errors)[0] || 'A record with those details already exists.', ...(Object.keys(errors).length ? { errors } : {}) });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    const labels = { fullName: 'full name', email: 'email address', phone: 'mobile number', password: 'password', employeeId: 'employee ID' };
    const errors = Object.fromEntries((error.errors ? Object.values(error.errors) : [error]).filter(item => labels[item.path]).map(item => [item.path, `Please check your ${labels[item.path]}.`]));
    return res.status(400).json({ message: 'Please check the information you entered.', ...(Object.keys(errors).length ? { errors } : {}) });
  }
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    message: status === 400 ? 'Invalid request body' : 'Request could not be processed',
  });
}

module.exports = errorHandler;
