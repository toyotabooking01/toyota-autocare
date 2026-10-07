const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const peopleVehiclesRoutes = require('./routes/peopleVehiclesRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const jobOrderRoutes = require('./routes/jobOrderRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const reportRoutes = require('./routes/reportRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/services', masterDataRoutes('service'));
app.use('/api/service-bays', masterDataRoutes('bay'));
app.use('/api/mechanics', peopleVehiclesRoutes('mechanic'));
app.use('/api/vehicles', peopleVehiclesRoutes('vehicle'));
app.use('/api/schedules', scheduleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/job-orders', jobOrderRoutes);
app.use('/api/notifications', engagementRoutes.notifications);
app.use('/api/maintenance-reminders', engagementRoutes.reminders);
app.use('/api/reports', reportRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
