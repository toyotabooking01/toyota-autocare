const service = require('../services/peopleVehiclesService');
const { listResponse } = require('../utils/pagination');

exports.mechanicList = async (req, res) => res.json(listResponse(await service.mechanicList(req.query)));
exports.mechanicIdPreview = async (req, res) => res.json({ employeeId: await service.previewMechanicId() });
exports.mechanicGet = async (req, res) => res.json({ item: await service.mechanicGet(req.params.id) });
exports.mechanicCreate = async (req, res) => res.status(201).json(await service.mechanicCreate(req.body));
exports.mechanicUpdate = async (req, res) => res.json({ item: await service.mechanicUpdate(req.params.id, req.body) });
exports.mechanicArchive = async (req, res) => res.json({ item: await service.mechanicArchive(req.params.id, true) });
exports.mechanicRestore = async (req, res) => res.json({ item: await service.mechanicArchive(req.params.id, false) });
exports.vehicleList = async (req, res) => res.json({ items: await service.vehicleList(req.user._id, req.query) });
exports.vehicleGet = async (req, res) => res.json({ item: await service.vehicleGet(req.user._id, req.params.id) });
exports.vehicleCreate = async (req, res) => res.status(201).json({ item: await service.vehicleCreate(req.user._id, req.body) });
exports.vehicleUpdate = async (req, res) => res.json({ item: await service.vehicleUpdate(req.user._id, req.params.id, req.body) });
exports.vehicleArchive = async (req, res) => res.json({ item: await service.vehicleArchive(req.user._id, req.params.id, true) });
exports.vehicleRestore = async (req, res) => res.json({ item: await service.vehicleArchive(req.user._id, req.params.id, false) });
