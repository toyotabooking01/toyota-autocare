// Read-only inspection of bay occupancy and its related work records.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const ServiceBay = require('../models/ServiceBay');
const JobOrder = require('../models/JobOrder');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const bays = await ServiceBay.find({}).select('name operationalStatus availability isArchived').sort({ name: 1 }).lean();
  const ids = bays.map(bay => bay._id);
  const [jobs, bookings] = await Promise.all([
    JobOrder.find({ serviceBay: { $in: ids } }).select('_id serviceBay booking status completedAt').lean(),
    Booking.find({ assignedServiceBay: { $in: ids } }).select('_id assignedServiceBay status vehicle').lean(),
  ]);
  const vehicleIds = bookings.map(booking => booking.vehicle).filter(Boolean);
  const vehicles = await Vehicle.find({ _id: { $in: vehicleIds } }).select('_id plateNumber').lean();
  const plates = new Map(vehicles.map(vehicle => [String(vehicle._id), vehicle.plateNumber]));
  const bookingById = new Map(bookings.map(booking => [String(booking._id), booking]));
  const output = bays.map(bay => {
    const bayJobs = jobs.filter(job => String(job.serviceBay) === String(bay._id));
    const bayBookings = bookings.filter(booking => String(booking.assignedServiceBay) === String(bay._id));
    const activeJobs = bayJobs.filter(job => ['pending', 'in_progress'].includes(job.status));
    const activeBookingAssignments = bayBookings.filter(booking =>
      !['completed', 'cancelled', 'rejected', 'no_show'].includes(booking.status));
    const computedAvailability = activeJobs.length || activeBookingAssignments.length ? 'occupied' : 'available';
    return {
      name: bay.name, id: String(bay._id), operationalStatus: bay.operationalStatus,
      storedAvailability: bay.availability, computedAvailability,
      staleStoredAvailability: bay.availability !== computedAvailability, isArchived: bay.isArchived,
      activeJobs: activeJobs.map(job => ({
        jobOrderId: String(job._id), status: job.status, bookingId: String(job.booking),
        bookingStatus: bookingById.get(String(job.booking))?.status || null,
        vehiclePlate: plates.get(String(bookingById.get(String(job.booking))?.vehicle)) || null,
      })),
      finishedJobs: bayJobs.filter(job => !['pending', 'in_progress'].includes(job.status)).map(job => ({
        jobOrderId: String(job._id), status: job.status,
      })),
      activeBookingAssignments: activeBookingAssignments.map(booking => ({
        bookingId: String(booking._id), status: booking.status,
        vehiclePlate: plates.get(String(booking.vehicle)) || null,
      })),
    };
  });
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error('Bay audit could not connect:', error.name, error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
