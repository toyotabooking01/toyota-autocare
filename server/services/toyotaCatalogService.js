const ToyotaCatalog = require('../models/ToyotaCatalog');
const seedEntries = require('../data/toyotaPhilippinesCatalog');
const modelRules = require('../data/toyotaPhilippinesModels');
const HttpError = require('../utils/HttpError');
const { VEHICLE_YEAR_FLOOR, latestVehicleYear } = require('../../shared/vehicleYearRules.mjs');
const canonicalModels = new Map(modelRules.map(entry => [entry.model.toLowerCase(), entry.model]));
canonicalModels.set('supra', 'GR Supra');
for (const [alias, parent] of Object.entries({
  'commuter deluxe': 'HiAce', 'gl grandia': 'HiAce', 'gl grandia tourer': 'HiAce',
  'super grandia': 'HiAce', 'fortuner gr-s': 'Fortuner', 'hilux fleet': 'Hilux',
})) canonicalModels.set(alias, parent);

function normalizeModel(value) {
  if (typeof value !== 'string') return '';
  const model = value.trim().replace(/\s+/g, ' ').replace(/^toyota\s+/i, '');
  return canonicalModels.get(model.toLowerCase()) || model;
}
function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function seed() {
  // Canonicalize known catalog names before upserting so new trims cannot split a model by case.
  // Customer Vehicle documents are not touched.
  const existingModels = await ToyotaCatalog.distinct('model', { make: 'Toyota', market: 'Philippines' });
  for (const storedName of existingModels) {
    const canonical = normalizeModel(storedName);
    if (storedName !== canonical && modelRules.some(rule => rule.model === canonical)) {
      await ToyotaCatalog.updateMany({ make: 'Toyota', market: 'Philippines', model: storedName },
        { $set: { model: canonical } });
    }
  }
  await ToyotaCatalog.bulkWrite(seedEntries.map(entry => ({ updateOne: {
    filter: { make: entry.make, market: entry.market,
      model: { $regex: `^${escaped(entry.model)}$`, $options: 'i' }, year: entry.year, variant: entry.variant },
    update: { $setOnInsert: entry }, upsert: true,
  } })), { ordered: false });
  await ToyotaCatalog.bulkWrite(seedEntries.map(entry => ({ updateMany: {
    filter: { make: entry.make, market: entry.market, model: { $regex: `^${escaped(entry.model)}$`, $options: 'i' },
      year: entry.year, variant: entry.variant, imageUrl: { $in: ['', null] } },
    update: { $set: { imageUrl: entry.imageUrl } },
  } })), { ordered: false });
  // Existing trim rows may predate the seed. Give every recognized model a dependable local fallback.
  await ToyotaCatalog.bulkWrite(modelRules.map(rule => ({ updateMany: {
    filter: { make: 'Toyota', market: 'Philippines',
      model: { $regex: `^${escaped(rule.model)}$`, $options: 'i' }, modelImageUrl: { $in: ['', null] } },
    update: { $set: { modelImageUrl: rule.imageUrl } },
  } })), { ordered: false });
}

function filter(query = {}) {
  const result = { make: 'Toyota', market: 'Philippines', isActive: true };
  if (query.model !== undefined) {
    if (typeof query.model !== 'string' || query.model.length > 80) throw new HttpError(400, 'Invalid Toyota model.');
    result.model = { $regex: `^${escaped(normalizeModel(query.model))}$`, $options: 'i' };
  }
  if (query.year !== undefined) {
    const year = Number(query.year);
    if (!Number.isInteger(year) || year < 1950 || year > new Date().getUTCFullYear()) throw new HttpError(400, 'Invalid model year.');
    result.year = year;
  }
  return result;
}

