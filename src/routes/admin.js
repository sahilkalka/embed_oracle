// src/routes/admin.js
const express = require('express');
const { parseFaqs } = require('../services/faqs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const slugify = require('slugify');
const router = express.Router();
const prisma = require('../services/db');
const { requireAuth, verifyToken, JWT_SECRET } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { clearSettingsCache } = require('../middleware/seo');
const { publishScheduledPosts, sendWeeklyNewsletterDigest } = require('../cron/jobs');
const aiGenerator = require('../services/aiGenerator');
const aiScheduler = require('../services/aiScheduler');
const { renderMarkdown } = require('../services/markdown');
const mailer = require('../services/mailer');
const { PREDEFINED_PALETTES, PALETTE_ALIASES, getAvailablePaletteKey, resolveTheme } = require('../services/themeEngine');
const { formatYouTubeEmbedUrl, YouTubeUrlError } = require('../utils/youtube');

const PALETTE_OVERRIDE_FIELDS = ['bgPrimary', 'bgSurface', 'accentPrimary', 'accentSecondary', 'textPrimary'];

async function saveSetting(key, value) {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

// GET /admin/login - Login Page
router.get('/login', (req, res) => {
  if (req.cookies.admin_token) {
    try {
      verifyToken(req.cookies.admin_token);
      return res.redirect(req.query.redirect || '/admin');
    } catch (e) {}
  }
  res.render('admin/login', { error: null, redirect: req.query.redirect || '' });
});

// POST /admin/login - Authenticate Admin
router.post('/login', loginLimiter, async (req, res) => {
  const redirectTarget = req.body.redirect || req.query.redirect || '/admin';
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('admin/login', { error: 'Please enter your email and password.', redirect: redirectTarget });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.trim().toLowerCase() },
          { username: email.trim() }
        ]
      }
    });

    if (!user) {
      return res.render('admin/login', { error: 'Invalid email or password.', redirect: redirectTarget });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.render('admin/login', { error: 'Invalid email or password.', redirect: redirectTarget });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const isSecureRequest = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true';
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: isSecureRequest && process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.redirect(redirectTarget);
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.render('admin/login', { error: 'An unexpected authentication error occurred.', redirect: redirectTarget });
  }
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.redirect('/admin/login');
});

// ALL SUBSEQUENT ROUTES REQUIRE AUTHENTICATION
router.use(requireAuth);

// GET /admin - Dashboard Overview
router.get('/', async (req, res) => {
  try {
    const [
      totalPosts,
      totalInquiries,
      newInquiries,
      totalSubscribers,
      activeSubscribers,
      pageViews,
      topPosts,
      calculatorStats,
      totalProjects,
      featuredProjects
    ] = await Promise.all([
      prisma.post.count(),
      prisma.inquiry.count(),
      prisma.inquiry.count({ where: { status: 'new' } }),
      prisma.subscriber.count(),
      prisma.subscriber.count({ where: { status: 'active' } }),
      prisma.analytics.count(),
      prisma.post.findMany({
        orderBy: { views: 'desc' },
        take: 5
      }),
      (async () => {
        try {
          const allStats = await prisma.calculatorStat.findMany();
          const grouped = {};
          for (const s of allStats) {
            const key = String(s.toolName || 'unknown').toLowerCase().trim();
            if (!grouped[key]) grouped[key] = { toolName: key, executionCount: 0 };
            grouped[key].executionCount += (s.executionCount || 0);
          }
          return Object.values(grouped).sort((a, b) => b.executionCount - a.executionCount).slice(0, 6);
        } catch (e) { return []; }
      })(),
      prisma.project ? prisma.project.count().catch(() => 0) : 0,
      prisma.project ? prisma.project.count({ where: { featured: true } }).catch(() => 0) : 0
    ]);

    res.render('admin/dashboard', {
      totalPosts,
      totalInquiries,
      newInquiries,
      totalSubscribers,
      activeSubscribers,
      pageViews,
      topPosts,
      calculatorStats,
      totalProjects: totalProjects || 0,
      featuredProjects: featuredProjects || 0
    });
  } catch (err) {
    console.error('[ADMIN DASHBOARD ERROR]', err);
    res.status(500).send('Error loading dashboard metrics');
  }
});

// GET /admin/inquiries - List and Filter Inquiries
router.get('/inquiries', async (req, res) => {
  try {
    const status = req.query.status || undefined;
    const where = status ? { status } : {};

    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.render('admin/inquiries', { inquiries, selectedStatus: status });
  } catch (err) {
    res.status(500).send('Error loading inquiries');
  }
});

