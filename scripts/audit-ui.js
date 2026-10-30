const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const { renderAuditPages } = require('./verify-admin-layout');

const root = path.resolve(__dirname, '..');
const origin = 'http://ui-audit.test';
const widths = [320, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1920];
const palettes = ['cyber-emerald', 'vscode-theme', 'solar-amber', 'quantum-cyan', 'titanium-slate', 'clean-light'];
const extraRoutes = [
  ['/admin/settings', 'settings', { users: [], currentUser: { id: 1 }, success: false }],
  ['/admin/customizer', 'customizer', { success: false }],
  ['/admin/ai', 'ai', {
    schedulerSettings: { enabled: false, maxPosts: 10, frequency: 'daily', statusMode: 'draft' },
    totalPosts: 1, saved: false
  }],
  ['/admin/posts/new', 'posts/edit', { post: null, categories: ['Firmware'] }],
  ['/admin/posts/1/edit', 'posts/edit', { post: {
    id: 1, title: 'Synthetic firmware article', summary: 'Synthetic summary',
    contentMarkdown: '# Test article', status: 'draft', category: 'Firmware', readingTime: 5
  }, categories: ['Firmware'] }],
  ['/admin/projects/new', 'projects/edit', { project: null, categories: ['Hardware'] }],
  ['/admin/projects/1/edit', 'projects/edit', { project: {
    id: 1, title: 'Synthetic controller', slug: 'synthetic-controller', category: 'Hardware',
    industry: 'Industrial', summary: 'Synthetic project', contentMarkdown: '# Test project',
    metricsJson: '[]', status: 'draft', order: 0, techStack: 'STM32'
  }, categories: ['Hardware'] }],
  ['/admin/login', 'login', { error: 'Synthetic validation example', redirect: '/admin' }]
];

function measureUI() {
  const vw = document.documentElement.clientWidth;
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const selector = e => e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.getAttribute('href') ? `[href="${e.getAttribute('href')}"]` : ''}`;
  const text = e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 75);
  const issue = (e, actual, expected) => ({ selector: selector(e), text: text(e), actual, expected });
  const typography = [];
  for (const e of document.querySelectorAll('nav a, .settings-nav-btn, p, label, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select')) {
    if (!visible(e)) continue;
    const size = parseFloat(getComputedStyle(e).fontSize);
    const navigation = !!e.closest('nav') || e.matches('.settings-nav-btn');
    const minimum = navigation ? 16 : (vw < 768 && e.matches('p, input, textarea, select') ? 16 : 12);
    if (size < minimum) typography.push(issue(e, size, minimum));
  }
  const clipping = [];
  for (const e of document.querySelectorAll('header a, header button, main h1, main input, main select, main textarea')) {
    if (!visible(e)) continue;
    const box = e.getBoundingClientRect();
    if (box.left >= -1 && box.right <= vw + 1) continue;
    let parent = e.parentElement;
    let intentional = false;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth) {
        intentional = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (!intentional) clipping.push(issue(e, { left: box.left, right: box.right }, `within 0..${vw}`));
  }
  const targets = [...document.querySelectorAll('header button, header a, button[type=submit]')]
    .filter(visible).flatMap(e => {
      const box = e.getBoundingClientRect();
      return box.width < 43.5 || box.height < 43.5 ? [issue(e, { width: box.width, height: box.height }, '44x44')] : [];
    });
  return {
    viewport: vw, documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth, typography, clipping, targets
  };
}

async function run() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output)) throw new Error('Pass an absolute report output directory.');
  await fs.mkdir(output, { recursive: true });
  const pages = await renderAuditPages(extraRoutes);
  const browser = await chromium.launch();
  const results = [];
  const accessibility = [];
  const errors = [];
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ route: page.url(), error: error.message }));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: 'Audit is read-only' });
      const html = pages.get(url.pathname + url.search);
      if (html) return route.fulfill({ contentType: 'text/html', body: html });
      if (/^\/(css|assets)\//.test(url.pathname)) {
        const file = path.resolve(root, 'public', ...url.pathname.split('/').filter(Boolean));
        if (!file.startsWith(path.join(root, 'public') + path.sep)) return route.abort();
        try {
          return await route.fulfill({
            contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'image/svg+xml',
            body: await fs.readFile(file)
          });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return route.fulfill({ status: 404, body: 'Missing fixture asset' });
        }
      }
      return route.fulfill({ status: 404, body: 'No fixture for route' });
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      for (const route of pages.keys()) {
        await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
        await page.locator('link[href="/css/style.css"]').evaluate(link => link.sheet ? undefined : new Promise((resolve, reject) => {
          link.onload = resolve;
          link.onerror = () => reject(new Error('CSS load failed'));
        }));
        if (!await page.evaluate(() => !!window.ThemeManager)) {
          await page.addScriptTag({ url: origin + '/assets/js/theme-manager.js' });
        }
        for (const palette of palettes) {
          for (const mode of ['light', 'dark']) {
            await page.evaluate(({ palette, mode }) => {
              localStorage.setItem('color-theme', mode);
              localStorage.setItem('color-palette', palette);
              document.documentElement.classList.toggle('dark', mode === 'dark');
              window.ThemeManager.applyPalette(palette);
              window.ThemeManager.updateThemeIcons();
            }, { palette, mode });
            results.push({ route, width, palette, mode, ...await page.evaluate(measureUI) });
          }
        }
        if ([375, 820, 1440].includes(width)) {
          await page.evaluate(() => {
            document.documentElement.classList.remove('dark');
            window.ThemeManager.applyPalette('cyber-emerald');
            window.ThemeManager.updateThemeIcons();
          });
          const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          accessibility.push({ route, width, violations: audit.violations.map(v => ({
            id: v.id, impact: v.impact, description: v.description,
            nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary }))
          })) });
          const name = `${route.replace(/[^a-z0-9]/gi, '-')}-${width}.png`;
          await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
        }
      }
      console.log(`Audited ${width}px: ${pages.size} fixtures, six palettes, light/dark`);
    }
  } finally {
    await browser.close();
  }
  const report = { generatedAt: new Date().toISOString(), coverage: {
    widths, palettes, modes: ['light', 'dark'], browser: 'Chromium', source: 'synthetic EJS fixtures',
    externalFonts: 'Blocked deliberately to test fallback', liveAdmin: false
  }, results, accessibility, errors };
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  const summary = {
    combinations: results.length,
    typography: results.filter(r => r.typography.length).length,
    clipping: results.filter(r => r.clipping.length).length,
    targets: results.filter(r => r.targets.length).length,
    overflow: results.filter(r => r.documentWidth > r.viewport || r.bodyWidth > r.viewport).length,
    axeViolations: accessibility.reduce((n, r) => n + r.violations.length, 0),
    runtimeErrors: errors.length
  };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(summary);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
