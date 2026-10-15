// Audit every configured Toyota model/year against the same image order used by the client.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const connectDatabase = require('../config/db');
const ToyotaCatalog = require('../models/ToyotaCatalog');
const seedEntries = require('../data/toyotaPhilippinesCatalog');
const service = require('../services/toyotaCatalogService');

const publicDir = path.resolve(__dirname, '../../client/public');
function usableLocalImage(url) {
  if (!url?.startsWith('/toyota/')) return false;
  const file = path.resolve(publicDir, `.${url}`);
  if (!file.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(file)) return false;
  const data = fs.readFileSync(file);
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return data.length > 1000 && (jpeg || png || webp);
}

async function main() {
  const offline = process.argv.includes('--offline');
  if (!offline) await connectDatabase();
  const rows = offline ? seedEntries : await ToyotaCatalog.find({ make: 'Toyota', market: 'Philippines', isActive: true })
    .select('make model year variant imageUrl generationImageUrl modelImageUrl').lean();
  const { catalogVehicleImages } = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/toyotaCatalog.js')).href);
  const models = service.catalogModels(rows);
  const coverage = models.map(({ model, years, imageUrl }) => {
    const missingImages = years.filter(year => !catalogVehicleImages(rows, { make: 'Toyota', model, year }, models)
      .some(usableLocalImage));
    return { model, supportedYears: years, imageCoverage: years.length - missingImages.length,
      missingImages, modelImageUsable: usableLocalImage(imageUrl) };
  });
  const unknownCatalogModels = [...new Set(rows.filter(row => !models.some(model => service.normalizeModel(row.model) === model.model))
    .map(row => row.model))].sort();
  const modelYearEntries = coverage.reduce((sum, item) => sum + item.supportedYears.length, 0);
  const realImages = coverage.reduce((sum, item) => sum + item.imageCoverage, 0);
  const result = { source: offline ? 'seed data' : 'live catalog', modelsChecked: coverage.length,
    modelYearEntries, realImages, missingImages: modelYearEntries - realImages,
    modelsWithoutLocalImage: coverage.filter(item => !item.modelImageUsable).map(item => item.model),
    unknownCatalogModels, coverage };
  console.log(JSON.stringify(result, null, 2));
  if (result.missingImages || result.modelsWithoutLocalImage.length) process.exitCode = 1;
}
main().catch(error => { console.error(`Toyota image audit failed: ${error.message}`); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
