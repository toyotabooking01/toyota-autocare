const service = require('../services/toyotaCatalogService');

exports.catalog = async (req, res) => {
  const items = await service.catalog(req.query);
  res.json({ items, models: service.catalogModels(items) });
};
exports.models = async (req, res) => res.json({ items: await service.models() });
exports.years = async (req, res) => res.json({ items: await service.years(req.query.model) });
exports.variants = async (req, res) => res.json({ items: await service.variants(req.query.model, req.query.year) });
exports.externalImage = async (req, res) => res.json({ imageUrl: await service.externalImage(req.query.model, req.query.year) });