// POST /admin/inquiries/:id/status - Update Inquiry Status
// GET /admin/inquiries/export - One-Click CSV Export
router.get('/inquiries/export', async (req, res) => {
  try {
    const status = req.query.status || undefined;
    const where = status ? { status } : {};
    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    const headers = ['ID', 'Date', 'Name', 'Company', 'Email', 'Phone', 'Service Category', 'Status', 'Subject', 'Message'];
    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return '"' + clean + '"';
    };

    const rows = inquiries.map(inq => [
      escapeCsv(inq.id),
      escapeCsv(new Date(inq.createdAt).toISOString()),
      escapeCsv(inq.name),
      escapeCsv(inq.company || ''),
      escapeCsv(inq.email),
      escapeCsv(inq.phone || ''),
      escapeCsv(inq.serviceCategory || ''),
      escapeCsv(inq.status || 'new'),
      escapeCsv(inq.subject || ''),
      escapeCsv(inq.message || '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', 'attachment; filename="inquiries-export-' + Date.now() + '.csv"');
    res.send(csvContent);
  } catch (err) {
    console.error('[INQUIRIES EXPORT ERROR]', err);
    res.status(500).send('Error generating inquiries CSV export');
  }
});

router.post('/inquiries/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await prisma.inquiry.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.redirect('/admin/inquiries');
  } catch (err) {
    res.status(500).send('Failed to update status');
  }
});

// POST /admin/inquiries/:id/delete
router.post('/inquiries/:id/delete', async (req, res) => {
  try {
    await prisma.inquiry.delete({ where: { id: req.params.id } });
    res.redirect('/admin/inquiries');
  } catch (err) {
    res.status(500).send('Failed to delete inquiry');
  }
});

// GET /admin/subscribers - Subscriber List & CSV Export
router.get('/subscribers', async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.render('admin/subscribers', { subscribers, message: req.query.sent === '1' ? 'PDF email accepted by the mail server.' : null, deliveryError: req.query.error || null });
  } catch (err) {
    res.status(500).send('Error loading subscribers');
  }
});

// GET /admin/subscribers/export - Download CSV
router.get('/subscribers/export', async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({
      where: { status: 'active' },
      select: { email: true, createdAt: true, source: true }
    });

    let csv = 'Email,Date Subscribed,Source\n';
    subscribers.forEach(s => {
      csv += `"${s.email}","${s.createdAt.toISOString()}","${s.source}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`embeddedindia-subscribers-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Failed to export CSV');
  }
});

// POST /admin/subscribers/:id/approve - Manually Approve Subscriber & Dispatch Lead Magnet
router.post('/subscribers/:id/approve', async (req, res) => {
  try {
    const subscriber = await prisma.subscriber.findUnique({
      where: { id: req.params.id }
    });

    if (!subscriber) {
      return res.status(404).send('Subscriber not found');
    }

    await prisma.subscriber.update({
      where: { id: req.params.id },
      data: {
        status: 'active',
        verifiedAt: new Date(),
        verifyToken: null,
        leadMagnetSent: subscriber.leadMagnetSent
      }
    });

    // Trigger confirmation / dispatch email
    const delivery = await mailer.sendLeadMagnetEmail(subscriber.email);
    if (!delivery.success) {
      return res.redirect('/admin/subscribers?error=' + encodeURIComponent(delivery.error || 'PDF delivery failed. Check SMTP settings and retry.'));
    }
    await prisma.subscriber.update({ where: { id: subscriber.id }, data: { leadMagnetSent: true } });
    res.redirect('/admin/subscribers?sent=1');
  } catch (err) {
    console.error('[ADMIN APPROVE SUBSCRIBER ERROR]', err);
    res.status(500).send('Failed to approve subscriber');
  }
});

// POST /admin/subscribers/:id/delete - Delete Subscriber
router.post('/subscribers/:id/delete', async (req, res) => {
  try {
    await prisma.subscriber.delete({ where: { id: req.params.id } });
    res.redirect('/admin/subscribers');
  } catch (err) {
    res.status(500).send('Failed to delete subscriber');
  }
});

// GET /admin/posts - CMS Post Management
router.get('/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.render('admin/posts/index', { posts });
  } catch (err) {
    res.status(500).send('Error loading posts');
  }
});

// GET /admin/posts/new - Create Post
router.get('/posts/new', (req, res) => {
  res.render('admin/posts/edit', {
    post: null,
    categories: ['Embedded Electronics', 'Guides', 'Troubleshooting', 'Industry Info']
  });
});

// POST /admin/posts/new - Save Post
router.post('/posts/new', async (req, res) => {
  try {
    const { title, category, tags, summary, contentMarkdown, status, scheduledAt, readingTime } = req.body;
    const cleanTitle = (title || 'Untitled Technical Guide').trim();
    const slug = slugify(cleanTitle, { lower: true, strict: true }) || 'post-' + Date.now();

    const validScheduledAt = scheduledAt && !isNaN(Date.parse(scheduledAt)) ? new Date(scheduledAt) : null;
    const contentHtml = renderMarkdown(contentMarkdown || '');

    await prisma.post.create({
      data: {
        title: cleanTitle,
        slug,
        category: category || 'Embedded Electronics',
        tags: tags || 'embedded',
        summary: summary || '',
        contentMarkdown: contentMarkdown || '',
        contentHtml,
        status: status || 'published',
        readingTime: parseInt(readingTime) || 4,
        scheduledAt: validScheduledAt,
        publishedAt: status === 'published' ? new Date() : (validScheduledAt ? null : null)
      }
    });

    res.redirect('/admin/posts');
  } catch (err) {
    console.error('[CREATE POST ERROR]', err);
    res.status(/duplicate|unique/i.test(err.message) ? 409 : 500).send('Error creating post: ' + err.message);
  }
});

