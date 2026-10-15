const mongoose = require('mongoose');
const Work = require('../models/AdditionalWorkRequest');
const Booking = require('../models/Booking');
const JobOrder = require('../models/JobOrder');
const Service = require('../models/Service');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const HttpError = require('../utils/HttpError');
const cloudinary = require('./cloudinaryService');
const engagement = require('./engagementService');
const { MAX_IMAGE_BYTES } = require('../middleware/imageUpload');

const unresolved = ['pending_staff_review', 'pending_client_approval', 'approved'];
const id = value => {
  if (!mongoose.isObjectIdOrHexString(value)) throw new HttpError(400, 'Invalid record ID.');
  return value;
};
const activity = (actor, action) => ({ action, actor: actor._id, actorRole: actor.role, at: new Date() });
const cents = value => {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text))
    throw new HttpError(400, 'Enter a valid unit price in pesos and centavos.');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
const quantity = value => {
  const count = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new HttpError(400, 'Quantity must be a whole number from 1 to 1,000.');
  return count;
};
const words = (value, min, max, label) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new HttpError(400, `${label} must be ${min} to ${max} characters.`);
  return value.trim();
};
const input = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['issueTitle', 'issueDescription', 'items'].includes(key)))
    throw new HttpError(400, 'Invalid additional work request.');
  const issueTitle = words(raw.issueTitle, 5, 120, 'Issue title');
  const issueDescription = words(raw.issueDescription, 15, 2000, 'Issue description');
  let items = raw.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { throw new HttpError(400, 'Invalid additional work items.'); }
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 20)
    throw new HttpError(400, 'Add 1 to 20 service or part items.');
  return { issueTitle, issueDescription, items };
};
const shape = item => {
  if (!item || typeof item !== 'object' || Array.isArray(item)
    || Object.keys(item).some(key => !['kind', 'serviceId', 'name', 'description', 'quantity'].includes(key))
    || !['service', 'part'].includes(item.kind)) throw new HttpError(400, 'Invalid additional work item.');
  const count = quantity(item.quantity);
  const description = item.description ? words(item.description, 0, 500, 'Item description') : '';
  if (item.kind === 'service') {
    if (!item.serviceId || item.name)
      throw new HttpError(400, 'Select an existing service.');
    return { kind: 'service', serviceId: id(item.serviceId), description, quantity: count };
  }
  if (item.serviceId) throw new HttpError(400, 'Parts cannot reference a service.');
  return { kind: 'part', name: words(item.name, 2, 120, 'Part name'), description, quantity: count };
};
const total = items => {
  const amount = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(400, 'Additional work total must be greater than zero.');
  return amount;
};
const withTotals = item => {
  const lineTotalCents = item.quantity * item.unitPriceCents;
  if (!Number.isSafeInteger(lineTotalCents)) throw new HttpError(400, 'Additional work amount is too large.');
  return { ...item, lineTotalCents };
};

