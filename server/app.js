const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const peopleVehiclesRoutes = require('./routes/peopleVehiclesRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const additionalWorkRoutes = require('./routes/additionalWorkRoutes');
const jobOrderRoutes = require('./routes/jobOrderRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const serviceHistoryRoutes = require('./routes/serviceHistoryRoutes');
const archiveRoutes = require('./routes/archiveRoutes');
const reportRoutes = require('./routes/reportRoutes');
const peopleRoutes = require('./routes/peopleRoutes');
const toyotaCatalogRoutes = require('./routes/toyotaCatalogRoutes');
const errorHandler = require('./middleware/errorHandler');
const securityHeaders = require('./middleware/securityHeaders');

const app = express();

app.use(securityHeaders);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(healthRoutes);
// Vercel can select app.js directly, bypassing the local index.js startup.
// CORS preflight and liveness remain available without a database connection.
if (process.env.VERCEL) app.use('/api', require('./middleware/initializeServerless'));
app.use('/api/auth', authRoutes);
app.use('/api/services', masterDataRoutes('service'));
app.use('/api/service-bays', masterDataRoutes('bay'));
app.use('/api/mechanics', peopleVehiclesRoutes('mechanic'));
app.use('/api/vehicles', peopleVehiclesRoutes('vehicle'));
app.use('/api/toyota', toyotaCatalogRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/additional-work', additionalWorkRoutes);
app.use('/api/job-orders', jobOrderRoutes);
app.use('/api/notifications', engagementRoutes.notifications);
app.use('/api/maintenance-reminders', engagementRoutes.reminders);
app.use('/api/service-history', serviceHistoryRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/people', peopleRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
