const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const JobOrder = require('../models/JobOrder');
const AdditionalWorkRequest = require('../models/AdditionalWorkRequest');
const MaintenanceReminder = require('../models/MaintenanceReminder');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const { manilaNow } = require('./scheduleService');
const { range } = require('./reportService');
const HttpError = require('../utils/HttpError');
const { once } = require('node:events');

const bookingStatuses = ['pending', 'confirmed', 'checked_in', 'mechanic_assigned', 'in_service',
  'final_inspection', 'ready_for_release', 'completed', 'cancelled', 'rejected', 'no_show'];
const activeFinalStatuses = ['ready_for_release'];
const inPeriod = (field, start, end) => ({ [field]: { $gte: start, $lt: end } });
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
const bookingReference = { $concat: ['BK-', { $toUpper: { $substrBytes: [{ $toString: '$_id' }, 12, 12] } }] };
const paymentBookingReference = { $concat: ['BK-', { $toUpper: { $substrBytes: [{ $toString: '$booking' }, 12, 12] } }] };
const personLookup = (field, as) => ({ $lookup: { from: User.collection.name, localField: field, foreignField: '_id', as } });
const vehicleLookup = (field, as) => ({ $lookup: { from: Vehicle.collection.name, localField: field, foreignField: '_id', as } });
function filledTrend(rows, selected, valueKey) {
  if (!rows.length) return [];
  const values = new Map(rows.map(row => [row._id, row[valueKey]]));
  const date = new Date(`${selected.group === 'monthly' ? selected.from.slice(0, 7) + '-01' : selected.from}T00:00:00Z`);
  const end = selected.group === 'monthly' ? selected.to.slice(0, 7) : selected.to;
  const result = [];
  for (;;) {
    const period = date.toISOString().slice(0, selected.group === 'monthly' ? 7 : 10);
    if (period > end) break;
    result.push({ period, [valueKey]: values.get(period) || 0 });
    if (selected.group === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}

function selectedRange(query = {}) {
  const today = manilaNow().date;
  const selected = range({ from: query.from || `${today.slice(0, 7)}-01`, to: query.to || today });
  const start = new Date(`${selected.from}T00:00:00+08:00`);
  const end = new Date(`${selected.to}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  const days = Math.round((new Date(`${selected.to}T00:00:00Z`) - new Date(`${selected.from}T00:00:00Z`)) / 86400000) + 1;
  return { ...selected, start, end, group: days > 62 ? 'monthly' : 'daily' };
}
function bookingPipeline(selected) {
  const key = selected.group === 'daily' ? '$bookingDate' : { $substrBytes: ['$bookingDate', 0, 7] };
  return [ { $match: { bookingDate: { $gte: selected.from, $lte: selected.to } } },
    { $facet: {
      statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      sources: [{ $match: { status: { $ne: 'awaiting_downpayment' } } }, { $group: { _id: '$bookingType', count: { $sum: 1 } } }],
      trend: [{ $match: { status: { $ne: 'awaiting_downpayment' } } }, { $group: { _id: key, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      rows: [{ $match: { status: { $ne: 'awaiting_downpayment' } } }, { $sort: { bookingDate: -1, _id: -1 } }, { $limit: 25 },
        personLookup('client', 'clientRecord'), vehicleLookup('vehicle', 'vehicleRecord'),
        { $project: { _id: 0, bookingId: '$_id', reference: bookingReference, bookingDate: 1, bookingTime: 1, status: 1, bookingType: 1,
          finalTotalCents: 1, client: { $arrayElemAt: ['$clientRecord.fullName', 0] },
          vehicle: { $arrayElemAt: ['$vehicleRecord.model', 0] }, plate: { $arrayElemAt: ['$vehicleRecord.plateNumber', 0] } } }],
    } } ];
}
function paymentPipeline(selected) {
  const key = { $dateToString: { format: selected.group === 'daily' ? '%Y-%m-%d' : '%Y-%m', date: '$verifiedAt', timezone: 'Asia/Manila' } };
  return [{ $match: { status: 'verified', ...inPeriod('verifiedAt', selected.start, selected.end) } }, { $facet: {
    stages: [{ $group: { _id: '$stage', count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } }],
    methods: [{ $group: { _id: '$method', count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } }, { $sort: { amountCents: -1 } }],
    trend: [{ $group: { _id: key, amountCents: { $sum: '$amountCents' } } }, { $sort: { _id: 1 } }],
    rows: [{ $sort: { verifiedAt: -1, _id: -1 } }, { $limit: 25 }, personLookup('client', 'clientRecord'),
      personLookup('verifiedBy', 'verifierRecord'), { $project: { _id: 0, reference: paymentBookingReference,
        verifiedAt: 1, stage: 1, method: 1, amountCents: 1, status: 1,
        client: { $arrayElemAt: ['$clientRecord.fullName', 0] }, verifiedBy: { $arrayElemAt: ['$verifierRecord.fullName', 0] } } }],
  } }];
}
function completedPipeline(selected) {
  const completion = { $ifNull: ['$releasedAt', '$updatedAt'] };
  return [{ $match: { status: 'completed', finalTotalCents: { $type: 'number' },
    $expr: { $and: [{ $gte: [completion, selected.start] }, { $lt: [completion, selected.end] }] } } },
  { $group: { _id: null, count: { $sum: 1 }, valueCents: { $sum: '$finalTotalCents' },
    additionalWorkCents: { $sum: { $ifNull: ['$additionalWorkTotalCents', 0] } } } }];
}
function outstandingPipeline(selected) {
  return [{ $match: { status: { $in: activeFinalStatuses }, finalTotalCents: { $type: 'number' },
    ...inPeriod('finalBillingLockedAt', selected.start, selected.end) } },
  { $lookup: { from: Payment.collection.name, let: { bookingId: '$_id' }, pipeline: [
    { $match: { $expr: { $and: [{ $eq: ['$booking', '$$bookingId'] }, { $eq: ['$status', 'verified'] }] } } },
    { $group: { _id: null, paidCents: { $sum: '$amountCents' } } },
  ], as: 'verifiedPayments' } },
  { $project: { balanceCents: { $max: [0, { $subtract: ['$finalTotalCents',
    { $ifNull: [{ $arrayElemAt: ['$verifiedPayments.paidCents', 0] }, 0] }] }] } } },
  { $group: { _id: null, count: { $sum: 1 }, balanceCents: { $sum: '$balanceCents' } } }];
}
function servicePipeline(selected) {
  return [{ $match: { bookingDate: { $gte: selected.from, $lte: selected.to }, status: { $ne: 'awaiting_downpayment' } } },
    { $unwind: '$estimatedServiceItems' },
    { $group: { _id: { serviceId: '$estimatedServiceItems.serviceId', name: '$estimatedServiceItems.name' },
      bookings: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      completedSnapshotValueCents: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$estimatedServiceItems.priceCents', 0] } } } },
    { $sort: { bookings: -1, '_id.name': 1 } }, { $limit: 30 },
    { $project: { _id: 0, name: '$_id.name', bookings: 1, completed: 1, completedSnapshotValueCents: 1 } }];
}
function additionalServicePipeline(selected) {
  return [{ $match: { status: 'performed', clientDecision: 'approved', ...inPeriod('performedAt', selected.start, selected.end) } },
    { $unwind: '$approvedItems' }, { $match: { 'approvedItems.kind': 'service' } },
    { $group: { _id: '$approvedItems.name', performed: { $sum: 1 }, valueCents: { $sum: '$approvedItems.lineTotalCents' } } },
    { $sort: { performed: -1, _id: 1 } }, { $limit: 30 },
    { $project: { _id: 0, name: '$_id', performed: 1, valueCents: 1 } }];
}
function additionalWorkPipeline(selected) {
  return [{ $match: { $or: [inPeriod('createdAt', selected.start, selected.end),
    inPeriod('clientDecisionAt', selected.start, selected.end), inPeriod('performedAt', selected.start, selected.end),
    { activity: { $elemMatch: { action: 'sent_to_client', at: { $gte: selected.start, $lt: selected.end } } } }] } },
  { $group: { _id: null,
    submitted: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', selected.start] }, { $lt: ['$createdAt', selected.end] }] }, 1, 0] } },
    sentToClient: { $sum: { $cond: [{ $gt: [{ $size: { $filter: { input: { $ifNull: ['$activity', []] }, as: 'event',
      cond: { $and: [{ $eq: ['$$event.action', 'sent_to_client'] }, { $gte: ['$$event.at', selected.start] },
        { $lt: ['$$event.at', selected.end] }] } } } }, 0] }, 1, 0] } },
    approved: { $sum: { $cond: [{ $and: [{ $eq: ['$clientDecision', 'approved'] },
      { $gte: ['$clientDecisionAt', selected.start] }, { $lt: ['$clientDecisionAt', selected.end] }] }, 1, 0] } },
    declined: { $sum: { $cond: [{ $and: [{ $eq: ['$clientDecision', 'declined'] },
      { $gte: ['$clientDecisionAt', selected.start] }, { $lt: ['$clientDecisionAt', selected.end] }] }, 1, 0] } },
    performed: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'performed'] },
      { $gte: ['$performedAt', selected.start] }, { $lt: ['$performedAt', selected.end] }] }, 1, 0] } },
    approvedValueCents: { $sum: { $cond: [{ $and: [{ $eq: ['$clientDecision', 'approved'] },
      { $gte: ['$clientDecisionAt', selected.start] }, { $lt: ['$clientDecisionAt', selected.end] }] },
    { $ifNull: ['$approvedTotalCents', 0] }, 0] } },
    performedValueCents: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'performed'] },
      { $gte: ['$performedAt', selected.start] }, { $lt: ['$performedAt', selected.end] }] },
    { $ifNull: ['$approvedTotalCents', 0] }, 0] } },
  } }];
}
function mechanicPipeline(selected) {
  const assigned = { $and: [{ $gte: ['$createdAt', selected.start] }, { $lt: ['$createdAt', selected.end] }] };
  const completed = { $and: [{ $eq: ['$status', 'completed'] }, { $gte: ['$completedAt', selected.start] },
    { $lt: ['$completedAt', selected.end] }] };
  return [{ $match: { $or: [inPeriod('createdAt', selected.start, selected.end),
    inPeriod('completedAt', selected.start, selected.end)] } },
  { $group: { _id: '$mechanic', assignedJobs: { $sum: { $cond: [assigned, 1, 0] } },
    completedJobs: { $sum: { $cond: [completed, 1, 0] } },
    activeJobs: { $sum: { $cond: [{ $and: [assigned, { $in: ['$status', ['pending', 'in_progress']] }] }, 1, 0] } },
    averageMinutes: { $avg: { $cond: [{ $and: [completed, { $ne: ['$startedAt', null] }] },
      { $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 60000] }, null] } } } },
  personLookup('_id', 'person'), { $project: { _id: 1, name: { $arrayElemAt: ['$person.fullName', 0] },
    employeeId: { $arrayElemAt: ['$person.employeeId', 0] }, assignedJobs: 1, completedJobs: 1, activeJobs: 1,
    averageMinutes: 1 } }, { $sort: { name: 1 } }];
}
function mechanicWorkPipeline(selected, field, dateField) {
  return [{ $match: inPeriod(dateField, selected.start, selected.end) },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } }];
}
function maintenancePipeline(selected) {
  const tomorrow = new Date(`${manilaNow().date}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return [{ $match: { status: { $in: ['pending', 'sent'] } } }, vehicleLookup('vehicle', 'vehicleRecord'),
    { $addFields: { currentMileage: { $arrayElemAt: ['$vehicleRecord.currentMileage', 0] } } },
    { $project: { due: { $or: [
      { $and: [{ $ne: ['$nextRecommendedServiceDate', null] }, { $lt: ['$nextRecommendedServiceDate', tomorrow] }] },
      { $and: [{ $ne: ['$nextRecommendedMileage', null] }, { $gte: ['$currentMileage', '$nextRecommendedMileage'] }] },
    ] } } }, { $group: { _id: null, due: { $sum: { $cond: ['$due', 1, 0] } },
      upcoming: { $sum: { $cond: ['$due', 0, 1] } } } }];
}
async function analytics(query = {}) {
  const selected = selectedRange(query);
  const [bookingFacet, paymentFacet, completedRows, outstandingRows, services, additionalServices, additionalRows,
    mechanics, proposedWork, performedWork, maintenanceRows, supersededRows] = await Promise.all([
    Booking.aggregate(bookingPipeline(selected)), Payment.aggregate(paymentPipeline(selected)),
    Booking.aggregate(completedPipeline(selected)), Booking.aggregate(outstandingPipeline(selected)),
    Booking.aggregate(servicePipeline(selected)), AdditionalWorkRequest.aggregate(additionalServicePipeline(selected)),
    AdditionalWorkRequest.aggregate(additionalWorkPipeline(selected)), JobOrder.aggregate(mechanicPipeline(selected)),
    AdditionalWorkRequest.aggregate(mechanicWorkPipeline(selected, 'proposedBy', 'createdAt')),
    AdditionalWorkRequest.aggregate(mechanicWorkPipeline(selected, 'performedBy', 'performedAt')),
    MaintenanceReminder.aggregate(maintenancePipeline(selected)),
    MaintenanceReminder.aggregate([{ $unwind: '$previousRecommendations' },
      { $match: inPeriod('previousRecommendations.supersededAt', selected.start, selected.end) },
      { $count: 'count' }]),
  ]);
  const booking = bookingFacet[0] || { statuses: [], sources: [], trend: [], rows: [] };
  const payment = paymentFacet[0] || { stages: [], methods: [], trend: [], rows: [] };
  const byStatus = Object.fromEntries([...bookingStatuses, 'awaiting_downpayment'].map(status => [status,
    booking.statuses.find(row => row._id === status)?.count || 0]));
  const completed = completedRows[0] || { count: 0, valueCents: 0, additionalWorkCents: 0 };
  const outstanding = outstandingRows[0] || { count: 0, balanceCents: 0 };
  const additional = additionalRows[0] || { submitted: 0, sentToClient: 0, approved: 0, declined: 0,
    performed: 0, approvedValueCents: 0, performedValueCents: 0 };
  const proposedMap = new Map(proposedWork.map(row => [String(row._id), row.count]));
  const performedMap = new Map(performedWork.map(row => [String(row._id), row.count]));
  return { range: { from: selected.from, to: selected.to }, dateBasis: {
    bookings: 'Scheduled booking date', payments: 'Payment verification date',
    completed: 'Vehicle release date (legacy completion update when unavailable)',
    outstanding: 'Final billing lock date; ready for release',
    services: 'Scheduled booking date for original services; performed date for additional services',
    mechanics: 'Assignment creation and job completion dates', maintenance: 'Current active reminders; superseded during selected dates',
  },
  kpis: { bookings: sum(booking.statuses, 'count') - byStatus.awaiting_downpayment,
    completedServices: completed.count, verifiedPaymentsCents: sum(payment.stages, 'amountCents'),
    outstandingBalanceCents: outstanding.balanceCents,
    averageFinalServiceCents: completed.count ? Math.round(completed.valueCents / completed.count) : 0,
    additionalWorkApproved: additional.approved },
  bookings: { byStatus, bySource: Object.fromEntries(booking.sources.map(row => [row._id, row.count])),
    group: selected.group, trend: filledTrend(booking.trend, selected, 'count'), rows: booking.rows },
  payments: { downpaymentCents: payment.stages.find(row => row._id === 'downpayment')?.amountCents || 0,
    finalPaymentCents: payment.stages.find(row => row._id === 'final')?.amountCents || 0,
    totalCents: sum(payment.stages, 'amountCents'), methods: payment.methods.map(row => ({ method: row._id,
      count: row.count, amountCents: row.amountCents })),
    trend: filledTrend(payment.trend, selected, 'amountCents'), rows: payment.rows },
  completedService: { count: completed.count, valueCents: completed.valueCents,
    averageCents: completed.count ? Math.round(completed.valueCents / completed.count) : 0,
    additionalWorkCents: completed.additionalWorkCents },
  outstanding: { count: outstanding.count, balanceCents: outstanding.balanceCents },
  services: { original: services, additional: additionalServices },
  additionalWork: { ...additional, approvalRate: additional.approved + additional.declined
    ? Math.round(additional.approved / (additional.approved + additional.declined) * 100) : 0 },
  mechanics: mechanics.map(row => ({ name: row.name || 'Mechanic unavailable', employeeId: row.employeeId || '',
    assignedJobs: row.assignedJobs, completedJobs: row.completedJobs, activeJobs: row.activeJobs,
    averageMinutes: row.averageMinutes == null ? null : Math.round(row.averageMinutes),
    additionalWorkRequests: proposedMap.get(String(row._id)) || 0,
    performedAdditionalWork: performedMap.get(String(row._id)) || 0 })),
  maintenance: { upcoming: maintenanceRows[0]?.upcoming || 0, due: maintenanceRows[0]?.due || 0,
    superseded: supersededRows[0]?.count || 0 },
  };
}

const csvHeaders = {
  bookings: ['Scheduled Date', 'Booking Reference', 'Client', 'Vehicle', 'Plate', 'Status', 'Source', 'Locked Final Total PHP'],
  payments: ['Payment Date (Asia/Manila)', 'Booking Reference', 'Client', 'Stage', 'Method', 'Amount PHP', 'Status', 'Verified By'],
  services: ['Source', 'Service', 'Bookings or Times Performed', 'Completed Count', 'Snapshot Value PHP'],
  mechanics: ['Mechanic ID', 'Mechanic', 'Assigned Jobs', 'Completed Jobs', 'Active Jobs', 'Average Completion Minutes', 'Additional Work Requests', 'Performed Additional Work'],
};
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
const line = values => `${values.map(csvCell).join(',')}\r\n`;
const pesos = cents => cents == null ? '' : (cents / 100).toFixed(2);
const manilaDateTime = value => value ? new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
async function writeCsv(response, values) {
  if (response.destroyed) return;
  if (!response.write(line(values))) await once(response, 'drain');
}
async function exportCsv(kind, query, response) {
  if (!csvHeaders[kind]) throw new HttpError(400, 'Unsupported report export.');
  const selected = selectedRange(query);
  response.set('Content-Type', 'text/csv; charset=utf-8');
  response.set('Content-Disposition', `attachment; filename="toyota-${kind}-${selected.from}-to-${selected.to}.csv"`);
  response.write(`\uFEFF${line(csvHeaders[kind])}`);
  if (kind === 'bookings') {
    const cursor = Booking.aggregate([{ $match: { bookingDate: { $gte: selected.from, $lte: selected.to },
      status: { $ne: 'awaiting_downpayment' } } }, { $sort: { bookingDate: -1, _id: -1 } },
    personLookup('client', 'clientRecord'), vehicleLookup('vehicle', 'vehicleRecord'),
    { $project: { _id: 0, reference: bookingReference, bookingDate: 1, status: 1, bookingType: 1, finalTotalCents: 1,
      client: { $arrayElemAt: ['$clientRecord.fullName', 0] }, vehicle: { $arrayElemAt: ['$vehicleRecord.model', 0] },
      plate: { $arrayElemAt: ['$vehicleRecord.plateNumber', 0] } } }]).cursor();
    for await (const row of cursor) await writeCsv(response, [row.bookingDate, row.reference, row.client, row.vehicle,
      row.plate, row.status, row.bookingType, pesos(row.finalTotalCents)]);
  } else if (kind === 'payments') {
    const cursor = Payment.aggregate([{ $match: { status: 'verified', ...inPeriod('verifiedAt', selected.start, selected.end) } },
      { $sort: { verifiedAt: -1, _id: -1 } }, personLookup('client', 'clientRecord'), personLookup('verifiedBy', 'verifierRecord'),
      { $project: { _id: 0, reference: paymentBookingReference, verifiedAt: 1, stage: 1, method: 1, amountCents: 1,
        status: 1, client: { $arrayElemAt: ['$clientRecord.fullName', 0] },
        verifiedBy: { $arrayElemAt: ['$verifierRecord.fullName', 0] } } }]).cursor();
    for await (const row of cursor) await writeCsv(response, [manilaDateTime(row.verifiedAt), row.reference, row.client,
      row.stage, row.method, pesos(row.amountCents), row.status, row.verifiedBy]);
  } else if (kind === 'services') {
      const [original, additional] = await Promise.all([
        Booking.aggregate(servicePipeline(selected).filter(stage => !stage.$limit)),
        AdditionalWorkRequest.aggregate(additionalServicePipeline(selected).filter(stage => !stage.$limit)),
      ]);
      for (const row of original) await writeCsv(response, ['Original booked', row.name, row.bookings,
        row.completed, pesos(row.completedSnapshotValueCents)]);
      for (const row of additional) await writeCsv(response, ['Approved and performed additional', row.name,
        row.performed, row.performed, pesos(row.valueCents)]);
  } else {
    const report = await analytics(query);
    for (const row of report.mechanics) await writeCsv(response, [row.employeeId, row.name, row.assignedJobs,
      row.completedJobs, row.activeJobs, row.averageMinutes, row.additionalWorkRequests, row.performedAdditionalWork]);
  }
  response.end();
}
module.exports = { selectedRange, filledTrend, analytics, exportCsv };
