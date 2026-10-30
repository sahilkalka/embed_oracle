// src/middleware/csrf.js
// Simple CSRF protection middleware for Express
// Generates, validates, and injects CSRF tokens into forms via res.locals

const crypto = require('crypto');

const TOKEN_NAME = '_csrf';
const COOKIE_NAME = 'csrf_token';
const EXCLUDED_PATHS = ['/health', '/api/contact', '/api/newsletter/subscribe', '/api/copilot/chat', '/api/estimator/calculate'];

/**
 * Generate a random CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF middleware: sets a signed cookie token and exposes it to views as res.locals.csrfToken
 * Validates token on state-changing methods (POST, PUT, PATCH, DELETE)
 */
function csrfProtection(req, res, next) {
  // Skip CSRF for excluded paths (public API endpoints)
  if (EXCLUDED_PATHS.includes(req.path)) {
    res.locals.csrfToken = generateToken();
    return next();
  }

  // Read existing token from cookie or generate new one
  let token = req.cookies[COOKIE_NAME];
  if (!token) {
    token = generateToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }

  // Expose token to views
  res.locals.csrfToken = token;
  res.locals.csrfField = `<input type="hidden" name="${TOKEN_NAME}" value="${token}">`;

  // Validate token on state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const bodyToken = req.body[TOKEN_NAME];
    const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];

    if (!bodyToken && !headerToken) {
      // If it's an HTML form submission (not JSON API), render error page
      if (req.headers['content-type']?.includes('application/json') || req.headers['accept']?.includes('application/json') || req.xhr) {
        return res.status(403).json({ success: false, message: 'CSRF token missing', error: 'CSRF token missing' });
      }
      return res.status(403).render('pages/message', {
        title: 'CSRF Token Missing',
        heading: '403 - CSRF Token Missing',
        message: 'Your session token is missing or expired. Please refresh the page and try again.',
        buttonText: 'Refresh Page',
        buttonLink: req.get('Referer') || '/'
      });
    }

    const providedToken = bodyToken || headerToken;
    if (providedToken !== token) {
      if (req.headers['content-type']?.includes('application/json') || req.headers['accept']?.includes('application/json') || req.xhr) {
        return res.status(403).json({ success: false, message: 'CSRF token mismatch', error: 'CSRF token mismatch' });
      }
      return res.status(403).render('pages/message', {
        title: 'CSRF Token Mismatch',
        heading: '403 - CSRF Token Mismatch',
        message: 'The security token does not match. Please refresh the page and try again.',
        buttonText: 'Refresh Page',
        buttonLink: req.get('Referer') || '/'
      });
    }
  }

  next();
}

module.exports = { csrfProtection, generateToken };
