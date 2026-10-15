const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const connectDatabase = require('../config/db');
const ToyotaCatalog = require('../models/ToyotaCatalog');
const User = require('../models/User');
const seedEntries = require('../data/toyotaPhilippinesCatalog');
const modelRules = require('../data/toyotaPhilippinesModels');
const { normalizeModel, years: catalogYears } = require('../services/toyotaCatalogService');
const { signAccessToken } = require('../services/tokenService');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');
  await connectDatabase();
  const active = { make: 'Toyota', market: 'Philippines', isActive: true };
  const [count, models, fortuner, sampleVariants] = await Promise.all([
    ToyotaCatalog.countDocuments(active),
    ToyotaCatalog.distinct('model', active),
    ToyotaCatalog.findOne({ ...active, model: 'Fortuner', year: 2025, variant: '2.4 G 4x2 AT' })
      .select('model year variant imageUrl').lean(),
    ToyotaCatalog.find({ ...active, $or: [
      { model: 'Corolla', year: 2003 }, { model: 'Avanza', year: 2020 },
      { model: 'Vios', year: 2023 }, { model: 'Raize', year: 2023 },
    ] }).select('model year variant').lean(),
  ]);
  const expectedModels = [...new Set(seedEntries.map(item => item.model))];
  const normalizedModels = [...new Set(models.map(normalizeModel))].sort();
  const missingModels = expectedModels.filter(model => !normalizedModels.includes(model));
  const selectedYears = Object.fromEntries(await Promise.all(['Corolla Altis', 'Raize', '86']
    .map(async model => [model, await catalogYears(model)])));
  console.log(JSON.stringify({ activeEntries: count, configuredModels: modelRules.length,
    models: normalizedModels, missingModels, selectedYears,
    fortuner2025: Boolean(fortuner), fortunerImage: Boolean(fortuner?.imageUrl),
    sampleVariants: Object.fromEntries(['Corolla/2003', 'Avanza/2020', 'Vios/2023', 'Raize/2023']
      .map(key => [key, sampleVariants.filter(item => `${item.model}/${item.year}` === key).map(item => item.variant).sort()])) }));
  if (count < seedEntries.length || missingModels.length || !fortuner
    || !sampleVariants.some(item => item.model === 'Corolla' && item.year === 2003)) process.exitCode = 1;
  if (process.argv.includes('--http')) {
    const user = await User.findOne({ role: { $in: ['client', 'staff', 'admin'] },
      status: 'active', isArchived: { $ne: true }, isWalkInCustomer: { $ne: true },
      mustChangePassword: { $ne: true },
      $or: [{ role: { $ne: 'client' } }, { emailVerified: true }] })
      .select('+authVersion').lean();
    if (!user) {
      const accountCount = await User.countDocuments();
      throw new Error(`No eligible account exists for the authenticated API check (${accountCount} total accounts).`);
    }
    const server = require('../app').listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const headers = { Authorization: `Bearer ${signAccessToken(user)}` };
      const get = async route => {
        const response = await fetch(`${origin}${route}`, { headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Toyota API returned ${response.status} for ${route}`);
        return response.json();
      };
      const body = await get('/api/toyota/catalog');
      const entries = Array.isArray(body.items) ? body.items : [];
      const expected = Object.fromEntries(body.models.map(({ model }) => [model,
        [...new Set(entries.filter(item => normalizeModel(item.model) === model).map(item => item.year))]
          .sort((a, b) => b - a)]));
      const yearResults = await Promise.all(body.models.map(async ({ model, years }) => {
        const apiYears = (await get(`/api/toyota/years?model=${encodeURIComponent(model)}`)).items;
        return { model, matches: JSON.stringify(apiYears) === JSON.stringify(expected[model])
          && JSON.stringify(years) === JSON.stringify(expected[model]) };
      }));
      const mismatchedYears = yearResults.filter(item => !item.matches).map(item => item.model);
      console.log(JSON.stringify({ apiEntries: entries.length, apiSelectableModels: body.models.length,
        apiModelYearPairs: Object.values(expected).reduce((sum, years) => sum + years.length, 0), mismatchedYears }));
      if (entries.length !== count || mismatchedYears.length || body.models.length !== modelRules.length) process.exitCode = 1;
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => {
  console.error(`Toyota catalog verification failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
