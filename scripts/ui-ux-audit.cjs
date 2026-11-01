/*
 * Headless UI/UX audit: contrast (light/dark, all palettes), overflow/clipping,
 * typography and link integrity for the public site and the admin dashboard.
 *
 * Usage: node scripts/ui-ux-audit.cjs [--label=name] [--only=contrast|layout|links]
 *        [--route=/path] [--palettes=all] [--concurrency=4] [--screens]
 * Output: scratch/ui-ux-audit/<label>/{results.json,summary.md}
 */
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

process.env.NODE_ENV = 'test';

const app = require('../src/server');
const prisma = require('../src/services/db');
const toolsRegistry = require('../src/data/toolsRegistry');
const colorThemes = require('../src/data/colorThemes');
const { JWT_SECRET } = require('../src/middleware/auth');

// Keep the audit read-only.
prisma.analytics.create = async () => ({});
prisma.incrementToolExecution = () => {};
prisma.incrementPostView = () => {};

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.length ? value.join('=') : 'true'];
}));

const LABEL = args.label || new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.resolve(__dirname, '../scratch/ui-ux-audit', LABEL);
const CONCURRENCY = Number(args.concurrency || 4);
const VIEWPORTS = [
  { name: '375', width: 375, height: 812, isMobile: true },
  { name: '768', width: 768, height: 1024, isMobile: false },
  { name: '1280', width: 1280, height: 800, isMobile: false },
  { name: '1920', width: 1920, height: 1080, isMobile: false }
];
const CONTRAST_VIEWPORTS = new Set(['375', '1280']);
const MODES = ['light', 'dark'];
const DEFAULT_PALETTE = 'cyber-emerald';
const PALETTE_SAMPLE_ROUTES = ['/', '/blogs', '/tools', '/contact', '/admin/login', '/admin', '/admin/settings', '/admin/posts', '/admin/traffic'];
const SKIP_LINK_CHECK = /\/(logout|delete|remove|destroy|unsubscribe)(\/|$|\?)/i;

async function buildRoutes() {
  const routes = [
    '/', '/about', '/contact', '/services', '/services/embedded-ui-hmi-development', '/privacy',
    '/submit-review', '/projects', '/blogs', '/tools'
  ].map(p => ({ path: p, access: 'public' }));

  for (const category of toolsRegistry.getAllCategories()) {
    routes.push({ path: `/tools/${category.slug}`, access: 'public' });
    for (const tool of category.tools) routes.push({ path: `/tools/${category.slug}/${tool.slug}`, access: 'public' });
  }

  const [post, project, anyPost, anyProject, testimonial] = await Promise.all([
    prisma.post.findFirst({ where: { status: 'published' }, select: { slug: true } }),
    prisma.project.findFirst({ select: { slug: true } }),
    prisma.post.findFirst({ select: { id: true } }),
    prisma.project.findFirst({ select: { id: true } }),
    prisma.testimonial.findFirst({ select: { id: true } })
  ]);
  if (post) routes.push({ path: `/blogs/${encodeURIComponent(post.slug)}`, access: 'public' });
  if (project) routes.push({ path: `/projects/${encodeURIComponent(project.slug)}`, access: 'public' });

  routes.push({ path: '/admin/login', access: 'public' });
  for (const p of ['/admin', '/admin/assets', '/admin/traffic', '/admin/inquiries', '/admin/subscribers', '/admin/posts',
    '/admin/posts/new', '/admin/projects', '/admin/projects/new', '/admin/customizer', '/admin/testimonials', '/admin/testimonials/new']) {
    routes.push({ path: p, access: 'admin' });
  }
  routes.push({ path: '/admin/settings', access: 'admin', tabs: true });
  if (anyPost) routes.push({ path: `/admin/posts/${encodeURIComponent(anyPost.id)}/edit`, access: 'admin' });
  if (anyProject) routes.push({ path: `/admin/projects/${encodeURIComponent(anyProject.id)}/edit`, access: 'admin' });
  if (testimonial) routes.push({ path: `/admin/testimonials/${encodeURIComponent(testimonial.id)}/edit`, access: 'admin' });
  return routes;
}

