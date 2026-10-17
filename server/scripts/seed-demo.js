const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/db');
const scheduleService = require('../services/scheduleService');
const validation = require('../utils/authValidation');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Service = require('../models/Service');
const ServiceBay = require('../models/ServiceBay');
const Schedule = require('../models/Schedule');

function requireDevelopment() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Development mode is required.');
}

function credentials(prefix) {
  return {
    email: validation.email(process.env[`${prefix}_EMAIL`]),
    password: validation.password(process.env[`${prefix}_PASSWORD`]),
  };
}

async function ensureUser(role, account) {
  const existing = await User.findOne({ email: account.email });
  if (existing) {
    if (existing.role !== role || existing.status !== 'active' || existing.isArchived || !existing.emailVerified
      || (role === 'mechanic' && existing.availability !== 'available')) {
      throw new Error(`${role} account is not eligible for the demo.`);
    }
    console.log(`${role}: existing eligible account kept.`);
    return existing;
  }
  const user = await User.create({
    fullName: role === 'client' ? 'Demo Client' : role === 'admin' ? 'Demo Admin' : 'Demo Mechanic',
    email: account.email,
    password: await bcrypt.hash(account.password, 12),
    role, emailVerified: true, status: 'active', isArchived: false,
    availability: role === 'mechanic' ? 'available' : 'off_duty',
    ...(role === 'mechanic' ? { employeeId: `DEMO-MECH-${randomUUID()}` } : {}),
  });
  console.log(`${role}: created.`);
  return user;
}

async function ensureVehicle(client) {
  const plateNumber = 'DEMO101';
  const existing = await Vehicle.findOne({ plateNumber });
  if (existing) {
    if (String(existing.owner) !== String(client._id) || existing.isArchived) throw new Error('Demo plate is already in use.');
    console.log('Vehicle: existing record kept.');
    return;
  }
  await Vehicle.create({ owner: client._id, make: 'Toyota', model: 'Vios', year: 2023,
    plateNumber, transmission: 'cvt', currentMileage: 25000 });
  console.log('Vehicle: created.');
}

async function ensureServices() {
  const examples = [
    { name: 'General PMS', description: 'Periodic maintenance service', type: 'Maintenance', estimatedDuration: 120, estimatedPrice: 3500, maintenanceReminderInterval: 180 },
    { name: 'Brake Service', description: 'Brake inspection and service', type: 'Maintenance', estimatedDuration: 90, estimatedPrice: 2200, maintenanceReminderInterval: 180 },
    { name: 'Aircon Check', description: 'Air-conditioning inspection', type: 'Maintenance', estimatedDuration: 60, estimatedPrice: 1500, maintenanceReminderInterval: 365 },
  ];
  for (const example of examples) {
    const existing = await Service.findOne({ name: new RegExp(`^${example.name}$`, 'i') });
    if (existing) {
      if (existing.isArchived || !existing.isActive) throw new Error(`Demo service ${example.name} is unavailable.`);
      console.log(`Service ${example.name}: existing record kept.`);
      continue;
    }
    await Service.create(example);
    console.log(`Service ${example.name}: created.`);
  }
}

async function ensureBays() {
  for (const name of ['DEMO BAY 1', 'DEMO BAY 2']) {
    const existing = await ServiceBay.findOne({ name });
    if (existing) {
      if (existing.isArchived || existing.operationalStatus !== 'operational' || existing.availability !== 'available') throw new Error(`Service Bay ${name} is unavailable.`);
      console.log(`Service Bay ${name}: existing record kept.`);
      continue;
    }
    await ServiceBay.create({ name, operationalStatus: 'operational', availability: 'available' });
    console.log(`Service Bay ${name}: created.`);
  }
}

async function ensureSchedules() {
  const today = scheduleService.manilaNow().date;
  let created = 0;
  for (const daysAhead of [1, 2, 3]) {
    const day = new Date(`${today}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + daysAhead);
    const date = day.toISOString().slice(0, 10);
    for (const timeSlot of ['09:00', '10:30']) {
      if (await Schedule.exists({ date, timeSlot })) continue;
      await Schedule.create({ date, timeSlot, maximumCapacity: 3, currentBookingCount: 0, isEnabled: true });
      created++;
    }
  }
  console.log(`Schedules: ${created} created; existing slots kept.`);
}

async function run() {
  requireDevelopment();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
  const admin = credentials('DEV_ADMIN');
  const mechanic = credentials('DEV_MECHANIC');
  const client = credentials('DEMO_CLIENT');
  if (new Set([admin.email, mechanic.email, client.email]).size !== 3) throw new Error('Demo account emails must differ.');
  await connectDatabase();
  await Promise.all([User.init(), Vehicle.init(), ServiceBay.init(), Schedule.init()]);
  await ensureUser('admin', admin);
  await ensureUser('mechanic', mechanic);
  const clientUser = await ensureUser('client', client);
  await ensureVehicle(clientUser);
  await ensureServices();
  await ensureBays();
  await ensureSchedules();
  console.log('Demo seed complete. No Bookings or Job Orders were created.');
}

if (require.main === module) {
  run().catch(error => {
    // Never print driver or validation errors: they can contain credentials.
    if (['Development mode is required.', 'MONGO_URI is required.', 'Demo account emails must differ.'].includes(error.message)
      || /not eligible|already in use|unavailable/.test(error.message)) console.error(error.message);
    else console.error('Demo seed failed. Check development settings, account variables, and Atlas access.');
    process.exitCode = 1;
  }).finally(async () => { try { await mongoose.disconnect(); } catch { process.exitCode = 1; } });
}

module.exports = { requireDevelopment, run };
