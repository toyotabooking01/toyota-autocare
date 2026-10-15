const express = require('express');
const mongoose = require('mongoose');
const controller = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const rateLimit = require('../middleware/rateLimit');
const HttpError = require('../utils/HttpError');

const router = express.Router();
const fifteenMinutes = 15 * 60 * 1000;
const allRequests = rateLimit({ limit: 120, windowMs: fifteenMinutes });
const loginRequests = rateLimit({ limit: 30, windowMs: fifteenMinutes });
const emailRequests = rateLimit({ limit: 20, windowMs: fifteenMinutes });
const codeRequests = rateLimit({ limit: 30, windowMs: fifteenMinutes });

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) return next(new HttpError(503, 'Authentication is temporarily unavailable.'));
  next();
});
router.use(allRequests);
router.post('/register', emailRequests, controller.register);
router.post('/verify-email', codeRequests, controller.verifyEmail);
router.post('/resend-verification', emailRequests, controller.resendVerification);
router.post('/login', loginRequests, controller.login);
router.get('/me', authenticate.passwordChangeAccess, controller.me);
router.patch('/me', authenticate, controller.updateProfile);
router.post('/change-password', loginRequests, authenticate, controller.changePassword);
router.post('/change-password/request-code', loginRequests, emailRequests, authenticate, controller.requestPasswordChange);
router.post('/change-password/verify-code', codeRequests, authenticate, controller.verifyPasswordChange);
router.post('/change-temporary-password', loginRequests, authenticate.passwordChangeAccess, controller.changeTemporaryPassword);
router.post('/forgot-password', emailRequests, controller.forgotPassword);
router.post('/verify-reset-otp', codeRequests, controller.verifyResetOtp);
router.post('/reset-password', codeRequests, controller.resetPassword);

module.exports = router;
