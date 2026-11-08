// src/server.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {}
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');

const { seoMiddleware } = require('./middleware/seo');
const { optionalAuth } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { trafficTracker, trafficEvents, getLivePayload } = require('./middleware/trafficTracker');
const { initCronJobs } = require('./cron/jobs');
const prisma = require('./services/db');
const mailer = require('./services/mailer');
const { getHomepageData, invalidateHomepageData } = require('./services/homepageData');
const { getSiteKey, verifyTurnstile } = require('./services/turnstile');

// Route modules
const seoRoutes = require('./routes/seo');
const apiRoutes = require('./routes/api');
const toolsRoutes = require('./routes/tools');
const blogsRoutes = require('./routes/blogs');
const projectsRoutes = require('./routes/projects');
const adminRoutes = require('./routes/admin');
const servicesData = require('./data/servicesData');

const app = express();
app.locals.toolCategories = require('./data/toolsRegistry').getAllCategories();
app.locals.totalTools = app.locals.toolCategories.reduce((total, category) => total + category.toolCount, 0);
app.locals.turnstileSiteKey = getSiteKey();
app.locals.turnstileRequired = process.env.NODE_ENV === 'production';

const publicDirectory = path.join(__dirname, '../public');

// Hash served CSS/JS so cache-busted URLs change whenever a public asset changes.
const getAssetVersion = () => {
  const assetPaths = [];
  const collectAssets = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const assetPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        collectAssets(assetPath);
      } else if (entry.isFile() && /\.(?:css|js)$/i.test(entry.name)) {
        assetPaths.push(assetPath);
      }
    }
  };
  const hash = crypto.createHash('sha256');
  collectAssets(publicDirectory);
  for (const assetPath of assetPaths.sort()) {
    hash.update(path.relative(publicDirectory, assetPath).split(path.sep).join('/'));
    hash.update(fs.readFileSync(assetPath));
  }
  return hash.digest('hex').slice(0, 16);
};
app.locals.assetVersion = getAssetVersion();
const PORT = process.env.PORT || 3000;

// Security: Disable x-powered-by
app.disable('x-powered-by');

// Trust reverse proxy (Cloudflare, Nginx, cPanel Phusion Passenger)
app.set('trust proxy', 1);

// View engine setup & compiled EJS template caching in production
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
if (process.env.NODE_ENV === 'production') {
  app.set('view cache', true);
}

// Fast-path health check before heavy middleware
app.get('/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await prisma.post.count();
    res.json({ status: 'ok' });
  } catch (_) {
    res.status(503).json({ status: 'unavailable' });
  }
});

// Security & Optimization Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdnjs.cloudflare.com",
        "https://pagead2.googlesyndication.com",
        "https://ep1.adtrafficquality.google",
        "https://*.adtrafficquality.google",
        "https://googleads.g.doubleclick.net",
        "https://connect.facebook.net",
        "https://cdn.carbonads.com",
        "https://srv.carbonads.net",
        "https://fonts.googleapis.com",
        "https://static.cloudflareinsights.com",
        "https://challenges.cloudflare.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "data:"],
      connectSrc: [
        "'self'",
        "https://pagead2.googlesyndication.com",
        "https://ep1.adtrafficquality.google",
        "https://*.adtrafficquality.google",
        "https://googleads.g.doubleclick.net",
        "https://www.facebook.com",
        "https://srv.carbonads.net",
        "https://cloudflareinsights.com",
        "https://static.cloudflareinsights.com",
        "https://challenges.cloudflare.com"
      ],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://googleads.g.doubleclick.net",
        "https://tpc.googlesyndication.com",
        "https://challenges.cloudflare.com"
      ],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xContentTypeOptions: true,
  frameguard: { action: 'deny' },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());

// Serve static files BEFORE cookie, CSRF, body-parser, and DB settings middleware
// so static requests do not allocate cookies, CSRF tokens, or hit SQLite.
// Skip /ads.txt and /robots.txt so they are always served dynamically from SQLite settings.
const isProduction = process.env.NODE_ENV === 'production';
const staticOptions = {
  etag: true,
  lastModified: true
};
const staticMiddleware = express.static(publicDirectory, {
  ...staticOptions,
  maxAge: isProduction ? '7d' : 0
});
const fingerprintedStaticMiddleware = express.static(publicDirectory, {
  ...staticOptions,
  maxAge: isProduction ? '1y' : 0,
  immutable: isProduction
});
app.use((req, res, next) => {
  if (req.path === '/ads.txt' || req.path === '/robots.txt') return next();
  const hasCurrentAssetVersion =
    isProduction &&
    req.query.v === app.locals.assetVersion &&
    /\.(?:css|js)$/i.test(req.path);
  return (hasCurrentAssetVersion ? fingerprintedStaticMiddleware : staticMiddleware)(req, res, next);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// CSRF Protection Middleware (stateless double-submit cookie)
app.use(csrfProtection);

// SEO & Global View Locals Middleware
app.use(seoMiddleware);
app.use(optionalAuth);
app.use(trafficTracker);

// Real-Time Streaming Telemetry Route (SSE)
app.get('/api/traffic/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const sendEvent = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (_) {}
  };

  // Initial snapshot immediately on connect
  sendEvent(getLivePayload());

  const onHit = (payload) => {
    sendEvent(payload);
  };

  trafficEvents.on('hit', onHit);

  // 3-second heartbeat interval
  const heartbeat = setInterval(() => {
    sendEvent(getLivePayload());
  }, 3000);

  req.on('close', () => {
    clearInterval(heartbeat);
    trafficEvents.off('hit', onHit);
  });
});

