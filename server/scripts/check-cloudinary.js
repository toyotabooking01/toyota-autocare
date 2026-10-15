const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { cloudinary, ensureConfigured } = require('../config/cloudinary');

async function run() {
  try {
    ensureConfigured();
    const result = await cloudinary.api.ping();
    if (result?.status !== 'ok') throw new Error();
    console.log('Cloudinary connection successful.');
  } catch (error) {
    const reason = error?.message === 'Cloudinary configuration is incomplete.' ? 'configuration is incomplete.'
      : [401, 403].includes(error?.http_code || error?.error?.http_code) ? 'authentication failed.'
        : 'service is unavailable.';
    console.error(`Cloudinary connection failed: ${reason}`);
    process.exitCode = 1;
  }
}

run();
