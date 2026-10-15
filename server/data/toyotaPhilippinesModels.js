// Canonical Toyota Philippines model names and model-level image fallbacks.
// Selectable years come only from active ToyotaCatalog documents.
const modelImages = require('./toyotaModelImages');

const models = [
  'Wigo', 'Vios', 'Yaris', 'Corolla', 'Corolla Altis', 'Prius', 'Camry', 'ATIV',
  'Raize', 'Rush', 'Yaris Cross', 'Corolla Cross', 'RAV4', 'Fortuner',
  'FJ Cruiser', 'Land Cruiser', 'Land Cruiser Prado', 'Urban Cruiser', 'bZ4X',
  'Avanza', 'Innova', 'Veloz', 'Zenix', 'Alphard', 'Previa',
  'HiAce', 'Lite Ace', 'Tamaraw', 'Coaster', 'Hilux',
  '86', 'GR 86', 'GR Supra', 'GR Yaris',
];

module.exports = models.map(model => ({ model, imageUrl: modelImages[model] || '' }));
