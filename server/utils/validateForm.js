const { validateForm } = require('./formValidation.mjs');
const HttpError = require('./HttpError');

module.exports = function validate(kind, values, options) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'A JSON object is required.');
  const errors = validateForm(kind, values, options);
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], errors);
};