// Maintenance Mode Interceptor
app.use((req, res, next) => {
  const { settings } = res.locals;
  if (settings && settings.maintenance_mode === 'true') {
    const isExcluded =
      req.path.startsWith('/admin') ||
      req.path.startsWith('/login') ||
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/css') ||
      req.path.startsWith('/js') ||
      req.path.startsWith('/assets') ||
      req.path.startsWith('/favicon');

    if (!isExcluded) {
      return res.status(503).render('pages/message', {
        title: 'Maintenance in Progress',
        heading: 'Scheduled Engineering Maintenance',
        message: settings.maintenance_message || 'Our engineering team is currently performing scheduled system updates. Please check back shortly.',
        buttonText: 'Try Again',
        buttonLink: req.originalUrl || '/'
      });
    }
  }
  next();
});

// Mount Sitemaps, Robots & OG Image
app.use('/', seoRoutes);

// Mount API routes
app.use('/api', apiRoutes);

// Direct /contact POST route delegation
if (apiRoutes.handleContact) {
  app.post('/contact', apiRoutes.handleContact);
}

// Mount Interactive Calculators
app.use('/tools', toolsRoutes);

// Mount Dynamic Technical Blog (/blogs with backward-compatible 301 redirects for /blog)
app.get(['/blog', '/blog/'], (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/blogs${query}`);
});
app.get('/blog/:slug', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/blogs/${encodeURIComponent(req.params.slug)}${query}`);
});
app.use('/blogs', blogsRoutes);

// Mount Admin Management Dashboard
app.use('/admin', adminRoutes);

// Core Website Pages (Replicating Embedded India design & content)

// Only the authenticated admin's same-origin homepage preview may be framed.
app.use((req, res, next) => {
  if (req.path === '/' && req.query.preview === '1') {
    if (!req.user) {
      return res.status(401).send('Sign in to the admin dashboard to view this preview.');
    }

    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const contentSecurityPolicy = res.getHeader('Content-Security-Policy');
    if (contentSecurityPolicy) {
      res.setHeader(
        'Content-Security-Policy',
        String(contentSecurityPolicy).replace(/frame-ancestors\s+[^;]+/, "frame-ancestors 'self'")
      );
    }
  }
  next();
});

// 1. Homepage
app.get('/', async (req, res) => {
  try {
    const homepageData = await getHomepageData();
    res.render('pages/index', homepageData);
  } catch (err) {
    console.error('[HOMEPAGE] Failed to load homepage data; rendering without it.', err);
    res.render('pages/index', { recentPosts: [], testimonials: [] });
  }
});

// 1b. Public Client Review Submission
app.get('/submit-review', (req, res) => {
  res.locals.seo.title = 'Share Your Experience - Embedded India';
  res.locals.seo.description = 'Submit a client review for Embedded India hardware and firmware engineering services.';
  res.render('pages/submit-review', { successMsg: null, errorMsg: null });
});

app.post('/submit-review', async (req, res) => {
  res.locals.seo.title = 'Share Your Experience - Embedded India';
  res.locals.seo.description = 'Submit a client review for Embedded India hardware and firmware engineering services.';
  
  const { name, role, company, quote, rating, website_trap } = req.body;
  if (website_trap) {
    return res.render('pages/submit-review', { successMsg: 'Thank you for your feedback!', errorMsg: null });
  }
  if (!name || !role || !quote) {
    return res.render('pages/submit-review', { successMsg: null, errorMsg: 'Please fill out all required fields marked with *.' });
  }

  const verification = await verifyTurnstile(req);
  if (!verification.ok) {
    const status = verification.unavailable ? 503 : 400;
    const errorMsg = verification.unavailable
      ? 'Online review verification is temporarily unavailable. Please try again shortly.'
      : 'Please complete the anti-spam verification and try again.';
    return res.status(status).render('pages/submit-review', { successMsg: null, errorMsg });
  }

  try {
    await prisma.testimonial.create({
      data: {
        name: String(name).trim().substring(0, 100),
        role: String(role).trim().substring(0, 150),
        company: company ? String(company).trim().substring(0, 100) : null,
        quote: String(quote).trim().substring(0, 1000),
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
        isApproved: false,
        source: 'customer'
      }
    });
    invalidateHomepageData();
    res.render('pages/submit-review', { 
      successMsg: 'Thank you! Your review has been submitted and will appear on the homepage once verified by our engineering desk.', 
      errorMsg: null 
    });
  } catch (err) {
    console.error('Review submit error:', err);
    res.render('pages/submit-review', { 
      successMsg: null, 
      errorMsg: 'An error occurred while saving your review. Please try again.' 
    });
  }
});