// GET /admin/posts/:id/edit - Edit Post
router.get('/posts/:id/edit', async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id }
    });
    if (!post) {
      return res.redirect('/admin/posts?error=Post+not+found');
    }

    res.render('admin/posts/edit', {
      post,
      categories: ['Embedded Electronics', 'Guides', 'Troubleshooting', 'Industry Info']
    });
  } catch (err) {
    console.error('[FETCH POST ERROR]', err);
    res.redirect('/admin/posts');
  }
});

// POST /admin/posts/:id/edit - Update Post
router.post('/posts/:id/edit', async (req, res) => {
  try {
    const { title, slug, category, tags, summary, contentMarkdown, status, scheduledAt, readingTime } = req.body;
    const cleanTitle = (title || 'Untitled Technical Guide').trim();

    let targetSlug = slugify(slug || cleanTitle, { lower: true, strict: true }) || `post-${Date.now().toString().slice(-4)}`;
    const existing = await prisma.post.findFirst({
      where: { slug: targetSlug, NOT: { id: req.params.id } }
    });
    if (existing) return res.status(409).send('Another post already uses this URL. Edit the existing post or choose a different URL.');

    const validScheduledAt = scheduledAt && !isNaN(Date.parse(scheduledAt)) ? new Date(scheduledAt) : null;
    const contentHtml = renderMarkdown(contentMarkdown || '');

    const postExists = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!postExists) return res.status(404).send('Post no longer exists. Reload the post list before saving.');

    await prisma.post.update({
      where: { id: req.params.id },
      data: {
        title: cleanTitle,
        slug: targetSlug,
        category: category || postExists.category,
        tags: tags || postExists.tags,
        summary: summary !== undefined ? summary : postExists.summary,
        contentMarkdown: contentMarkdown !== undefined ? contentMarkdown : postExists.contentMarkdown,
        contentHtml,
        status: status || postExists.status,
        readingTime: parseInt(readingTime) || postExists.readingTime || 4,
        scheduledAt: validScheduledAt,
        publishedAt: status === 'published' ? (postExists.publishedAt || new Date()) : postExists.publishedAt
      }
    });

    res.redirect('/admin/posts');
  } catch (err) {
    console.error('[UPDATE POST ERROR]', err);
    res.status(/duplicate|unique/i.test(err.message) ? 409 : 500).send('Error updating post: ' + err.message);
  }
});

// POST /admin/posts/:id/delete
router.post('/posts/:id/delete', async (req, res) => {
  try {
    await prisma.post.delete({ where: { id: req.params.id } });
    res.redirect('/admin/posts');
  } catch (err) {
    res.status(500).send('Error deleting post');
  }
});

// GET /admin/settings - Manage Site Settings
router.get('/settings', async (req, res, next) => {
  try {
    const [settings, users, schedulerSettings, totalPosts] = await Promise.all([
      prisma.setting.findMany(),
      prisma.user.findMany({
        select: { id: true, username: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      }),
      aiScheduler.getSchedulerSettings(),
      prisma.post.count()
    ]);

    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    res.render('admin/settings', {
      settings: settingsMap,
      schedulerSettings,
      totalPosts,
      saved: req.query.saved === '1',
      users: users || [],
      currentUser: req.user,
      success: req.query.saved === '1'
    });
  } catch (err) {
    console.error('[ADMIN SETTINGS LOAD ERROR]', err);
    next(err);
  }
});

// POST /admin/settings - Update Site Settings (Supports independent module AJAX saves)
router.post('/settings', async (req, res) => {
  try {
    const fields = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(fields, 'custom_faqs')) {
      try { fields.custom_faqs = JSON.stringify(parseFaqs(fields.custom_faqs)); }
      catch (error) { return res.status(400).json({ success: false, error: error.message }); }
    }
    const activeTab = fields._active_tab || '';
    delete fields._active_tab;

    for (const key of Object.keys(fields).filter(key => /^adsense_.*_slot$/.test(key))) {
      fields[key] = String(fields[key]).trim();
      if (fields[key] && !/^\d{10}$/.test(fields[key])) {
        return res.status(400).json({ success: false, error: 'AdSense slot IDs must contain exactly 10 digits.' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'adsense_pub_id')) {
      fields.adsense_pub_id = String(fields.adsense_pub_id).trim();
      if (fields.adsense_pub_id && !/^ca-pub-\d{16}$/.test(fields.adsense_pub_id)) {
        return res.status(400).json({ success: false, error: 'Enter a valid AdSense publisher ID (ca-pub- followed by 16 digits).' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'calendly_url')) {
      fields.calendly_url = String(fields.calendly_url).trim();
      if (fields.calendly_url) {
        try {
          const bookingUrl = new URL(fields.calendly_url);
          if (bookingUrl.protocol !== 'https:' || bookingUrl.username || bookingUrl.password) throw new Error('Invalid URL');
        } catch {
          return res.status(400).json({ success: false, error: 'Meeting booking URL must be a valid HTTPS address.' });
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'meta_pixel_id')) {
      fields.meta_pixel_id = String(fields.meta_pixel_id).trim();
      if (fields.meta_pixel_id && !/^\d{5,20}$/.test(fields.meta_pixel_id)) {
        return res.status(400).json({ success: false, error: 'Meta Pixel ID must contain 5 to 20 digits.' });
      }
      if (fields.enable_meta_pixel === 'true' && !fields.meta_pixel_id) {
        return res.status(400).json({ success: false, error: 'Enter a Meta Pixel ID before enabling the pixel.' });
      }
    }

    for (const key of Object.keys(fields)) {
      await saveSetting(key, String(fields[key]));
    }
    clearSettingsCache();

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ success: true, message: 'Settings saved and applied live!', activeTab });
    }
    res.redirect(`/admin/settings?saved=1${activeTab ? '#' + activeTab : ''}`);
  } catch (err) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({ success: false, error: err.message || 'Error saving settings' });
    }
    res.status(500).send('Error saving settings');
  }
});

