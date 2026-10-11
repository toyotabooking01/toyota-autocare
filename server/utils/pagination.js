const HttpError = require('./HttpError');

function pagination(query = {}) {
  if (query.page === undefined && query.limit === undefined) return null;
  function integer(value, fallback, max) {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(String(value)) || !['string', 'number'].includes(typeof value)
      || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new HttpError(400, 'Use a valid page and a page size from 1 to 50.');
    return Number(value);
  }
  return { page: integer(query.page, 1, Number.MAX_SAFE_INTEGER), limit: integer(query.limit, 10, 50) };
}
async function listPage(Model, filter, query, build) {
  const requested = pagination(query);
  // Legacy consumers (dashboards and selectors) retain their full array.
  if (!requested) return build().lean();
  const totalItems = await Model.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / requested.limit);
  const page = Math.min(requested.page, Math.max(1, totalPages));
  const items = await build().skip((page - 1) * requested.limit).limit(requested.limit).lean();
  return { items, page, limit: requested.limit, totalItems, totalPages };
}
const listResponse = result => Array.isArray(result) ? { items: result } : result;
module.exports = { pagination, listPage, listResponse };