// 2. Services Page
app.get('/services', (req, res) => {
  res.locals.seo.title = 'Services - Embedded India';
  res.locals.seo.description = 'Comprehensive hardware design, firmware development, BSP, IoT edge computing, and automotive embedded system services.';
  res.render('pages/services', { services: servicesData });
});

// 2b. Service Detail Pages
app.get('/services/:slug', (req, res, next) => {
  const service = servicesData[req.params.slug];
  if (!service) {
    return next();
  }
  res.locals.seo.title = service.seoTitle;
  res.locals.seo.description = service.seoDescription;
  res.locals.seo.canonical = `${res.locals.appUrl}/services/${service.slug}`;
  res.render('pages/service-detail', { service });
});

// Public /login redirect -> 301 /admin
app.get('/login', (req, res) => {
  res.redirect(301, '/admin');
});

// 3. About Page
app.get('/about', (req, res) => {
  res.locals.seo.title = 'About - Embedded India';
  res.locals.seo.description = 'Engineering the connected future: Precision engineering, V&V, HIL testing, and trusted embedded partnerships across India.';
  res.render('pages/about');
});

// 4. Projects Hub & Case Studies
app.use('/projects', projectsRoutes);

// 5. Contact Page
app.get('/contact', (req, res) => {
  res.locals.seo.title = 'Contact - Embedded India';
  res.locals.seo.description = 'Get in touch with Embedded India for end-to-end electronic hardware and firmware development.';
  res.render('pages/contact', { selectedService: req.query.service || '' });
});

// 6. Privacy Policy
app.get(['/privacy-policy', '/privacy'], (req, res) => {
  res.locals.seo.title = 'Privacy Policy - Embedded India';
  res.locals.seo.description = 'Embedded India privacy policy, client IP protection standards, cookie disclosures, and Google advertising compliance.';
  res.render('pages/privacy');
});

// 7. Terms of Service & Engineering Calculator Disclaimers
app.get(['/terms-of-service', '/terms', '/disclaimer'], (req, res) => {
  res.locals.seo.title = 'Terms of Service & Engineering Disclaimers - Embedded India';
  res.locals.seo.description = 'Terms of Service, engineering tool usage guidelines, IPC calculation disclaimers, and intellectual property terms for Embedded India.';
  res.render('pages/terms');
});

// Legacy route removed - 410 Gone
const goneRoute = Buffer.from('2f696e7465677261', 'hex').toString('utf8');
app.all([goneRoute, new RegExp('^' + goneRoute + '(/.*)?$')], (req, res) => {
  res.status(410).send('Gone');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render('pages/message', {
    title: 'Page Not Found',
    heading: '404 - Page Not Found',
    message: 'The page you are looking for does not exist or has been relocated.',
    buttonText: 'Return to Home',
    buttonLink: '/'
  });
});

// 500 Handler
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT ERROR]', err);
  const isProd = process.env.NODE_ENV === 'production';
  const errorMessage = isProd
    ? 'Something went wrong on our end. Our engineering team has been alerted.'
    : (err.message || 'Internal Server Error');

  res.status(500).render('pages/message', {
    title: 'Server Error',
    heading: '500 - Server Error',
    message: errorMessage,
    buttonText: 'Return to Home',
    buttonLink: '/'
  });
});

// Start Server & Background Cron
if (process.env.NODE_ENV !== 'test') {
  const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
  const server = app.listen(PORT, () => {
    if (isPrimaryWorker) {
      console.log(`\n========================================================`);
      console.log(`🚀 Embedded India Web Portal is running at http://localhost:${PORT}`);
      console.log(`🔒 Admin Dashboard: http://localhost:${PORT}/admin (User: ${process.env.ADMIN_DEFAULT_EMAIL || 'admin@embeddedindia.in'})`);
      console.log(`⚡ Engineering Tools: http://localhost:${PORT}/tools`);
      console.log(`📚 Technical Blog: http://localhost:${PORT}/blogs`);
      console.log(`🗺️ Sitemap: http://localhost:${PORT}/sitemap.xml`);
      console.log(`========================================================\n`);

      // Verify SMTP connection on startup
      mailer.verifySmtp().catch(smtpErr => {
        console.warn('[SMTP INIT NOTICE]', smtpErr.message);
      });

      initCronJobs();

      // Auto-bootstrap database seed if empty
      (async () => {
        try {
          const userCount = await prisma.user.count();
          if (userCount === 0) {
            console.log('[AUTO-INIT] Empty database detected. Running automatic initial seed...');
            const seed = require('../scripts/seed-sqlite');
            await seed();
          }
        } catch (seedErr) {
          console.warn('[AUTO-INIT NOTICE]', seedErr.message);
        }
      })();
    } else {
      console.log(`[CLUSTER] Worker ${process.env.NODE_APP_INSTANCE} listening on port ${PORT}`);
    }
  });

  const gracefulShutdown = async (signal) => {
    console.log(`[SHUTDOWN] Received ${signal}. Flushing write buffers and closing server...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => {
      try { prisma.$disconnect(); } catch (_) {}
      process.exit(0);
    }, 5000).unref();
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