router.post('/settings/palettes/create', async (req, res) => {
  const { name, badge, bgPrimary, bgSurface, accentPrimary, accentSecondary, textPrimary, borderColor } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Palette name is required.' });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const key = `custom-${slug || Date.now()}`;

  try {
    const rows = await prisma.setting.findMany();
    const settings = rows.reduce((result, row) => {
      result[row.key] = row.value;
      return result;
    }, {});

    let customPalettes = [];
    if (settings.custom_palettes_json) {
      try { customPalettes = JSON.parse(settings.custom_palettes_json); } catch (e) {}
    }

    const newPalette = {
      key,
      name: name.trim(),
      badge: (badge && badge.trim()) || 'Custom',
      badgeClass: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300',
      borderActiveClass: 'border-brand-500 bg-brand-50/20 dark:bg-brand-900/20 ring-2 ring-brand-500/20',
      radioClass: 'text-brand-500 focus:ring-brand-500',
      activeLabelColor: 'text-brand-600 dark:text-accent',
      defaults: {
        bgPrimary: bgPrimary || '#0d1117',
        bgSurface: bgSurface || '#161b22',
        accentPrimary: accentPrimary || '#58a6ff',
        accentSecondary: accentSecondary || '#79c0ff',
        textPrimary: textPrimary || '#c9d1d9',
        borderColor: borderColor || '#30363d'
      }
    };

    customPalettes.push(newPalette);
    await saveSetting('custom_palettes_json', JSON.stringify(customPalettes));
    clearSettingsCache();

    return res.json({ success: true, palette: newPalette });
  } catch (err) {
    console.error('[PALETTE CREATE ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to create custom color scheme.' });
  }
});

router.post('/settings/palettes/:key/delete', async (req, res) => {
  const { key } = req.params;
  if (!Object.prototype.hasOwnProperty.call(PREDEFINED_PALETTES, key)) {
    return res.status(400).json({ success: false, error: 'Unknown built-in palette.' });
  }

  try {
    const rows = await prisma.setting.findMany();
    const settings = rows.reduce((result, row) => {
      result[row.key] = row.value;
      return result;
    }, {});
    const fallbackKey = getAvailablePaletteKey(settings, 'cyber-emerald', key);
    if (!fallbackKey) {
      return res.status(409).json({ success: false, error: 'At least one built-in palette must remain available.' });
    }

    const activeKey = PALETTE_ALIASES[settings.active_theme_palette] || settings.active_theme_palette;
    await saveSetting(`palette_deleted_${key}`, 'true');
    await prisma.setting.deleteMany({
      where: {
        key: {
          in: PALETTE_OVERRIDE_FIELDS.map(field => `palette_override_${key}_${field}`)
        }
      }
    });
    if (activeKey === key) {
      await saveSetting('active_theme_palette', fallbackKey);
    }

    clearSettingsCache();
    return res.json({ success: true, fallbackPalette: activeKey === key ? fallbackKey : null });
  } catch (err) {
    console.error('[PALETTE DELETE ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to delete palette.' });
  }
});

