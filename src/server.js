// src/server.js
const fs = require('fs');
const path = require('path');
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
const { initCronJobs } = require('./cron/jobs');
const prisma = require('./services/db');
const mailer = require('./services/mailer');

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

// Dynamic asset versioning for cache busting across Cloudflare, Nginx, and browser caches
const getAssetVersion = () => {
  try {
    const cssPath = path.join(__dirname, '../public/css/style.css');
    const stat = fs.statSync(cssPath);
    return Math.floor(stat.mtimeMs).toString(36);
  } catch (_) {
    return Date.now().toString(36);
  }
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
        "https://static.cloudflareinsights.com"
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
        "https://static.cloudflareinsights.com"
      ],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://googleads.g.doubleclick.net",
        "https://tpc.googlesyndication.com"
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
const staticMiddleware = express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag: true,
  lastModified: true
});
app.use((req, res, next) => {
  if (req.path === '/ads.txt' || req.path === '/robots.txt') return next();
  return staticMiddleware(req, res, next);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// CSRF Protection Middleware (stateless double-submit cookie)
app.use(csrfProtection);

// SEO & Global View Locals Middleware
app.use(seoMiddleware);
app.use(optionalAuth);

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

// Mount Dynamic Technical Blog
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
    const [recentPosts, testimonials] = await Promise.all([
      prisma.post.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          summary: true,
          coverImage: true,
          author: true,
          publishedAt: true,
          readingTime: true
        }
      }),
      prisma.testimonial.findMany({
        where: { isApproved: true },
        orderBy: { createdAt: 'desc' },
        take: 6
      })
    ]);
    res.render('pages/index', { recentPosts, testimonials });
  } catch (err) {
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
  res.locals.seo.description = 'Get in touch with Embedded India for turnkey electronic hardware and firmware development.';
  res.render('pages/contact', { selectedService: req.query.service || '' });
});

// 6. Privacy Policy
app.get(['/privacy-policy', '/privacy'], (req, res) => {
  res.locals.seo.title = 'Privacy Policy - Embedded India';
  res.render('pages/privacy');
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