async function proposalItems(rawItems, session) {
  const parsed = rawItems.map(shape);
  const ids = parsed.filter(item => item.kind === 'service').map(item => item.serviceId);
  const services = ids.length ? await Service.find({ _id: { $in: ids }, isActive: true, isArchived: false })
    .select('_id name').session(session).lean() : [];
  if (services.length !== new Set(ids.map(String)).size) throw new HttpError(400, 'Selected service is unavailable.');
  if (ids.length) {
    const guarded = await Service.updateMany({ _id: { $in: ids }, isActive: true, isArchived: false },
      { $inc: { bookingLockVersion: 1 } }, { session });
    if (guarded.matchedCount !== services.length) throw new HttpError(400, 'Selected service is unavailable.');
  }
  const byId = new Map(services.map(item => [String(item._id), item]));
  return parsed.map(item => {
    if (item.kind === 'part') return item;
    const service = byId.get(String(item.serviceId));
    if (!service) throw new HttpError(400, 'Selected service is unavailable.');
    return { ...item, name: service.name };
  });
}
function quoteItems(rawItems, original) {
  if (!Array.isArray(rawItems) || rawItems.length !== original.length)
    throw new HttpError(400, 'Review every proposal item before sending.');
  return rawItems.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some(key => !['name', 'description', 'quantity', 'unitPrice'].includes(key)))
      throw new HttpError(400, 'Invalid customer quote item.');
    return withTotals({ kind: original[index].kind, serviceId: original[index].serviceId,
      name: words(item.name, 2, 120, 'Item name'),
      description: item.description ? words(item.description, 0, 500, 'Item description') : '',
      quantity: quantity(item.quantity), unitPriceCents: cents(item.unitPrice) });
  });
}
const publicWork = (work, actor) => {
  const { evidenceImage, ...rest } = work;
  if (actor?.role === 'client') {
    delete rest.originalProposalItems;
    delete rest.originalProposalTotalCents;
    delete rest.activity;
  }
  return { ...rest, evidenceImage: evidenceImage
    ? { secureUrl: evidenceImage.secureUrl, width: evidenceImage.width,
      height: evidenceImage.height, format: evidenceImage.format } : null };
};
const clientVisible = work => ['pending_client_approval', 'approved', 'declined', 'performed'].includes(work.status);
function accessible(work, actor) {
  if (actor.role === 'client' && String(work.client) !== String(actor._id)) return false;
  if (actor.role === 'client' && !clientVisible(work)) return false;
  if (actor.role === 'mechanic' && String(work.assignedMechanic) !== String(actor._id)) return false;
  return ['client', 'mechanic', 'staff', 'admin'].includes(actor.role);
}
async function get(rawId, actor) {
  const work = await Work.findById(id(rawId)).lean();
  if (!work || !accessible(work, actor)) throw new HttpError(404, 'Additional work request not found.');
  return publicWork(work, actor);
}
async function list(bookingId, actor) {
  const booking = await Booking.findById(id(bookingId)).select('client assignedMechanic').lean();
  if (!booking || (actor.role === 'client' && String(booking.client) !== String(actor._id))
    || (actor.role === 'mechanic' && String(booking.assignedMechanic) !== String(actor._id))
    || !['client', 'mechanic', 'staff', 'admin'].includes(actor.role))
    throw new HttpError(404, 'Booking not found.');
  const filter = { booking: bookingId };
  if (actor.role === 'client') filter.reviewedAt = { $exists: true };
  return (await Work.find(filter).sort({ createdAt: -1 }).lean())
    .filter(item => actor.role !== 'client' || clientVisible(item)).map(item => publicWork(item, actor));
}
async function context(session, jobId, actor, mechanicAction = false) {
  const job = await JobOrder.findOne({ _id: jobId, status: 'in_progress' }).session(session).lean();
  if (!job || (mechanicAction && actor.role === 'mechanic' && String(job.mechanic) !== String(actor._id)))
    throw new HttpError(404, 'Active Job Order not found.');
  const booking = await Booking.findOne({ _id: job.booking, status: 'in_service',
    assignedMechanic: job.mechanic }).session(session).lean();
  if (!booking) throw new HttpError(409, 'Booking must be in service.');
  return { job, booking };
}
async function guardBooking(session, booking, mechanic) {
  const result = await Booking.updateOne({ _id: booking._id, status: 'in_service', assignedMechanic: mechanic },
    { $inc: { __v: 1 } }, { session });
  if (result.matchedCount !== 1) throw new HttpError(409, 'Booking changed during additional work processing.');
}
async function notify(session, work, event) {
  const related = { type: 'job_order', bookingId: work.booking, jobOrderId: work.jobOrder,
    vehicleId: work.vehicle, relatedUserId: work.client };
  const key = `additional-work:${work._id}:${event}`;
  const ref = String(work.booking).slice(-6).toUpperCase();
  const operational = async () => {
    const users = await User.find({ role: { $in: ['staff', 'admin'] }, status: 'active', isArchived: false })
      .select('_id role').session(session).lean();
    for (const user of users) await engagement.recordNotification(session, { user: user._id,
      eventKey: `${key}:${user._id}`, title: event === 'created' ? 'Additional work requires review'
        : event === 'client_approved' ? 'Additional work approved' : 'Additional work declined',
      message: event === 'client_approved'
        ? `Client approved PHP ${(work.approvedTotalCents / 100).toFixed(2)} for ${work.vehicleSummary || 'the vehicle'}, booking ${ref}.`
        : `${work.issueTitle} for ${work.vehicleSummary || 'the vehicle'}, booking ${ref}.`,
      path: `/${user.role}/job-orders?open=${work.jobOrder}`, ...related });
  };
  if (['created', 'client_approved', 'client_declined'].includes(event)) await operational();
  if (['client_approved', 'client_declined', 'staff_rejected'].includes(event)) await engagement.recordNotification(session, {
    user: work.assignedMechanic, eventKey: `${key}:mechanic`,
    title: event === 'client_approved' ? 'Additional work approved'
      : event === 'client_declined' ? 'Additional work declined' : 'Additional work proposal rejected',
    message: event === 'client_approved'
      ? `Client approved PHP ${(work.approvedTotalCents / 100).toFixed(2)} of additional work for booking ${ref}.`
      : event === 'client_declined' ? `Client declined the additional work for booking ${ref}.`
        : `Staff rejected the additional work proposal for booking ${ref}.`,
    path: '/mechanic/active-job', ...related });
  if (['sent_to_client', 'performed', 'cancelled'].includes(event)) await engagement.recordNotification(session, {
    user: work.client, eventKey: `${key}:client`,
    title: event === 'sent_to_client' ? 'Additional work approval required'
      : event === 'performed' ? 'Additional work completed' : 'Additional work quote withdrawn',
    message: event === 'sent_to_client'
      ? `Additional work was recommended for your vehicle. Review and approve or decline the PHP ${(work.quoteTotalCents / 100).toFixed(2)} quote.`
      : event === 'performed' ? 'The additional work you approved has been completed and will be included in your final service total.'
        : 'An additional work quote was withdrawn. No approval is needed.',
    path: '/client/bookings', ...related });
}
async function create(rawJobId, actor, raw, file) {
  if (!['mechanic', 'admin'].includes(actor.role)) throw new HttpError(403, 'Access denied.');
  const jobId = id(rawJobId);
  const data = input(raw);
  if (file && (!Buffer.isBuffer(file.buffer) || !file.buffer.length
    || file.buffer.length > MAX_IMAGE_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)))
    throw new HttpError(400, 'Select a JPEG, PNG, or WebP evidence image.');
  await mongoose.connection.transaction(async session => { await context(session, jobId, actor, true); });
  const evidenceImage = file ? await cloudinary.uploadImage(file.buffer, 'additional-service-evidence') : undefined;
  let workId;
  try {
    await mongoose.connection.transaction(async session => {
      const { job, booking } = await context(session, jobId, actor, true);
      const items = await proposalItems(data.items, session);
      const vehicle = await Vehicle.findById(booking.vehicle).select('make model plateNumber').session(session).lean();
      await guardBooking(session, booking, job.mechanic);
      const [created] = await Work.create([{ booking: booking._id, jobOrder: job._id, client: booking.client,
        vehicle: booking.vehicle, vehicleSummary: vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.plateNumber}` : '',
        assignedMechanic: job.mechanic, proposedBy: actor._id, proposedByRole: actor.role,
        issueTitle: data.issueTitle, issueDescription: data.issueDescription, evidenceImage,
        originalProposalItems: items, status: 'pending_staff_review',
        activity: [activity(actor, 'created')] }], { session });
      workId = created._id;
      await notify(session, created, 'created');
    });
  } catch (error) {
    if (evidenceImage) { try { await cloudinary.deleteAsset(evidenceImage.publicId); } catch { /* Keep the original failure. */ } }
    throw error;
  }
  return get(workId, actor);
}
async function mutate(rawId, actor, action, raw = {}) {
  const workId = id(rawId);
  const roles = { send: ['staff', 'admin'], reject: ['staff', 'admin'], cancel: ['staff', 'admin'],
    approve: ['client'], decline: ['client'], perform: ['mechanic', 'admin'] };
  if (!roles[action]?.includes(actor.role)) throw new HttpError(403, 'Access denied.');
  await mongoose.connection.transaction(async session => {
    const work = await Work.findById(workId).session(session).lean();
    if (!work || !accessible(work, actor)) throw new HttpError(404, 'Additional work request not found.');
    if ((action === 'approve' || action === 'decline') && work.clientDecision === action.replace('approve', 'approved').replace('decline', 'declined')) return;
    if (action === 'perform' && work.status === 'performed') return;
    const from = ['send', 'reject'].includes(action) ? ['pending_staff_review']
      : action === 'cancel' ? ['pending_staff_review', 'pending_client_approval']
        : ['approve', 'decline'].includes(action) ? ['pending_client_approval'] : ['approved'];
    if (!from.includes(work.status)) throw new HttpError(409, 'Additional work is unavailable for this action.');
    if (action === 'perform' && String(work.assignedMechanic) !== String((await JobOrder.findById(work.jobOrder).session(session).lean())?.mechanic))
      throw new HttpError(409, 'Assigned mechanic changed.');
    const { job, booking } = await context(session, work.jobOrder, actor, action === 'perform');
    if (String(work.booking) !== String(booking._id) || String(work.assignedMechanic) !== String(job.mechanic))
      throw new HttpError(409, 'Additional work assignment changed.');
    const now = new Date();
    let status, fields = {};
    if (action === 'send') {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'items'))
        throw new HttpError(400, 'Invalid customer quote.');
      const items = quoteItems(raw.items, work.originalProposalItems);
      status = 'pending_client_approval';
      fields = { quotedItems: items, quoteTotalCents: total(items), reviewedBy: actor._id,
        reviewedByRole: actor.role, reviewedAt: now };
    } else if (action === 'reject') status = 'staff_rejected';
    else if (action === 'cancel') status = 'cancelled';
    else if (action === 'approve') {
      if (raw && Object.keys(raw).length) throw new HttpError(400, 'Client cannot change the quote.');
      status = 'approved';
      fields = { clientDecision: 'approved', clientDecisionAt: now, clientDecisionBy: actor._id,
        approvedItems: work.quotedItems.map(item => ({ kind: item.kind, serviceId: item.serviceId,
          name: item.name, description: item.description, quantity: item.quantity,
          unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents })),
        approvedTotalCents: work.quoteTotalCents };
    } else if (action === 'decline') {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'reason'))
        throw new HttpError(400, 'Invalid decline reason.');
      status = 'declined'; fields = { clientDecision: 'declined', clientDecisionAt: now,
        clientDecisionBy: actor._id, declineReason: raw.reason ? words(raw.reason, 1, 300, 'Decline reason') : '' };
    } else { status = 'performed'; fields = { performedAt: now, performedBy: actor._id, performedByRole: actor.role }; }
    await guardBooking(session, booking, job.mechanic);
    const event = { send: 'sent_to_client', reject: 'staff_rejected', cancel: 'cancelled',
      approve: 'client_approved', decline: 'client_declined', perform: 'performed' }[action];
    const auditEntries = action === 'send' ? [activity(actor, 'staff_reviewed'), activity(actor, event)] : [activity(actor, event)];
    const changed = await Work.findOneAndUpdate({ _id: workId, status: work.status },
      { $set: { status, ...fields }, $push: { activity: { $each: auditEntries } } },
      { returnDocument: 'after', session, runValidators: true }).lean();
    if (!changed) throw new HttpError(409, 'Additional work changed during processing.');
    if (['send', 'approve', 'decline', 'perform', 'cancel', 'reject'].includes(action)) await notify(session, changed, event);
  });
  return get(workId, actor);
}
async function getBillableAdditionalWork(bookingId, session) {
  const query = Work.find({ booking: id(bookingId), status: 'performed', clientDecision: 'approved' })
    .select('approvedItems approvedTotalCents booking jobOrder');
  return (session ? query.session(session) : query).lean();
}
async function hasUnresolved(bookingId, session) {
  const query = Work.exists({ booking: bookingId, status: { $in: unresolved } });
  return Boolean(await (session ? query.session(session) : query));
}
module.exports = { input, proposalItems, quoteItems, publicWork, get, list, create, mutate,
  getBillableAdditionalWork, hasUnresolved, unresolved };