router.post('/settings/palettes/:key/reset', async (req, res) => {
  const { key } = req.params;
  if (!Object.prototype.hasOwnProperty.call(PREDEFINED_PALETTES, key)) {
    return res.status(400).json({ success: false, error: 'Unknown built-in palette.' });
  }

  try {
    await prisma.setting.deleteMany({
      where: {
        key: {
          in: [
            `palette_deleted_${key}`,
            ...PALETTE_OVERRIDE_FIELDS.map(field => `palette_override_${key}_${field}`)
          ]
        }
      }
    });
    clearSettingsCache();
    return res.json({ success: true });
  } catch (err) {
    console.error('[PALETTE RESET ERROR]', err);
    return res.status(500).json({ success: false, error: 'Unable to restore palette defaults.' });
  }
});

// POST /admin/settings/test-smtp - Test live outgoing SMTP connection
const handleTestSmtp = async (req, res) => {
  try {
    const result = await mailer.testSmtpConnection(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/settings/test-smtp', handleTestSmtp);
router.post('/test-smtp', handleTestSmtp);

// POST /admin/settings/validate-ad - Validate Google AdSense Ad Account & sync ads.txt
const handleValidateAd = async (req, res) => {
  try {
    const { pubId } = req.body;
    if (!pubId || !pubId.trim()) {
      return res.json({
        success: false,
        error: 'Please enter a Google AdSense Publisher ID (e.g. ca-pub-2644536267352236).',
        message: 'Please enter a Google AdSense Publisher ID (e.g. ca-pub-2644536267352236).'
      });
    }
    const cleanPub = pubId.trim();
    const isValid = /^(ca-)?pub-\d{16}$/i.test(cleanPub);
    if (!isValid) {
      return res.json({
        success: false,
        error: 'Invalid AdSense ID format. Expected "ca-pub-XXXXXXXXXXXXXXXX" or "pub-XXXXXXXXXXXXXXXX" (16 digits).'
      });
    }

    const formattedPub = cleanPub.toLowerCase().startsWith('ca-') ? cleanPub : `ca-${cleanPub}`;
    const purePub = cleanPub.replace(/^ca-/i, '');

    // Persist to database settings
    await prisma.setting.upsert({
      where: { key: 'adsense_pub_id' },
      update: { value: formattedPub },
      create: { key: 'adsense_pub_id', value: formattedPub }
    });
    await prisma.setting.upsert({
      where: { key: 'enable_adsense' },
      update: { value: 'true' },
      create: { key: 'enable_adsense', value: 'true' }
    });

    // Write public/ads.txt
    const fs = require('fs');
    const path = require('path');
    const adsTxtPath = path.join(__dirname, '../../public/ads.txt');
    const adsTxtContent = `google.com, ${purePub}, DIRECT, f08c47fec0942fa0\n`;
    fs.writeFileSync(adsTxtPath, adsTxtContent, 'utf8');

    clearSettingsCache();

    res.json({
      success: true,
      pubId: formattedPub,
      publisherId: formattedPub,
      purePub,
      adsTxtUrl: '/ads.txt',
      adsTxtLine: adsTxtContent.trim(),
      message: 'AdSense publisher account validated successfully and ads.txt generated.'
    });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/settings/validate-ad', handleValidateAd);
router.post('/settings/validate-ad-account', handleValidateAd);
router.post('/validate-ad-account', handleValidateAd);

// POST /admin/settings/add-account - Add & Validate New Staff Account
const handleAddAccount = async (req, res) => {
  try {
    const { email, username, password, role } = req.body;
    if (!email || !email.trim()) {
      return res.json({ success: false, error: 'Email address is required.' });
    }
    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 8) {
      return res.json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    const usernameClean = (username || emailClean.split('@')[0]).trim();

    // Check for duplicate account
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: emailClean },
          { username: usernameClean }
        ]
      }
    });

    if (existingUser) {
      return res.json({ success: false, error: `An account with email "${emailClean}" or username "${usernameClean}" already exists.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email: emailClean,
        username: usernameClean,
        passwordHash,
        role: role === 'admin' ? 'admin' : 'editor'
      }
    });

    res.json({
      success: true,
      message: `Account for ${newUser.email} (${newUser.role}) successfully validated and created!`,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/settings/add-account', handleAddAccount);
router.post('/add-account', handleAddAccount);
router.post('/users/create', handleAddAccount);

// POST /admin/settings/delete-account - Remove Staff Account
router.post('/users/:id/delete', async (req, res) => {
  try {
    const id = req.params.id;
    const currentUserId = req.user?.id || req.user?.userId;
    if (currentUserId && currentUserId === id) {
      return res.json({ success: false, error: 'Cannot delete your own active session account.' });
    }
    const total = await prisma.user.count();
    if (total <= 1) {
      return res.json({ success: false, error: 'Cannot remove the last remaining administrator account.' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'Account successfully removed.' });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
});
router.post('/settings/delete-account', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ success: false, error: 'Account ID required.' });

    const currentUserId = req.user?.id || req.user?.userId;
    if (currentUserId && currentUserId === id) {
      return res.json({ success: false, error: 'Cannot delete your own active session account.' });
    }

    const total = await prisma.user.count();
    if (total <= 1) {
      return res.json({ success: false, error: 'Cannot remove the last remaining administrator account.' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'Account successfully removed.' });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
});

// POST /admin/settings/change-password - Update logged-in admin password
const handleChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.json({ success: false, error: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.json({ success: false, error: 'New password must be at least 8 characters long.' });
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.json({ success: false, error: 'Authentication required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.json({ success: false, error: 'User account not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.json({ success: false, error: 'Current password does not match.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash }
    });

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/settings/change-password', handleChangePassword);
router.post('/change-password', handleChangePassword);

// Keep existing bookmarks on the canonical Settings tab.
router.get('/ai', (req, res) => {
  res.redirect(302, '/admin/settings' + (req.query.saved === '1' ? '?saved=1' : '') + '#ai-engine');
});

// POST /admin/ai - Save AI Configuration & Automated Scheduler Settings
router.post('/ai', async (req, res) => {
  try {
    const fields = { ...req.body };
    // Handle checkbox state for ai_auto_gen_enabled
    fields.ai_auto_gen_enabled = (req.body.ai_auto_gen_enabled === 'true' || req.body.ai_auto_gen_enabled === 'on' || req.body.ai_auto_gen_enabled === '1') ? 'true' : 'false';

    for (const key of Object.keys(fields)) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(fields[key]) },
        create: { key, value: String(fields[key]) }
      });
    }
    clearSettingsCache();
    res.redirect('/admin/settings?saved=1#ai-engine');
  } catch (err) {
    console.error('[SAVE AI CONFIG ERROR]', err);
    res.status(500).send('Error saving AI configuration');
  }
});

// POST /admin/ai/test - Test AI Model Connectivity
const handleAiTest = async (req, res) => {
  try {
    const result = await aiGenerator.testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/test', handleAiTest);
router.post('/admin/ai/test', handleAiTest);

// POST /admin/ai/generate - Auto-Generate Technical Blog Post
const handleAiGenerate = async (req, res) => {
  try {
    const post = await aiGenerator.generateBlogArticle(req.body);
    res.json({ success: true, post });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/generate', handleAiGenerate);
router.post('/admin/ai/generate', handleAiGenerate);

// POST /admin/ai/suggest-topics - Suggest Trending Technical Topics via AI Agent
const handleAiSuggestTopics = async (req, res) => {
  try {
    const result = await aiGenerator.suggestTopics(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/suggest-topics', handleAiSuggestTopics);
router.post('/admin/ai/suggest-topics', handleAiSuggestTopics);

// POST /admin/ai/generate-outline - Generate Technical Article Outline via AI Agent
const handleAiGenerateOutline = async (req, res) => {
  try {
    const result = await aiGenerator.generateOutline(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/generate-outline', handleAiGenerateOutline);
router.post('/admin/ai/generate-outline', handleAiGenerateOutline);

// POST /admin/ai/draft-post - Generate Full Post Draft without auto-saving
const handleAiDraftPost = async (req, res) => {
  try {
    const post = await aiGenerator.generateBlogArticle({ ...req.body, createDraftInDb: false });
    res.json({ success: true, post });
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/draft-post', handleAiDraftPost);
router.post('/admin/ai/draft-post', handleAiDraftPost);

// POST /admin/ai/auto-gen/run-now - Trigger Scheduled AI Blog Generation Immediately
const handleAiSchedulerRunNow = async (req, res) => {
  try {
    const result = await aiScheduler.executeAutoGeneration({ force: true });
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
};
router.post('/ai/auto-gen/run-now', handleAiSchedulerRunNow);
router.post('/admin/ai/auto-gen/run-now', handleAiSchedulerRunNow);

// POST /admin/trigger-cron - Test background jobs
const handleTriggerCron = async (req, res) => {
  try {
    const { action } = req.body;
    if (action === 'publish_scheduled') {
      await publishScheduledPosts();
    } else if (action === 'send_digest') {
      await sendWeeklyNewsletterDigest();
    } else if (action === 'run_auto_blog') {
      await aiScheduler.executeAutoGeneration({ force: true });
    }
    res.json({ success: true, message: `Cron task '${action}' executed successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
router.post('/trigger-cron', handleTriggerCron);
router.post('/cron/trigger', handleTriggerCron);



// ====================================================================
// PROJECTS PORTFOLIO MANAGEMENT
// ====================================================================

// GET /admin/projects - List All Projects
router.get('/projects', async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = {};
    if (category && category !== 'All') where.category = category;
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { summary: { contains: search.trim() } },
        { industry: { contains: search.trim() } }
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: [
        { featured: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    const allProjects = await prisma.project.findMany({ select: { category: true } });
    const categories = ['All', ...new Set(allProjects.map(p => p.category).filter(Boolean))];

    res.render('admin/projects/index', {
      projects,
      categories,
      selectedCategory: category || 'All',
      searchQuery: search || '',
      success: req.query.saved === '1'
    });
  } catch (err) {
    console.error('[ADMIN PROJECTS ERROR]', err);
    res.status(500).send('Error loading projects');
  }
});

// GET /admin/projects/new - Create Project Form
router.get('/projects/new', (req, res) => {
  res.render('admin/projects/edit', {
    project: null,
    categories: ['Automotive', 'IoT', 'Industrial', 'Edge AI', 'Healthcare', 'Firmware']
  });
});

// POST /admin/projects/new - Save Project
router.post('/projects/new', async (req, res) => {
  try {
    const {
      title, category, industry, client, summary, contentMarkdown,
      videoUrl, coverImage, techStack, specsJson, metricsJson, featured, order, status
    } = req.body;

    const cleanTitle = (title || 'Untitled Project').trim();
    const slug = slugify(cleanTitle, { lower: true, strict: true }) || 'project-' + Date.now();
    const descriptionHtml = renderMarkdown(contentMarkdown || '');

    await prisma.project.create({
      data: {
        title: cleanTitle,
        slug,
        category: category || 'Automotive',
        industry: industry || 'Engineering',
        client: client || 'Confidential OEM',
        summary: summary || '',
        descriptionMarkdown: contentMarkdown || '',
        descriptionHtml,
        coverImage: coverImage || '/assets/images/mission1.svg',
        videoUrl: formatYouTubeEmbedUrl(videoUrl) || null,
        techStack: techStack || 'STM32, FreeRTOS',
        specs: specsJson || null,
        metrics: metricsJson || null,
        featured: featured === 'true' || featured === 'on' || featured === 1,
        order: parseInt(order) || 0,
        status: status || 'completed'
      }
    });

    res.redirect('/admin/projects?saved=1');
  } catch (err) {
    console.error('[PROJECT CREATE ERROR]', err);
    if (err instanceof YouTubeUrlError) return res.status(400).send(err.message);
    res.status(500).send('Error creating project: ' + err.message);
  }
});

// GET /admin/projects/:id/edit - Edit Project Form
router.get('/projects/:id/edit', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });
    if (!project) return res.status(404).send('Project not found');

    res.render('admin/projects/edit', {
      project,
      categories: ['Automotive', 'IoT', 'Industrial', 'Edge AI', 'Healthcare', 'Firmware']
    });
  } catch (err) {
    res.status(500).send('Error loading project');
  }
});

// POST /admin/projects/:id/edit - Update Project
router.post('/projects/:id/edit', async (req, res) => {
  try {
    const {
      title, slug, category, industry, client, summary, contentMarkdown,
      videoUrl, coverImage, techStack, specsJson, metricsJson, featured, order, status
    } = req.body;

    const cleanTitle = (title || 'Untitled Project').trim();
    const cleanSlug = slugify(slug || cleanTitle, { lower: true, strict: true });
    const descriptionHtml = renderMarkdown(contentMarkdown || '');

    await prisma.project.update({
      where: { id: req.params.id },
      data: {
        title: cleanTitle,
        slug: cleanSlug,
        category: category || 'Automotive',
        industry: industry || 'Engineering',
        client: client || 'Confidential OEM',
        summary: summary || '',
        descriptionMarkdown: contentMarkdown || '',
        descriptionHtml,
        coverImage: coverImage || null,
        videoUrl: formatYouTubeEmbedUrl(videoUrl) || null,
        techStack: techStack || 'STM32, FreeRTOS',
        specs: specsJson || null,
        metrics: metricsJson || null,
        featured: featured === 'true' || featured === 'on' || featured === 1,
        order: parseInt(order) || 0,
        status: status || 'completed'
      }
    });

    res.redirect('/admin/projects?saved=1');
  } catch (err) {
    console.error('[PROJECT UPDATE ERROR]', err);
    if (err instanceof YouTubeUrlError) return res.status(400).send(err.message);
    res.status(500).send('Error updating project: ' + err.message);
  }
});

// POST /admin/projects/:id/delete - Delete Project
router.post('/projects/:id/delete', async (req, res) => {
  try {
    await prisma.project.delete({
      where: { id: req.params.id }
    });
    res.redirect('/admin/projects?deleted=1');
  } catch (err) {
    res.status(500).send('Error deleting project');
  }
});

// POST /admin/projects/:id/toggle-featured - Quick Toggle Featured Status
router.post('/projects/:id/toggle-featured', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    });
    if (!project) return res.status(404).json({ success: false, message: 'Not found' });

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { featured: !project.featured }
    });
    res.json({ success: true, featured: updated.featured });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// WEBSITE LIVE CUSTOMIZER
