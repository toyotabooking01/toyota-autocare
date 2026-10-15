const Service = require('../models/Service');
const additionalWork = require('./additionalWorkService');
const HttpError = require('../utils/HttpError');

function addCents(sum, value) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(sum + value))
    throw new HttpError(409, 'Final billing has an invalid amount.');
  return sum + value;
}

async function originalItems(booking, session) {
  if (booking.estimatedServiceItems?.length) {
    const items = booking.estimatedServiceItems.map(item => ({ serviceId: item.serviceId,
      name: item.name, priceCents: item.priceCents }));
    const sum = items.reduce((total, item) => addCents(total, item.priceCents), 0);
    if (booking.estimatedTotalCents != null && sum !== booking.estimatedTotalCents)
      throw new HttpError(409, 'Booked service snapshot does not match its saved total.');
    return items;
  }
  // Older bookings have no item snapshot. Preserve their saved total rather than repricing it.
  if (booking.estimatedTotalCents != null) return [{ name: 'Original booked services (saved estimate)',
    priceCents: booking.estimatedTotalCents }];
  const services = await Service.find({ _id: { $in: booking.services } }).select('_id name estimatedPrice').session(session).lean();
  if (services.length !== booking.services.length) throw new HttpError(409, 'Original services are unavailable.');
  return booking.services.map(serviceId => {
    const service = services.find(item => String(item._id) === String(serviceId));
    const priceCents = Math.round(service.estimatedPrice * 100);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0
      || Math.abs(priceCents - service.estimatedPrice * 100) > 0.000001)
      throw new HttpError(409, 'Original service price is invalid.');
    return { serviceId, name: service.name, priceCents };
  });
}

async function calculate(booking, session) {
  if (booking.finalBillingLockedAt || booking.finalTotalCents != null)
    throw new HttpError(409, 'Final billing is already locked.');
  const originalServiceItems = await originalItems(booking, session);
  const originalServicesTotalCents = originalServiceItems.reduce((sum, item) => addCents(sum, item.priceCents), 0);
  const work = await additionalWork.getBillableAdditionalWork(booking._id, session);
  const additionalWorkItems = [];
  let additionalWorkTotalCents = 0;
  for (const request of work) {
    if (!request.approvedItems?.length) throw new HttpError(409, 'Approved work snapshot is incomplete.');
    let requestTotal = 0;
    for (const item of request.approvedItems) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1
        || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0
        || !Number.isSafeInteger(item.quantity * item.unitPriceCents)
        || item.lineTotalCents !== item.quantity * item.unitPriceCents)
        throw new HttpError(409, 'Approved work item is invalid.');
      requestTotal = addCents(requestTotal, item.lineTotalCents);
      additionalWorkItems.push({ workRequest: request._id, kind: item.kind, name: item.name,
        description: item.description || '', quantity: item.quantity,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents });
    }
    if (requestTotal !== request.approvedTotalCents) throw new HttpError(409, 'Approved work total does not match its items.');
    additionalWorkTotalCents = addCents(additionalWorkTotalCents, requestTotal);
  }
  return { originalServiceItems, additionalWorkItems, originalServicesTotalCents,
    additionalWorkTotalCents, finalTotalCents: addCents(originalServicesTotalCents, additionalWorkTotalCents) };
}

module.exports = { calculate, addCents };
