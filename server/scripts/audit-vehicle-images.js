const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const connectDatabase = require('../config/db');
const Vehicle = require('../models/Vehicle');
const ToyotaCatalog = require('../models/ToyotaCatalog');

async function main() {
  await connectDatabase();
  const [vehicles, catalog] = await Promise.all([
    Vehicle.find().select('make model year variant catalogEntry').lean(),
    ToyotaCatalog.find({ make: 'Toyota', market: 'Philippines', isActive: true })
      .select('model year variant imageUrl').lean(),
  ]);
  const records = new Map();
  for (const vehicle of vehicles) {
    const key = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;
    const item = records.get(key) || { make: vehicle.make, model: vehicle.model, year: vehicle.year, count: 0,
      withoutVariant: 0, withCatalogEntry: 0 };
    item.count += 1;
    if (!vehicle.variant) item.withoutVariant += 1;
    if (vehicle.catalogEntry) item.withCatalogEntry += 1;
    records.set(key, item);
  }
  const models = new Map();
  for (const entry of catalog) {
    const item = models.get(entry.model) || { model: entry.model, entries: 0, withImage: 0, years: new Set() };
    item.entries += 1;
    if (entry.imageUrl) item.withImage += 1;
    item.years.add(entry.year);
    models.set(entry.model, item);
  }
  console.log(JSON.stringify({ vehicles: [...records.values()].sort((a, b) => a.model.localeCompare(b.model)),
    catalog: [...models.values()].map(({ years, ...item }) => ({ ...item, years: [...years].sort() })) }));
}
main().catch(error => { console.error(`Vehicle image audit failed: ${error.message}`); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
