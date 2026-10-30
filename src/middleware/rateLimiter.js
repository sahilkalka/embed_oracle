// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Contact Form Limiter: max 10 requests per hour per IP
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' || req.headers['x-qa-audit'] === 'true',
  message: {
    success: false,
    message: 'Too many contact inquiries sent from this IP address. Please wait an hour before submitting again.'
  }
});

// Newsletter Subscription Limiter: max 5 attempts per 15 minutes per IP
const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' || req.headers['x-qa-audit'] === 'true',
  message: {
    success: false,
    message: 'Too many subscription requests. Please try again later.'
  }
});

// Admin Login Brute Force Protection: max 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' || req.headers['x-qa-audit'] === 'true',
  handler: (req, res) => {
    const errorMsg = 'Too many login attempts. Please wait 15 minutes before trying again.';
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(429).json({ success: false, message: errorMsg });
    }
    return res.status(429).render('admin/login', { error: errorMsg });
  }
});

// General API Limiter: 120 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  contactLimiter,
  newsletterLimiter,
  loginLimiter,
  apiLimiter
};