// ====================================================================

// GET /admin/customizer - Website Section & Copy Manager
router.get('/customizer', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const map = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    res.render('admin/customizer', {
      settings: map,
      success: req.query.saved === '1'
    });
  } catch (err) {
    console.error('[CUSTOMIZER ERROR]', err);
    res.status(500).send('Error loading customizer');
  }
});

// POST /admin/customizer - Save Website Customizer Settings
router.post('/customizer', async (req, res) => {
  try {
    const fields = req.body;
    for (const key of Object.keys(fields)) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: fields[key] },
        create: { key, value: fields[key] }
      });
    }
    clearSettingsCache();
    res.redirect('/admin/customizer?saved=1');
  } catch (err) {
    res.status(500).send('Error saving customizer');
  }
});

// ====================================================================
// AI CASE STUDY & SEO ENDPOINTS
// ====================================================================

// POST /admin/ai/project-draft - Generate Structured Case Study with AI
router.post('/ai/project-draft', async (req, res) => {
  try {
    const result = await aiGenerator.generateProjectCaseStudy(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
});

// POST /admin/ai/optimize-seo - Generate High CTR Meta Tags with AI
router.post('/ai/optimize-seo', async (req, res) => {
  try {
    const result = await aiGenerator.optimizeSeo(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, message: err.message });
  }
});


// ====================================================================
// TESTIMONIALS & CUSTOMER REVIEWS CRUD
// ====================================================================

// GET /admin/testimonials - List testimonials
router.get('/testimonials', requireAuth, async (req, res) => {
  try {
    const testimonials = await prisma.testimonial.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.render('admin/testimonials/index', {
      testimonials,
      currentPath: '/admin/testimonials'
    });
  } catch (err) {
    console.error('Error fetching testimonials:', err);
    res.render('admin/testimonials/index', {
      testimonials: [],
      currentPath: '/admin/testimonials'
    });
  }
});

// GET /admin/testimonials/new - Create new form
router.get('/testimonials/new', requireAuth, (req, res) => {
  res.render('admin/testimonials/edit', {
    testimonial: null,
    currentPath: '/admin/testimonials'
  });
});

// POST /admin/testimonials - Create testimonial
router.post('/testimonials', requireAuth, async (req, res) => {
  try {
    const { name, role, company, quote, rating, isApproved } = req.body;
    if (!name || !role || !quote) {
      return res.status(400).send('Name, role, and quote are required.');
    }
    await prisma.testimonial.create({
      data: {
        name: String(name).trim().substring(0, 100),
        role: String(role).trim().substring(0, 150),
        company: company ? String(company).trim().substring(0, 100) : null,
        quote: String(quote).trim().substring(0, 1000),
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
        isApproved: isApproved === 'true' || isApproved === '1' || isApproved === true,
        source: 'admin'
      }
    });
    res.redirect('/admin/testimonials');
  } catch (err) {
    console.error('Error creating testimonial:', err);
    res.status(500).send('Error creating testimonial: ' + err.message);
  }
});

// GET /admin/testimonials/:id/edit - Edit form
router.get('/testimonials/:id/edit', requireAuth, async (req, res) => {
  try {
    const testimonial = await prisma.testimonial.findUnique({
      where: { id: req.params.id }
    });
    if (!testimonial) {
      return res.redirect('/admin/testimonials');
    }
    res.render('admin/testimonials/edit', {
      testimonial,
      currentPath: '/admin/testimonials'
    });
  } catch (err) {
    console.error('Error fetching testimonial for edit:', err);
    res.redirect('/admin/testimonials');
  }
});

// POST /admin/testimonials/:id - Update testimonial
router.post('/testimonials/:id', requireAuth, async (req, res) => {
  try {
    const { name, role, company, quote, rating, isApproved } = req.body;
    await prisma.testimonial.update({
      where: { id: req.params.id },
      data: {
        name: String(name).trim().substring(0, 100),
        role: String(role).trim().substring(0, 150),
        company: company ? String(company).trim().substring(0, 100) : null,
        quote: String(quote).trim().substring(0, 1000),
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
        isApproved: isApproved === 'true' || isApproved === '1' || isApproved === true
      }
    });
    res.redirect('/admin/testimonials');
  } catch (err) {
    console.error('Error updating testimonial:', err);
    res.status(500).send('Error updating testimonial: ' + err.message);
  }
});

// POST /admin/testimonials/:id/toggle-approve - Toggle approval
router.post('/testimonials/:id/toggle-approve', requireAuth, async (req, res) => {
  try {
    const item = await prisma.testimonial.findUnique({
      where: { id: req.params.id }
    });
    if (item) {
      await prisma.testimonial.update({
        where: { id: req.params.id },
        data: { isApproved: !item.isApproved }
      });
    }
    res.redirect('/admin/testimonials');
  } catch (err) {
    console.error('Error toggling approval:', err);
    res.redirect('/admin/testimonials');
  }
});

// POST /admin/testimonials/:id/delete - Delete testimonial
router.post('/testimonials/:id/delete', requireAuth, async (req, res) => {
  try {
    await prisma.testimonial.delete({
      where: { id: req.params.id }
    });
    res.redirect('/admin/testimonials');
  } catch (err) {
    console.error('Error deleting testimonial:', err);
    res.redirect('/admin/testimonials');
  }
});

module.exports = router;
