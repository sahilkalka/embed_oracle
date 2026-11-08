// src/middleware/seo.js
const { parseFaqs } = require('../services/faqs');
const { canShowAd } = require('../services/ads');
const prisma = require('../services/db');
const { resolveTheme } = require('../services/themeEngine');
const colorThemes = require('../data/colorThemes');

// Cache settings and pre-parsed derivatives in memory with a 60s TTL
let cachedSettings = null;
let cachedDerivatives = null;
let lastSettingsFetch = 0;
const cacheClearListeners = new Set();

function buildDerivatives(settings) {
  let routeOverrides = null;
  if (settings.seo_route_overrides) {
    try {
      routeOverrides = JSON.parse(settings.seo_route_overrides);
    } catch (_) {
      routeOverrides = null;
    }
  }

  let customFaqs = [];
  try {
    customFaqs = parseFaqs(settings.custom_faqs);
  } catch (_) {
    customFaqs = [];
  }

  const unifiedSettings = {
    ...settings,
    active_theme_palette: settings.active_theme_palette || 'cyber-emerald'
  };
  const publicTheme = resolveTheme(unifiedSettings);
  const adminTheme = resolveTheme(unifiedSettings);

  return {
    routeOverrides,
    customFaqs,
    publicTheme,
    adminTheme
  };
}

async function getSettings() {
  const now = Date.now();
  if (!cachedSettings || now - lastSettingsFetch > 60000) {
    try {
      const records = await prisma.setting.findMany();
      cachedSettings = records.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      if (!cachedSettings.phone_number && !cachedSettings.contact_phone) {
        cachedSettings.phone_number = '+91 83285 14090';
        cachedSettings.contact_phone = '+91 83285 14090';
      } else {
        cachedSettings.phone_number = cachedSettings.phone_number || cachedSettings.contact_phone;
        cachedSettings.contact_phone = cachedSettings.contact_phone || cachedSettings.phone_number;
      }
      if (!cachedSettings.whatsapp_number) {
        cachedSettings.whatsapp_number = cachedSettings.phone_number || '+91 83285 14090';
      }
      if (cachedSettings.phone_visible === undefined) {
        cachedSettings.phone_visible = '1';
      }
      if (cachedSettings.email_visible === undefined) {
        cachedSettings.email_visible = '1';
      }
      cachedSettings.delivered_systems = cachedSettings.delivered_systems || '150+';
      cachedSettings.hil_rate = cachedSettings.hil_rate || '98%';
      cachedSettings.response_sla = cachedSettings.response_sla || '<24h';
      cachedDerivatives = buildDerivatives(cachedSettings);
      lastSettingsFetch = now;
    } catch (e) {
      cachedSettings = cachedSettings || {};
      cachedDerivatives = cachedDerivatives || buildDerivatives(cachedSettings);
    }
  }
  return cachedSettings;
}

async function seoMiddleware(req, res, next) {
  const settings = await getSettings();
  const derivatives = cachedDerivatives || buildDerivatives(settings);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const canonicalUrl = `${appUrl}${req.path}`;
  const currentPath = (req.originalUrl || req.path).split('?')[0];

  const isAdminRoute = currentPath.startsWith('/admin');
  const theme = isAdminRoute ? derivatives.adminTheme : derivatives.publicTheme;

  // Default SEO meta object
  const defaultTitle = settings.site_title_default || 'Freelance Embedded Hardware, Firmware, UI/HMI & Prototype Testing Services';
  const siteName = settings.site_name || 'Embedded India';
  const siteDescription = settings.site_description_default || 'A collective of freelance embedded engineering specialists providing design, development, testing, and prototyping: hardware design, deterministic RTOS firmware, TouchGFX & Qt UI/HMI, and bench testing on fixed bid and hourly/daily rates.';
  const defaultKeywords = settings.site_keywords_default || 'freelance embedded engineer, embedded hardware design, firmware development, TouchGFX STM32, Qt QML embedded, prototype testing, HIL verification, fixed bid embedded, per hour engineer billing, per day engineer rate';

  res.locals.seo = {
    robots: isAdminRoute ? 'noindex, nofollow' : 'index, follow',
    title: defaultTitle,
    siteName: siteName,
    description: siteDescription,
    keywords: defaultKeywords,
    canonical: canonicalUrl,
    ogImage: `${appUrl}/api/og?title=${encodeURIComponent(defaultTitle)}`,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteName,
      url: appUrl,
      logo: `${appUrl}/assets/images/logo.svg`,
      description: 'Full-Cycle Embedded Product Engineering, Hardware Design, and Firmware Solutions.',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IN',
        streetAddress: settings.contact_address || 'Hyderabad, India'
      },
      contactPoint: {
        '@type': 'ContactPoint',
        email: settings.contact_email || 'info@embeddedindia.in',
        ...(settings.phone_visible !== '0' && settings.phone_visible !== 'false' && settings.phone_visible !== false && settings.phone_visible !== 0
          ? { telephone: settings.contact_phone || '+91 83285 14090' }
          : {}),
        contactType: 'Customer Service'
      }
    }
  };

  // Apply pre-parsed Route-Specific SEO Overrides
  if (derivatives.routeOverrides && derivatives.routeOverrides[currentPath]) {
    const routeMeta = derivatives.routeOverrides[currentPath];
    if (routeMeta.robots) res.locals.seo.robots = routeMeta.robots;
    if (routeMeta.title) res.locals.seo.title = routeMeta.title;
    if (routeMeta.description) res.locals.seo.description = routeMeta.description;
    if (routeMeta.keywords) res.locals.seo.keywords = routeMeta.keywords;
    if (routeMeta.ogImage) res.locals.seo.ogImage = routeMeta.ogImage;
    if (routeMeta.canonical) res.locals.seo.canonical = routeMeta.canonical;
    if (routeMeta.structuredData) res.locals.seo.structuredData = routeMeta.structuredData;
  }

  res.locals.customFaqs = derivatives.customFaqs;
  res.locals.colorThemes = colorThemes;
  res.locals.canShowAd = canShowAd;
  res.locals.settings = settings;
  res.locals.theme = theme;
  res.locals.currentPath = currentPath;
  res.locals.appUrl = appUrl;
  res.locals.assetVersion = req.app.locals.assetVersion || '20261028-v1';

  next();
}

function clearSettingsCache() {
  cachedSettings = null;
  cachedDerivatives = null;
  lastSettingsFetch = 0;
  for (const listener of cacheClearListeners) {
    try { listener(); } catch (_) {}
  }
}

function onClearSettingsCache(fn) {
  if (typeof fn === 'function') {
    cacheClearListeners.add(fn);
  }
}

module.exports = {
  seoMiddleware,
  getSettings,
  clearSettingsCache,
  onClearSettingsCache
};
