const masterData = require('../services/masterDataService');
const { listResponse } = require('../utils/pagination');
function controller(kind) {
  return {
    bayNameAvailability: async (req, res) => res.json(await masterData.bayNameAvailability(req.query)),
    list: async (req, res) => res.json(listResponse(await masterData.list(kind, req.query))),
    get: async (req, res) => res.json({ item: await masterData.get(kind, req.params.id) }),
    create: async (req, res) => res.status(201).json({ item: await masterData.create(kind, req.body) }),
    update: async (req, res) => res.json({ item: await masterData.update(kind, req.params.id, req.body) }),
    archive: async (req, res) => res.json({ item: await masterData.setArchive(kind, req.params.id, true) }),
    restore: async (req, res) => res.json({ item: await masterData.setArchive(kind, req.params.id, false) }),
  };
}
module.exports = controller;
