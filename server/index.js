const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const app = require('./app');
require('./models');
const connectDatabase = require('./config/db');
const { ensureOtherService } = require('./services/bootstrapServices');

async function startServer() {
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }

  await connectDatabase();
  await ensureOtherService();
  const server = app.listen(port, () => {
    console.log(`Toyota AutoCare API running on http://localhost:${port}`);
  });
  server.on('error', () => {
    console.error('API could not listen. Check PORT and whether it is already in use.');
    process.exit(1);
  });
}

startServer().catch(() => {
  // Avoid printing a connection URI or credentials from driver errors.
  console.error('API startup failed. Check PORT, MONGO_URI, and Atlas network access.');
  process.exit(1);
});
