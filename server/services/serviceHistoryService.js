const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const JobOrder = require('../models/JobOrder');
const Invoice = require('../models/Invoice');
const Receipt = require('../models/Receipt');
const Payment = require('../models/Payment');
const AdditionalWorkRequest = require('../models/AdditionalWorkRequest');
const HttpError = require('../utils/HttpError');
const { listPage } = require('../utils/pagination');

function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid record ID.');
  return value;
}
function documentInfo(doc) {
  return { _id: doc._id, number: doc.invoiceNumber || doc.receiptNumber, type: doc.type,
    issuedAt: doc.issuedAt, documentStatus: doc.document?.status,
    secureUrl: doc.document?.status === 'generated' ? doc.document.secureUrl : null };
}
async function list(actor, query = {}) {
  const filter = { status: 'completed' };
  if (actor.role === 'client') filter.client = actor._id;
  if (query.order && !['newest', 'oldest'].includes(query.order)) throw new HttpError(400, 'Invalid date order.');
  if (query.vehicle) {
    const vehicle = await Vehicle.findById(id(query.vehicle)).select('owner').lean();
    if (!vehicle || (actor.role === 'client' && String(vehicle.owner) !== String(actor._id)))
      throw new HttpError(404, 'Vehicle not found.');
    filter.vehicle = vehicle._id;
  } else if (query.plate && actor.role !== 'client') {
    if (typeof query.plate !== 'string' || query.plate.length > 20) throw new HttpError(400, 'Invalid plate filter.');
    const plate = query.plate.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vehicles = await Vehicle.find({ plateNumber: { $regex: plate, $options: 'i' } }).select('_id').lean();
    filter.vehicle = { $in: vehicles.map(item => item._id) };
  }
  const result = await listPage(Booking, filter, query, () => Booking.find(filter)
    .sort({ releasedAt: query.order === 'oldest' ? 1 : -1, _id: query.order === 'oldest' ? 1 : -1 }).populate([
      { path: 'vehicle', select: 'make model year variant plateNumber' },
      { path: 'client', select: 'fullName' },
      { path: 'assignedMechanic', select: 'fullName' },
      { path: 'releasedBy', select: 'fullName role' },
    ]));
  const rows = Array.isArray(result) ? result : result.items;
  if (!rows.length) return Array.isArray(result) ? [] : { ...result, items: [] };
  const ids = rows.map(row => row._id);
  const [jobs, invoices, receipts, payments, work] = await Promise.all([
    JobOrder.find({ booking: { $in: ids } }).select('booking mechanicNotes serviceChecklist completedAt status').lean(),
    Invoice.find({ booking: { $in: ids }, type: 'final_service' }).lean(),
    Receipt.find({ booking: { $in: ids } }).sort({ issuedAt: 1 }).lean(),
    Payment.find({ booking: { $in: ids }, status: 'verified' }).select('booking amountCents').lean(),
    AdditionalWorkRequest.find({ booking: { $in: ids }, status: 'performed', clientDecision: 'approved' })
      .select('booking approvedItems').lean(),
  ]);
  const byBooking = items => items.reduce((map, item) => {
    const key = String(item.booking);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
  const jobMap = byBooking(jobs), invoiceMap = byBooking(invoices), receiptMap = byBooking(receipts);
  const paymentMap = byBooking(payments), workMap = byBooking(work);
  const history = rows.map(row => {
    const key = String(row._id);
    const invoice = invoiceMap.get(key)?.[0];
    const job = jobMap.get(key)?.[0];
    const originalServices = (invoice?.originalServiceItems || row.estimatedServiceItems || [])
      .map(item => ({ name: item.name, priceCents: item.priceCents }));
    const additionalWork = invoice?.additionalWorkItems?.map(item => ({ name: item.name, kind: item.kind,
      quantity: item.quantity, lineTotalCents: item.lineTotalCents })) ||
      (workMap.get(key) || []).flatMap(request => (request.approvedItems || []).map(item => ({
        name: item.name, kind: item.kind, quantity: item.quantity, lineTotalCents: item.lineTotalCents,
      })));
    const finalTotalCents = invoice?.financialSnapshot?.finalServiceTotalCents ?? row.finalTotalCents ?? null;
    const verifiedCents = (paymentMap.get(key) || []).reduce((sum, item) => sum + item.amountCents, 0);
    return { _id: row._id, bookingReference: String(row._id), completedAt: job?.completedAt || row.releasedAt || row.updatedAt,
      releasedAt: row.releasedAt, releasedBy: row.releasedBy, releasedByRole: row.releasedByRole, vehicle: row.vehicle, client: row.client,
      serviceMileage: row.serviceMileage ?? null, assignedMechanic: row.assignedMechanic,
      originalServices, additionalWork, bookingNotes: row.notes || '', mechanicNotes: job?.mechanicNotes || '', checklist: job?.serviceChecklist || [],
      finalTotalCents, paymentStatus: finalTotalCents == null ? 'Unavailable' : verifiedCents >= finalTotalCents ? 'Fully Paid' : 'Payment details unavailable',
      invoice: invoice ? documentInfo(invoice) : null, receipts: (receiptMap.get(key) || []).map(documentInfo) };
  });
  return Array.isArray(result) ? history : { ...result, items: history };
}
module.exports = { list };
