// src/middleware/auth.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../services/db');

// The admin JWT secret must come from the environment. There are deliberately no
// hardcoded fallbacks: any fallback string is public (it lives in git) and lets
// anyone mint admin tokens.
function resolveJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('[AUTH] ADMIN_JWT_SECRET must be set to a random value of at least 32 characters in production.');
  }
  console.warn('[AUTH] ADMIN_JWT_SECRET missing or shorter than 32 chars; using an ephemeral development secret (sessions reset on restart).');
  return crypto.randomBytes(48).toString('hex');
}

const JWT_SECRET = resolveJwtSecret();

function verifyToken(token) {
  // Pin the algorithm so tokens signed any other way (e.g. "none") are rejected.
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

// Admin sessions are only valid for users that still exist in the database.
// Identity and role always come from the database, never from token claims.
async function resolveUserFromDecoded(decoded) {
  if (!decoded || !decoded.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, username: true, email: true, role: true }
  });
  return user || null;
}

function wantsJson(req) {
  return req.xhr || req.headers.accept?.includes('json');
}

async function requireAuth(req, res, next) {
  const token = req.cookies.admin_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    if (wantsJson(req)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    return res.redirect('/admin/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  try {
    const decoded = verifyToken(token);
    const user = await resolveUserFromDecoded(decoded);

    if (!user) {
      res.clearCookie('admin_token', { path: '/' });
      if (wantsJson(req)) {
        return res.status(401).json({ success: false, message: 'Invalid session' });
      }
      return res.redirect('/admin/login');
    }

    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    res.clearCookie('admin_token', { path: '/' });
    if (wantsJson(req)) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
    return res.redirect('/admin/login');
  }
}

// Use after requireAuth. Restricts a route to the given roles (e.g. 'admin').
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    if (wantsJson(req)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    return res.status(403).render('pages/message', {
      title: 'Access Denied',
      heading: '403 - Access Denied',
      message: 'Your account does not have permission to open this page.',
      buttonText: 'Back to Dashboard',
      buttonLink: '/admin'
    });
  };
}

function optionalAuth(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return next();
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (e) {
    return next(); // ignore expired / invalid optional token
  }
  resolveUserFromDecoded(decoded).then(user => {
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
    }
    next();
  }).catch(() => next());
}

// Only allow same-site relative redirect targets ("/admin/..."), never "//evil" or absolute URLs.
function safeRedirectPath(target, fallback = '/admin') {
  if (typeof target !== 'string') return fallback;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth,
  verifyToken,
  safeRedirectPath,
  JWT_SECRET
};
