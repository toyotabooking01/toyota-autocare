const authService = require('../services/authService');
const safeUser = require('../utils/safeUser');

// Express 5 forwards rejected async handlers to the error middleware.
exports.register = async (req, res) => res.status(201).json(await authService.register(req.body));
exports.login = async (req, res) => res.json(await authService.login(req.body));
exports.verifyEmail = async (req, res) => res.json(await authService.verifyEmail(req.body));
exports.resendVerification = async (req, res) => res.status(202).json(await authService.resendVerification(req.body));
exports.forgotPassword = async (req, res) => res.status(202).json(await authService.forgotPassword(req.body));
exports.verifyResetOtp = async (req, res) => res.json(await authService.verifyResetOtp(req.body));
exports.resetPassword = async (req, res) => res.json(await authService.resetPassword(req.body));
exports.me = (req, res) => res.json({ user: safeUser(req.user) });
exports.updateProfile = async (req, res) => res.json(await authService.updateProfile(req.user, req.body));
exports.changePassword = async (req, res) => res.json(await authService.changePassword(req.user, req.body));
exports.requestPasswordChange = async (req, res) => res.json(await require('../services/passwordChangeService').requestCode(req.user, req.body));
exports.verifyPasswordChange = async (req, res) => res.json(await require('../services/passwordChangeService').verifyCode(req.user, req.body));
exports.changeTemporaryPassword = async (req, res) => res.json(await authService.changeTemporaryPassword(req.user, req.body));
