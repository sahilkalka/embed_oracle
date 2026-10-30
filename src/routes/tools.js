// src/routes/tools.js
const express = require('express');
const router = express.Router();
const prisma = require('../services/db');
const toolsRegistry = require('../data/toolsRegistry');

// Helper to track tool usage via write-behind batching
function incrementToolStat(toolName) {
  try {
    if (typeof prisma.incrementToolExecution === 'function') {
      prisma.incrementToolExecution(toolName);
      return;
    }
    const normalizedName = String(toolName || "").toLowerCase().trim();
    if (!normalizedName) return;
    prisma.calculatorStat.findFirst({ where: { toolName: normalizedName } }).then(stat => {
      if (stat) {
        return prisma.calculatorStat.update({ where: { id: stat.id }, data: { executionCount: { increment: 1 } } });
      }
      return prisma.calculatorStat.create({ data: { toolName: normalizedName, executionCount: 1 } });
    }).catch(() => {});
  } catch (err) {
    // Fail-open for stat logging
  }
}

// Helper to configure SEO and JSON-LD schema
function applyToolSeo(res, category, tool) {
  const canonicalUrl = `https://embeddedindia.in/tools/${category.slug}/${tool.slug}`;
  res.locals.seo = res.locals.seo || {};
  res.locals.seo.title = tool.metaTitle || `${tool.title} | ${category.title} | Embedded India`;
  res.locals.seo.description = tool.metaDescription || tool.description;
  res.locals.seo.canonical = canonicalUrl;
  res.locals.seo.keywords = (tool.keywords || []).join(', ');
  
  res.locals.seo.structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.title,
    description: tool.description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    url: canonicalUrl
  };
}

// Allow edge/browser caching in production while keeping instant reload in dev/test
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  } else {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.set('Pragma', 'no-cache');
  }
  res.set('X-Tools-Engine', 'v2-hubs-38');
  next();
});

// 1. Landing Page: Displays 8 Dedicated Category Hub Tiles
router.get('/', (req, res) => {
  const categories = toolsRegistry.getAllCategories();
  res.locals.seo = res.locals.seo || {};
  res.locals.seo.title = `Interactive Engineering & Developer Tools Suite (${categories.length} Hubs) | Embedded India`;
  res.locals.seo.description = `Explore ${res.app.locals.totalTools} precision client-side calculators, circuit analyzers, data formatters, and webmaster diagnostics engineered for hardware and firmware designers.`;
  res.locals.seo.canonical = 'https://embeddedindia.in/tools';

  res.render('pages/tools/index', {
    categories
  });
});

// 2. Category Hub & Single Parameter Route (handles /:groupSlug, legacy redirects, and ?tool=)
router.get('/:groupSlug', (req, res, next) => {
  const param = req.params.groupSlug;

  // Check 1: Backward compatibility for legacy flat tool URLs (e.g. /tools/pcb-trace -> 301)
  const legacyRedirect = toolsRegistry.getLegacyRedirect(param);
  if (legacyRedirect) {
    const redirectUrl = typeof legacyRedirect === 'string' 
      ? legacyRedirect 
      : `/tools/${legacyRedirect.groupSlug}/${legacyRedirect.toolSlug}`;
    return res.redirect(301, redirectUrl);
  }

  // Check 2: Verify if param is a valid category slug
  const category = toolsRegistry.getCategoryBySlug(param);
  if (!category) {
    return next();
  }

  // Support ?tool=toolSlug deep linking or default to first tool in category
  const requestedToolSlug = req.query.tool;
  let activeTool = category.tools[0] || null;
  if (requestedToolSlug) {
    const match = category.tools.find(t => t.slug === requestedToolSlug);
    if (match) activeTool = match;
  }

  if (activeTool) {
    incrementToolStat(activeTool.slug);
    applyToolSeo(res, category, activeTool);
  } else {
    res.locals.seo = res.locals.seo || {};
    res.locals.seo.title = `${category.title} | Embedded India Tools`;
    res.locals.seo.description = category.description;
    res.locals.seo.canonical = `https://embeddedindia.in/tools/${category.slug}`;
  }

  res.render('pages/tools/category', {
    category,
    activeTool
  });
});

// 3. Deep-linked Canonical Tool URL: /tools/:groupSlug/:toolSlug
router.get('/:groupSlug/:toolSlug', (req, res, next) => {
  const { groupSlug, toolSlug } = req.params;

  const category = toolsRegistry.getCategoryBySlug(groupSlug);
  if (!category) {
    return next();
  }

  const activeTool = category.tools.find(t => t.slug === toolSlug);
  if (!activeTool) {
    // If the tool belongs to another category, 301 redirect to correct category
    const anyTool = toolsRegistry.getToolBySlug(toolSlug);
    if (anyTool) {
      return res.redirect(301, `/tools/${anyTool.groupSlug}/${anyTool.slug}`);
    }
    return next();
  }

  incrementToolStat(activeTool.slug);
  applyToolSeo(res, category, activeTool);

  res.render('pages/tools/category', {
    category,
    activeTool
  });
});

module.exports = router;