function adminCookie(baseUrl) {
  const token = jwt.sign({ userId: 'ui-ux-audit', email: 'audit@example.test', username: 'UI Audit', role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
  return { name: 'admin_token', value: token, url: baseUrl, httpOnly: true, sameSite: 'Lax' };
}

/* Runs inside the page: layout, typography, non-text contrast and link collection. */
function inPageAudit(opts) {
  const out = { overflow: [], clipped: [], truncated: [], typography: [], fonts: {}, nonText: [], links: [], linkIssues: [] };
  const vw = document.documentElement.clientWidth;
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/i;

  const describe = el => {
    if (!el || el === document.documentElement) return 'html';
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = [...el.classList].filter(c => !/[:\[\]\/]/.test(c)).slice(0, 3).join('.');
    if (cls) s += '.' + cls;
    const parent = el.parentElement;
    return (parent && parent !== document.body ? describe(parent).split(' > ').slice(-1)[0] + ' > ' : '') + s;
  };
  const visible = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('[hidden],[aria-hidden="true"],dialog:not([open]),template,.sr-only')) return false;
    // Clipped to nothing (sr-only patterns).
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return false;
    return true;
  };
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  const isIconFont = cs => /material|symbols|icons|fontawesome|font awesome/i.test(cs.fontFamily);

  const all = [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'path', 'BR'].includes(el.tagName));

  // Overflow / bleed: element visibly crosses the viewport edge without a clipping ancestor.
  const clipsX = el => { const o = getComputedStyle(el).overflowX; return o !== 'visible'; };
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && (el.getBoundingClientRect().left >= vw || el.getBoundingClientRect().right <= 0)) continue;
    const r = el.getBoundingClientRect();
    const crosses = (r.right > vw + 1 && r.left < vw - 1) || (r.left < -1 && r.right > 1);
    if (crosses) {
      let a = el.parentElement, clipped = false;
      while (a && a !== document.documentElement) {
        if (a !== document.body && clipsX(a)) {
          const ar = a.getBoundingClientRect();
          if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; }
        }
        a = a.parentElement;
      }
      if (!clipped) out.overflow.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), vw });
    }
    // Text clipping inside its own box.
    const text = ownText(el) || (el.children.length === 0 ? el.textContent.trim() : '');
    if (text && !isIconFont(cs) && ['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      const entry = { el: describe(el), text: text.slice(0, 60), scroll: el.scrollWidth, client: el.clientWidth };
      if (cs.textOverflow === 'ellipsis') out.truncated.push(entry); else out.clipped.push(entry);
    }
    if (text && !isIconFont(cs) && ['hidden', 'clip'].includes(cs.overflowY) && cs.webkitLineClamp === 'none' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      out.clipped.push({ el: describe(el), text: text.slice(0, 60), axis: 'y', scroll: el.scrollHeight, client: el.clientHeight });
    }
  }

  // Typography.
  const stacks = new Map();
  for (const el of all) {
    const text = ownText(el);
    if (!text || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (isIconFont(cs) || ['SUP', 'SUB'].includes(el.tagName)) continue;
    // SVG text is specified in user units; convert to rendered CSS pixels.
    const svgScale = el instanceof SVGGraphicsElement && el.getScreenCTM() ? Math.hypot(el.getScreenCTM().a, el.getScreenCTM().b) : 1;
    const size = parseFloat(cs.fontSize) * svgScale;
    const lh = cs.lineHeight === 'normal' ? size * 1.2 : parseFloat(cs.lineHeight) * svgScale;
    const key = cs.fontFamily;
    stacks.set(key, (stacks.get(key) || 0) + 1);
    if (size < 12) out.typography.push({ kind: 'font-size<12px', el: describe(el), text: text.slice(0, 40), size });
    const lines = Math.round(el.getBoundingClientRect().height / lh);
    if (lines >= 2 && !(el instanceof SVGElement) && lh / size < 1.2) out.typography.push({ kind: 'line-height<1.2 (multi-line)', el: describe(el), text: text.slice(0, 40), size, lineHeight: +(lh / size).toFixed(2) });
  }
  const canvas = document.createElement('canvas').getContext('2d');
  const available = family => {
    const sample = 'mmmmmmmmmmlli1WQ@#';
    return ['monospace', 'serif'].some(base => {
      canvas.font = `72px ${base}`; const w1 = canvas.measureText(sample).width;
      canvas.font = `72px ${family}, ${base}`; const w2 = canvas.measureText(sample).width;
      return Math.abs(w1 - w2) > 0.5;
    });
  };
  for (const [stack, count] of stacks) {
    const families = stack.split(',').map(f => f.trim());
    const first = families[0];
    out.fonts[stack] = {
      count,
      first,
      firstAvailable: GENERIC.test(first.replace(/["']/g, '')) || available(first),
      rendered: families.find(f => GENERIC.test(f.replace(/["']/g, '')) || available(f)) || null,
      genericFallback: GENERIC.test(families[families.length - 1].replace(/["']/g, ''))
    };
  }
  const icons = document.querySelector('.material-symbols-rounded, .material-symbols-outlined, .material-icons');
  if (icons && visible(icons)) {
    const fam = getComputedStyle(icons).fontFamily.split(',')[0].trim();
    if (!available(fam)) out.typography.push({ kind: 'icon-font-not-loaded', el: describe(icons), text: icons.textContent.trim().slice(0, 30) });
  }

  // Non-text contrast (WCAG 1.4.11) for form controls and switches.
  const parse = c => {
    const srgb = c.match(/color\(srgb ([^)]+)\)/);
    if (srgb) { const p = srgb[1].split(/[ /]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgBehind = el => {
    const layers = [];
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) result = blend(layer, result);
    return result;
  };
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea, [role=switch]')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const parentBg = el.parentElement ? bgBehind(el.parentElement) : null;
    if (!parentBg) continue;
    const own = parse(cs.backgroundColor);
    const ownBg = own && own.a > 0 ? blend(own, parentBg) : parentBg;
    const border = parse(cs.borderTopColor);
    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const borderRatio = border && bw > 0 && border.a > 0 ? ratio(blend(border, parentBg), parentBg) : 1;
    const fillRatio = ratio(ownBg, parentBg);
    // A borderless control may rely on a tightly wrapping bordered container for its boundary.
    const wrapperOk = [el.parentElement, el.parentElement && el.parentElement.parentElement].some(w => {
      if (!w || !w.parentElement) return false;
      const ws = getComputedStyle(w);
      const wb = parse(ws.borderTopColor);
      const behind = bgBehind(w.parentElement);
      return behind && wb && wb.a > 0 && parseFloat(ws.borderTopWidth) > 0 && ratio(blend(wb, behind), behind) >= 3;
    });
    if (Math.max(borderRatio, fillRatio) < 3 && !wrapperOk) {
      out.nonText.push({ el: describe(el), borderRatio: +borderRatio.toFixed(2), fillRatio: +fillRatio.toFixed(2), border: cs.borderTopColor, background: cs.backgroundColor });
    }
  }

  // Links.
  const BAD = /(undefined|null|NaN|\[object|<%|%>|\$\{)/;
  for (const a of document.querySelectorAll('a, area')) {
    const raw = a.getAttribute('href');
    const label = (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const vis = visible(a);
    if (raw === null) {
      if (vis && a.tagName === 'A' && a.getAttribute('role') !== 'button' && a.getAttribute('aria-disabled') !== 'true') out.linkIssues.push({ kind: 'anchor-without-href', el: describe(a), label });
      continue;
    }
    const href = raw.trim();
    if (!href) { out.linkIssues.push({ kind: 'empty-href', el: describe(a), label }); continue; }
    if (/^(data|blob):/i.test(href)) continue;
    if (href === '#') { if (vis) out.linkIssues.push({ kind: 'dead-hash-href', el: describe(a), label }); continue; }
    if (/^javascript:/i.test(href)) { out.linkIssues.push({ kind: 'javascript-href', el: describe(a), label, href }); continue; }
    if (BAD.test(href) || /\s/.test(href)) { out.linkIssues.push({ kind: 'malformed-href', el: describe(a), label, href }); continue; }
    if (/^mailto:/i.test(href)) { if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(href)) out.linkIssues.push({ kind: 'malformed-mailto', el: describe(a), href }); continue; }
    if (/^tel:/i.test(href)) { if (!/\d{6,}/.test(href.replace(/\D/g, ''))) out.linkIssues.push({ kind: 'malformed-tel', el: describe(a), href }); continue; }
    if (/^(data|blob|whatsapp|sms):/i.test(href)) continue;
    let url;
    try { url = new URL(href, location.href); } catch { out.linkIssues.push({ kind: 'unparseable-href', el: describe(a), href }); continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (url.origin === location.origin && url.pathname === location.pathname && url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !document.getElementById(id) && !document.getElementsByName(id).length) out.linkIssues.push({ kind: 'missing-anchor-target', el: describe(a), href });
      continue;
    }
    if (a.target === '_blank' && !/noopener|noreferrer/.test(a.rel) && url.origin !== location.origin) out.linkIssues.push({ kind: 'blank-without-noopener', el: describe(a), href });
    url.hash = '';
    out.links.push({ url: url.href, internal: url.origin === location.origin, label });
  }
  return out;
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const step = innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(350);
}

async function runAxe(page) {
  const res = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const nodes = [];
  for (const v of res.violations) {
    for (const n of v.nodes) {
      const d = (n.any[0] && n.any[0].data) || {};
      nodes.push({ target: n.target.join(' '), html: n.html.slice(0, 160), fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, expected: d.expectedContrastRatio, fontSize: d.fontSize, fontWeight: d.fontWeight });
    }
  }
  const incomplete = res.incomplete.reduce((sum, v) => sum + v.nodes.length, 0);
  return { violations: nodes, incomplete };
}

async function auditJob(browser, baseUrl, cookie, job) {
  const { route, viewport, mode, palette, checks } = job;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.isMobile, deviceScaleFactor: 1, reducedMotion: 'reduce'
  });
  await context.addInitScript(([m, p]) => {
    try { localStorage.setItem('color-theme', m); localStorage.setItem('color-palette', p); } catch {}
  }, [mode, palette]);
  if (route.access === 'admin') await context.addCookies([cookie]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  const results = [];
  try {
    const response = await page.goto(baseUrl + route.path, { waitUntil: 'load', timeout: 45000 });
    const status = response ? response.status() : 0;
    if (route.access === 'admin' && new URL(page.url()).pathname.startsWith('/admin/login')) throw new Error('admin auth rejected');
    await settle(page);
    const tabs = route.tabs ? await page.locator('[data-settings-tab]').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('data-settings-tab')).filter(Boolean))]) : [null];
    for (const tab of tabs) {
      if (tab) { await page.locator(`[data-settings-tab="${tab}"]`).first().click().catch(() => {}); await page.waitForTimeout(350); }
      const r = { route: route.path + (tab ? '#' + tab : ''), access: route.access, viewport: viewport.name, mode, palette, status, consoleErrors: [...consoleErrors] };
      if (checks.includes('contrast')) r.contrast = await runAxe(page);
      if (checks.includes('layout') || checks.includes('links') || checks.includes('contrast')) {
        const dom = await page.evaluate(inPageAudit, {});
        if (checks.includes('layout')) Object.assign(r, { overflow: dom.overflow, clipped: dom.clipped, truncated: dom.truncated, typography: dom.typography, fonts: dom.fonts, pageScrollX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) });
        if (checks.includes('contrast')) r.nonText = dom.nonText;
        if (checks.includes('links')) Object.assign(r, { links: dom.links, linkIssues: dom.linkIssues });
      }
      if (args.screens && (r.contrast?.violations.length || r.overflow?.length || r.clipped?.length)) {
        const shot = path.join(OUT_DIR, 'shots', `${r.route.replace(/[^a-z0-9]+/gi, '-')}-${viewport.name}-${mode}-${palette}.png`);
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot, fullPage: true });
        r.screenshot = path.relative(OUT_DIR, shot);
      }
      results.push(r);
    }
  } catch (error) {
    results.push({ route: route.path, viewport: viewport.name, mode, palette, error: error.message.split('\n')[0] });
  } finally {
    await context.close();
  }
  return results;
}

async function checkUrl(url, cookie, baseUrl) {
  const internal = url.startsWith(baseUrl);
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', accept: 'text/html,*/*' };
  if (internal && new URL(url).pathname.startsWith('/admin')) headers.cookie = `admin_token=${cookie.value}`;
  const attempt = async method => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, { method, headers, redirect: 'follow', signal: controller.signal });
      return { status: res.status, finalUrl: res.url };
    } finally { clearTimeout(timer); }
  };
  try {
    let r = await attempt(internal ? 'GET' : 'HEAD');
    if (!internal && (r.status === 405 || r.status === 403 || r.status === 404 || r.status >= 500)) r = await attempt('GET');
    return r;
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name || e.message };
  }
}

async function pool(items, size, worker) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }));
  return results;
}

function summarize(results, linkResults, meta) {
  const pages = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);
  const contrastMap = new Map();
  for (const r of pages) for (const v of r.contrast?.violations || []) {
    const key = `${v.target}|${v.fg}|${v.bg}`;
    if (!contrastMap.has(key)) contrastMap.set(key, { ...v, pages: new Set() });
    contrastMap.get(key).pages.add(`${r.route} [${r.mode}/${r.palette}@${r.viewport}]`);
  }
  const groupBy = (field, keyFn) => {
    const m = new Map();
    for (const r of pages) for (const item of r[field] || []) {
      const key = keyFn(item);
      if (!m.has(key)) m.set(key, { item, where: new Set() });
      m.get(key).where.add(`${r.route}@${r.viewport}`);
    }
    return [...m.values()];
  };
  const overflow = groupBy('overflow', i => i.el);
  const clipped = groupBy('clipped', i => i.el + (i.axis || ''));
  const typography = groupBy('typography', i => i.kind + i.el);
  const nonText = groupBy('nonText', i => i.el + i.border + i.background);
  const linkIssues = groupBy('linkIssues', i => i.kind + (i.href || i.el));
  const pageBleed = pages.filter(r => r.pageScrollX > 0).map(r => `${r.route}@${r.viewport} (+${r.pageScrollX}px)`);
  const fontStacks = new Map();
  for (const r of pages) for (const [stack, info] of Object.entries(r.fonts || {})) {
    const k = `${stack}`;
    if (!fontStacks.has(k)) fontStacks.set(k, { ...info, count: 0, areas: new Set() });
    fontStacks.get(k).count += info.count;
    fontStacks.get(k).areas.add(r.access);
  }
  const deadLinks = linkResults.filter(l => l.status >= 400 && ![401, 403, 429, 999].includes(l.status));
  const blocked = linkResults.filter(l => [401, 403, 429, 999].includes(l.status));
  const unreachable = linkResults.filter(l => l.status === 0);

  const md = [];
  md.push(`# UI/UX audit — ${LABEL}`, '', `Generated ${new Date().toISOString()} · ${pages.length} page states audited · ${errors.length} load errors`, '');
  md.push(`Checks: ${meta.checks.join(', ')} · Viewports: ${meta.viewports.join(', ')} · Modes: ${MODES.join(', ')} · Palettes: ${meta.palettes.join(', ')}`, '');
  md.push('## Totals', '', '| Check | Unique findings |', '|---|---|',
    `| Text contrast (axe, WCAG AA) | ${contrastMap.size} |`,
    `| Non-text contrast (controls, 3:1) | ${nonText.length} |`,
    `| Page horizontal bleed | ${pageBleed.length} |`,
    `| Elements crossing viewport | ${overflow.length} |`,
    `| Clipped text (no ellipsis) | ${clipped.length} |`,
    `| Typography | ${typography.length} |`,
    `| Link markup issues | ${linkIssues.length} |`,
    `| Dead links (HTTP ≥400) | ${deadLinks.length} |`,
    `| External blocked (401/403/429) | ${blocked.length} |`,
    `| Unreachable (network) | ${unreachable.length} |`, '');
  const list = (title, rows) => { md.push(`## ${title}`, ''); if (!rows.length) md.push('None.', ''); else md.push(...rows.slice(0, 200), ''); };
  list('Load errors', errors.map(e => `- ${e.route} [${e.mode}/${e.palette}@${e.viewport}]: ${e.error}`));
  list('Text contrast failures', [...contrastMap.values()].map(v => `- \`${v.target}\` ${v.fg} on ${v.bg} = ${v.ratio}:1 (need ${v.expected}; ${v.fontSize} ${v.fontWeight}) — ${v.pages.size} state(s), e.g. ${[...v.pages][0]}\n  - \`${v.html.replace(/`/g, "'")}\``));
  list('Non-text contrast failures', nonText.map(g => `- \`${g.item.el}\` border ${g.item.border} (${g.item.borderRatio}:1), fill ${g.item.background} (${g.item.fillRatio}:1) — ${g.where.size} page(s), e.g. ${[...g.where][0]}`));
  list('Page horizontal bleed', pageBleed.map(p => `- ${p}`));
  list('Elements crossing the viewport', overflow.map(g => `- \`${g.item.el}\` left ${g.item.left} right ${g.item.right} (vw ${g.item.vw}) — ${[...g.where].slice(0, 4).join(', ')}${g.where.size > 4 ? ` +${g.where.size - 4}` : ''}`));
  list('Clipped text', clipped.map(g => `- \`${g.item.el}\` "${g.item.text}" ${g.item.axis || 'x'} ${g.item.scroll}>${g.item.client} — ${[...g.where].slice(0, 4).join(', ')}${g.where.size > 4 ? ` +${g.where.size - 4}` : ''}`));
  list('Typography', typography.map(g => `- ${g.item.kind}: \`${g.item.el}\` "${g.item.text}" ${g.item.size ? g.item.size + 'px' : ''} ${g.item.lineHeight ? 'lh ' + g.item.lineHeight : ''} — ${[...g.where].slice(0, 3).join(', ')}${g.where.size > 3 ? ` +${g.where.size - 3}` : ''}`));
  list('Font stacks in use', [...fontStacks.entries()].sort((a, b) => b[1].count - a[1].count).map(([stack, i]) => `- ${stack} — ${i.count} text nodes (${[...i.areas].join('/')}); first available: ${i.firstAvailable ? 'yes' : 'NO'}; renders as ${i.rendered}; generic fallback: ${i.genericFallback ? 'yes' : 'NO'}`));
  list('Link markup issues', linkIssues.map(g => `- ${g.item.kind}: \`${g.item.el}\` ${g.item.href || ''} "${g.item.label || ''}" — ${[...g.where].slice(0, 3).join(', ')}${g.where.size > 3 ? ` +${g.where.size - 3}` : ''}`));
  list('Dead links', deadLinks.map(l => `- ${l.status} ${l.url} — linked from ${l.from.slice(0, 3).join(', ')}${l.from.length > 3 ? ` +${l.from.length - 3}` : ''}`));
  list('External links blocked to bots (manual check)', blocked.map(l => `- ${l.status} ${l.url}`));
  list('Unreachable links', unreachable.map(l => `- ${l.error} ${l.url} — from ${l.from.slice(0, 2).join(', ')}`));
  md.push('## Link inventory', '', `${linkResults.filter(l => l.internal).length} internal and ${linkResults.filter(l => !l.internal).length} external unique URLs checked.`, '');
  const totals = { contrast: contrastMap.size, nonText: nonText.length, bleed: pageBleed.length, overflow: overflow.length, clipped: clipped.length, typography: typography.length, linkIssues: linkIssues.length, deadLinks: deadLinks.length, blocked: blocked.length, unreachable: unreachable.length, errors: errors.length };
  return { md: md.join('\n') + '\n', totals };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const allChecks = ['contrast', 'layout', 'links'];
  const only = args.only ? args.only.split(',') : allChecks;
  let routes = await buildRoutes();
  if (args.route) routes = routes.filter(r => args.route.split(',').includes(r.path));
  const palettes = args.palettes === 'all' ? colorThemes.map(t => t.key) : [DEFAULT_PALETTE];
  const vpFilter = args.viewports ? new Set(args.viewports.split(',')) : null;

  const jobs = [];
  for (const route of routes) for (const viewport of VIEWPORTS) for (const mode of MODES) {
    if (vpFilter && !vpFilter.has(viewport.name)) continue;
    const checks = [];
    if (only.includes('layout')) checks.push('layout');
    if (only.includes('contrast') && CONTRAST_VIEWPORTS.has(viewport.name)) checks.push('contrast');
    if (only.includes('links') && viewport.name === '1280' || only.includes('links') && viewport.name === '375') checks.push('links');
    if (checks.length) jobs.push({ route, viewport, mode, palette: DEFAULT_PALETTE, checks });
    if (palettes.length > 1 && viewport.name === '1280' && only.includes('contrast') && (args.route || PALETTE_SAMPLE_ROUTES.includes(route.path))) {
      for (const palette of palettes.filter(p => p !== DEFAULT_PALETTE)) jobs.push({ route, viewport, mode, palette, checks: ['contrast'] });
    }
  }

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookie = adminCookie(baseUrl);
  const browser = await chromium.launch({ headless: true });
  console.log(`Auditing ${jobs.length} page states (${routes.length} routes) with concurrency ${CONCURRENCY} → ${path.relative(process.cwd(), OUT_DIR)}`);
  let done = 0;
  const results = (await pool(jobs, CONCURRENCY, async job => {
    const r = await auditJob(browser, baseUrl, cookie, job);
    if (++done % 25 === 0) console.log(`  ${done}/${jobs.length}`);
    return r;
  })).flat();
  await browser.close();

  let linkResults = [];
  if (only.includes('links')) {
    const urls = new Map();
    for (const r of results) for (const l of r.links || []) {
      if (SKIP_LINK_CHECK.test(l.url)) continue;
      if (!urls.has(l.url)) urls.set(l.url, { url: l.url, internal: l.internal, from: new Set() });
      urls.get(l.url).from.add(r.route);
    }
    console.log(`Checking ${urls.size} unique link targets…`);
    linkResults = await pool([...urls.values()], 8, async entry => ({ ...entry, from: [...entry.from], ...(await checkUrl(entry.url, cookie, baseUrl)) }));
  }
  await new Promise(resolve => server.close(resolve));

  const { md, totals } = summarize(results, linkResults, { checks: only, viewports: [...new Set(jobs.map(j => j.viewport.name))], palettes });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ totals, results: results.map(({ links, ...rest }) => rest), linkResults }, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), md);
  console.log('Totals:', JSON.stringify(totals));
  console.log(`Summary: ${path.relative(process.cwd(), path.join(OUT_DIR, 'summary.md'))}`);
  await prisma.$disconnect?.();
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
