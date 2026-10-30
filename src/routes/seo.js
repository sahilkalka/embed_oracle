// src/routes/seo.js
const express = require('express');
const router = express.Router();
const prisma = require('../services/db');
const toolsRegistry = require('../data/toolsRegistry');

// Public canonical URLs are generated from the same registries and records as the site.
// Settings tabs and other authenticated routes do not belong in the public sitemap.
const servicesData = require('../data/servicesData');
function sitemapDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
router.get('/sitemap.xml', async (req, res) => {
  try {
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const [posts, projects] = await Promise.all([
      prisma.post.findMany({ where: { status: 'published' }, select: { slug: true, updatedAt: true } }),
      prisma.project.findMany({ select: { slug: true, updatedAt: true } })
    ]);
    const pages = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/services', priority: '0.9', changefreq: 'weekly' },
      { path: '/about', priority: '0.8', changefreq: 'monthly' },
      { path: '/projects', priority: '0.8', changefreq: 'weekly' },
      { path: '/blogs', priority: '0.9', changefreq: 'daily' },
      { path: '/contact', priority: '0.8', changefreq: 'monthly' },
      { path: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
      { path: '/tools', priority: '0.9', changefreq: 'weekly' },
      ...Object.values(servicesData).map(service => ({ path: '/services/' + encodeURIComponent(service.slug), priority: '0.8', changefreq: 'weekly' })),
      ...toolsRegistry.TOOL_CATEGORIES.map(category => ({ path: '/tools/' + encodeURIComponent(category.slug), priority: '0.85', changefreq: 'weekly' })),
      ...toolsRegistry.TOOLS.map(tool => ({ path: '/tools/' + encodeURIComponent(tool.groupSlug) + '/' + encodeURIComponent(tool.slug), priority: '0.8', changefreq: 'weekly' })),
      ...posts.filter(post => post.slug).map(post => ({ path: '/blogs/' + encodeURIComponent(post.slug), lastmod: sitemapDate(post.updatedAt), priority: '0.8', changefreq: 'weekly' })),
      ...projects.filter(project => project.slug).map(project => ({ path: '/projects/' + encodeURIComponent(project.slug), lastmod: sitemapDate(project.updatedAt), priority: '0.8', changefreq: 'monthly' }))
    ];
    const seen = new Set();
    const entries = pages.filter(page => !seen.has(page.path) && seen.add(page.path)).map(page =>
      '  <url><loc>' + escapeXml(appUrl + page.path) + '</loc>' +
      (page.lastmod ? '<lastmod>' + page.lastmod + '</lastmod>' : '') +
      '<changefreq>' + page.changefreq + '</changefreq><priority>' + page.priority + '</priority></url>'
    );
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join('\n') + '\n</urlset>';
    res.set('Cache-Control', 'no-cache').type('application/xml').send(xml);
  } catch (err) {
    console.error('[SITEMAP ERROR]', err);
    res.status(500).send('Error generating sitemap');
  }
});

// Dynamic robots.txt
router.get('/robots.txt', (req, res) => {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const customRobots = res.locals.settings?.robots_txt_custom;
  if (customRobots && customRobots.trim()) {
    res.header('Content-Type', 'text/plain; charset=utf-8');
    return res.send(customRobots.trim() + '\n');
  }

  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /auth/

Sitemap: ${appUrl}/sitemap.xml
`;
  res.header('Content-Type', 'text/plain');
  res.send(robots);
});

// Dynamic /ads.txt (IAB / Multi-Provider Ad Engine Validation)
router.get('/ads.txt', async (req, res) => {
  try {
    const customAdsTxt = res.locals.settings?.ads_txt_content;
    if (customAdsTxt && customAdsTxt.trim()) {
      res.header('Content-Type', 'text/plain; charset=utf-8');
      return res.send(customAdsTxt.trim() + '\n');
    }

    const fs = require('fs');
    const path = require('path');
    const adsTxtPath = path.join(__dirname, '../../public/ads.txt');
    if (fs.existsSync(adsTxtPath)) {
      res.header('Content-Type', 'text/plain; charset=utf-8');
      return res.send(fs.readFileSync(adsTxtPath, 'utf8'));
    }

    const setting = await prisma.setting.findUnique({ where: { key: 'adsense_pub_id' } });
    let pubId = 'pub-2644536267352236';
    if (setting && setting.value) {
      pubId = setting.value.trim().replace(/^ca-/, '');
    }
    const content = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
    res.header('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err) {
    res.header('Content-Type', 'text/plain; charset=utf-8');
    res.send('google.com, pub-2644536267352236, DIRECT, f08c47fec0942fa0\n');
  }
});

// Dynamic OpenGraph Social Image Generator (/api/og)
router.get('/api/og', (req, res) => {
  const title = (req.query.title || 'Embedded System Design & Development').slice(0, 90);
  const category = (req.query.category || 'Embedded India | Engineering Hub').slice(0, 40);

  // High-resolution 1200x630 SVG with Dark Slate & Emerald Green branding
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0d1715"/>
        <stop offset="50%" stop-color="#182c27"/>
        <stop offset="100%" stop-color="#004d3a"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#007f5f"/>
        <stop offset="100%" stop-color="#55a630"/>
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1.5" fill="#55a630" opacity="0.2"/>
        <line x1="0" y1="20" x2="40" y2="20" stroke="#007f5f" stroke-width="0.5" opacity="0.1"/>
        <line x1="20" y1="0" x2="20" y2="40" stroke="#007f5f" stroke-width="0.5" opacity="0.1"/>
      </pattern>
    </defs>

    <!-- Background -->
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#grid)"/>

    <!-- Circuit Trace Accents -->
    <path d="M 60,100 L 220,100 L 260,140 L 400,140" stroke="#55a630" stroke-width="3" fill="none" opacity="0.6"/>
    <circle cx="400" cy="140" r="6" fill="#80b918"/>
    <path d="M 800,520 L 960,520 L 1000,480 L 1140,480" stroke="#007f5f" stroke-width="3" fill="none" opacity="0.6"/>
    <circle cx="800" cy="520" r="6" fill="#007f5f"/>

    <!-- Category Pill -->
    <rect x="80" y="80" width="340" height="46" rx="23" fill="#007f5f" opacity="0.9"/>
    <text x="100" y="110" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#ffffff" letter-spacing="1">${escapeXml(category.toUpperCase())}</text>

    <!-- Post Title -->
    <foreignObject x="80" y="170" width="1040" height="300">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; font-size: 54px; font-weight: 800; color: #ffffff; line-height: 1.25; text-shadow: 0 4px 12px rgba(0,0,0,0.4);">
        ${escapeXml(title)}
      </div>
    </foreignObject>

    <!-- Bottom Brand Bar -->
    <rect x="0" y="580" width="1200" height="50" fill="#13221f"/>
    <line x1="0" y1="580" x2="1200" y2="580" stroke="url(#accent)" stroke-width="4"/>

    <text x="80" y="612" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" fill="#ffffff">
      EMBEDDED <tspan fill="#55a630">INDIA</tspan>
    </text>
    <text x="320" y="610" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="500" fill="#94a3b8">
      Think Big. We Do! | embeddedindia.in
    </text>
    <text x="1000" y="610" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#80b918">
      ENGINEERING HUB
    </text>
  </svg>`;

  res.header('Content-Type', 'image/svg+xml');
  res.header('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

module.exports = router;