async function catalog(query) {
  const items = await ToyotaCatalog.find(filter(query)).select('make market model year variant category fuelType transmission seatingCapacity imageUrl generationImageUrl modelImageUrl isActive')
    .sort({ model: 1, year: -1, variant: 1 }).lean();
  return items.map(item => ({ ...item, model: normalizeModel(item.model) }));
}
async function models() {
  return catalogModels(await catalog({})).map(entry => entry.model).sort();
}
function catalogModels(items = []) {
  return modelRules.map(rule => {
    const years = [...new Set(items.filter(item => normalizeModel(item.model) === rule.model)
      .map(item => Number(item.year)).filter(Number.isInteger))].sort((a, b) => b - a);
    return { model: rule.model, imageUrl: rule.imageUrl, modelImageUrl: rule.imageUrl, years };
  }).filter(rule => rule.years.length > 0 && rule.imageUrl);
}
async function years(model) {
  if (!model) throw new HttpError(400, 'Select a Toyota model.');
  if (!modelRules.some(item => item.model === normalizeModel(model))) throw new HttpError(400, 'Select a valid Toyota model.');
  return [...new Set((await ToyotaCatalog.distinct('year', filter({ model })))
    .map(Number).filter(Number.isInteger))].sort((a, b) => b - a);
}
async function variants(model, year) {
  if (!model || year === undefined) throw new HttpError(400, 'Select a Toyota model and year.');
  return catalog({ model, year });
}
const externalImageCache = new Map();
async function externalImage(model, year) {
  const canonical = normalizeModel(model);
  if (!modelRules.some(rule => rule.model === canonical) || !process.env.CARAPI_TOKEN) return '';
  const requestedYear = Number(year);
  if (!Number.isInteger(requestedYear) || requestedYear < 1950 || requestedYear > new Date().getUTCFullYear()) return '';
  const key = `${canonical}/${requestedYear}`;
  const cached = externalImageCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.imageUrl;
  let imageUrl = '';
  try {
    const listingUrl = new URL('https://api.carapi.dev/v1/listing');
    for (const [name, value] of Object.entries({ make: 'Toyota', model: canonical, year: requestedYear, limit: 10,
      token: process.env.CARAPI_TOKEN })) listingUrl.searchParams.set(name, value);
    const listingResponse = await fetch(listingUrl, { signal: AbortSignal.timeout(4000) });
    if (listingResponse.ok) {
      const listings = (await listingResponse.json()).listings || [];
      // CarAPI uses partial model filters; accept only an exact Toyota identity.
      const match = listings.find(item => normalizeModel(item.specifications?.model).toLowerCase() === canonical.toLowerCase()
        && item.specifications?.make?.toLowerCase() === 'toyota'
        && (!item.specifications?.registrationDate
          || Number(String(item.specifications.registrationDate).slice(0, 4)) === requestedYear)
        && item.availability?.imagesCount > 0
        && /^[A-HJ-NPR-Z0-9]{17}$/.test(item.vin || ''));
      if (match) {
        const photosUrl = new URL(`https://api.carapi.dev/v1/photos/${match.vin}`);
        photosUrl.searchParams.set('token', process.env.CARAPI_TOKEN);
        const photosResponse = await fetch(photosUrl, { signal: AbortSignal.timeout(4000) });
        if (photosResponse.ok) {
          const photos = (await photosResponse.json()).photos || [];
          imageUrl = photos.find(url => typeof url === 'string' && /^https:\/\/images\.carapi\.dev\//.test(url)) || '';
        }
      }
    }
  } catch { /* The local catalog and placeholder remain available. */ }
  externalImageCache.set(key, { imageUrl, expires: Date.now() + (imageUrl ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000) });
  return imageUrl;
}
async function validateSelection(vehicle) {
  if (vehicle.make?.trim().toLowerCase() !== 'toyota') throw new HttpError(400, 'Only Toyota vehicles are supported.', { make: 'Select Toyota.' });
  const model = normalizeModel(vehicle.model);
  if (!modelRules.some(item => item.model === model)) throw new HttpError(400, 'Select a valid Toyota model.', { model: 'Select an available Toyota model.' });
  if (!Number.isInteger(vehicle.year) || vehicle.year < VEHICLE_YEAR_FLOOR || vehicle.year > latestVehicleYear(true))
    throw new HttpError(400, 'Invalid vehicle year.', { year: 'Select a valid model year.' });
  if (typeof vehicle.variant !== 'string' || !vehicle.variant.trim() || vehicle.variant.trim().length > 120)
    throw new HttpError(400, 'Invalid vehicle variant.', { variant: 'Enter a variant of up to 120 characters.' });
  if (!['manual', 'automatic', 'cvt'].includes(vehicle.transmission))
    throw new HttpError(400, 'Invalid transmission.', { transmission: 'Select a valid transmission.' });
  // Catalog entries provide optional imagery; their trims do not validate customer-entered variants.
  if (vehicle.year > latestVehicleYear()) return null;
  const entries = await catalog({ model, year: vehicle.year });
  return entries.find(item => item.variant?.trim().toLowerCase() === vehicle.variant?.trim().toLowerCase())
    || entries[0] || null;
}

module.exports = { seed, catalog, catalogModels, models, years, variants, validateSelection, normalizeModel, externalImage };
