const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const ejs = require('ejs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://admin-layout.test';
const inquiry = {
  id: 1,
  name: 'Layout Test Customer',
  company: 'Embedded Engineering',
  status: 'new',
  serviceCategory: 'Firmware Engineering',
  createdAt: '2026-01-01T12:00:00Z',
  ipAddress: '127.0.0.1',
  email: `${'customer'.repeat(12)}@example.test`,
  phone: '+91 1234567890',
  subject: 'RFQ for a custom embedded controller',
  message: `Requirements: https://example.test/${'long-path'.repeat(40)}`
};
const routes = [
  ['/admin', 'dashboard', {
    pageViews: 10, totalInquiries: 1, newInquiries: 1,
    totalSubscribers: 1, activeSubscribers: 1, totalPosts: 1,
    topPosts: [], calculatorStats: []
  }],
  ['/admin/inquiries', 'inquiries', { inquiries: [inquiry], selectedStatus: '' }],
  ['/admin/inquiries?status=won', 'inquiries', { inquiries: [], selectedStatus: 'won' }],
  ['/admin/subscribers', 'subscribers', { subscribers: [] }],
  ['/admin/posts', 'posts/index', { posts: [] }],
  ['/admin/projects', 'projects/index', {
    projects: [], categories: ['All'], selectedCategory: 'All'
  }]
];
const publicRoutes = ['/?layout=admin', '/?layout=guest'];

async function renderAuditPages(extraRoutes = []) {
  const pages = new Map();
  for (const [route, template, data] of [...routes, ...extraRoutes]) {
    pages.set(route, await ejs.renderFile(
      path.join(root, 'views', 'admin', `${template}.ejs`),
      { theme: {}, settings: {}, currentPath: route.split('?')[0], ...data }
    ));
  }
  for (const route of publicRoutes) {
    pages.set(route, await ejs.renderFile(path.join(root, 'views', 'pages', 'index.ejs'), {
      theme: {}, seo: { title: 'Embedded India UI fixture' }, currentPath: '/',
      currentUser: route.endsWith('admin') ? { username: 'layout-test' } : null,
      settings: { promo_banner_active: 'true', lab_event_enabled: 'true' }
    }));
  }
  return pages;
}

async function verify() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const pages = await renderAuditPages();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/css/style.css') {
        return route.fulfill({
          contentType: 'text/css',
          body: await fs.readFile(path.join(root, 'public', 'css', 'style.css'), 'utf8')
        });
      }
      if (url.pathname === '/assets/js/theme-manager.js') {
        return route.fulfill({
          contentType: 'application/javascript',
          body: await fs.readFile(path.join(root, 'public', 'assets', 'js', 'theme-manager.js'), 'utf8')
        });
      }
      if (url.pathname === '/assets/js/header-search.js') {
        return route.fulfill({
          contentType: 'application/javascript',
          body: await fs.readFile(path.join(root, 'public', 'assets', 'js', 'header-search.js'), 'utf8')
        });
      }
      const html = pages.get(url.pathname + url.search);
      if (html) return route.fulfill({ contentType: 'text/html', body: html });
      return route.abort();
    });

    for (const width of [1920, 1440, 1280, 1024, 820, 768, 639, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...routes.map(([route]) => route), ...publicRoutes]) {
        await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
        await page.locator('link[href="/css/style.css"]').evaluate(link => {
          if (link.sheet) return;
          return new Promise((resolve, reject) => {
            link.addEventListener('load', resolve, { once: true });
            link.addEventListener('error', () => reject(new Error('Layout stylesheet failed to load')), { once: true });
          });
        });
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
          const label = `${route} at ${width}px (${dark ? 'dark' : 'light'})`;
          if (publicRoutes.includes(route)) {
            const group = page.getByRole('group', { name: 'Search and appearance', exact: true });
            assert.equal(await group.locator('button').count(), 3, `${label}: controls must share one group`);
            for (const id of ['header-search-btn', 'theme-toggle', 'palette-dropdown-btn']) {
              assert.ok(await group.locator(`#${id}`).isVisible(), `${label}: missing grouped ${id}`);
            }
            await group.locator('#theme-toggle').click();
            assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')),
              !dark, `${label}: theme toggle did not switch mode`);
            await group.locator('#theme-toggle').click();
            const header = await page.locator('header').evaluate(header => {
              const bar = header.firstElementChild;
              const box = bar.getBoundingClientRect();
              return {
                width: document.documentElement.clientWidth,
                scrollWidth: header.scrollWidth,
                top: box.top, bottom: box.bottom, height: box.height,
                brandRight: bar.firstElementChild.getBoundingClientRect().right,
                actionsLeft: header.querySelector('#public-header-actions').getBoundingClientRect().left
              };
            });
            assert.equal(header.height, width >= 640 ? 80 : 64, `${label}: public header wrapped`);
            assert.ok(header.scrollWidth <= header.width, `${label}: public header overflow`);
            assert.ok(header.brandRight <= header.actionsLeft, `${label}: public brand overlaps actions`);
            const controls = page.locator('#public-header-actions > *:visible');
            for (const control of await controls.all()) {
              const box = await control.boundingBox();
              assert.ok(box && box.x >= 0 && box.x + box.width <= header.width,
                `${label}: public control clipped`);
              assert.ok(box.y >= header.top && box.y + box.height <= header.bottom,
                `${label}: public control escaped top row`);
            }
            if (width >= 640) {
              const cta = page.locator(route.endsWith('admin')
                ? '#public-header-actions > a[href="/admin"]'
                : '#public-header-actions > a[href="/contact"]');
              assert.ok(await cta.isVisible(), `${label}: missing public CTA`);
            }
            await page.locator('#palette-dropdown-btn').click();
            assert.ok(await page.locator('#palette-dropdown-menu').isVisible(),
              `${label}: public appearance menu did not open`);
            const menu = await page.locator('#palette-dropdown-menu').boundingBox();
            assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= header.width,
              `${label}: public appearance menu clipped`);
            await page.locator('#palette-dropdown-btn').click();
            continue;
          }
          const metrics = await page.evaluate(() => {
            const rect = element => {
              const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
              return { left, right, top, bottom, width, height };
            };
            const actions = document.querySelector('#admin-header-actions');
            return {
              viewport: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              bodyScrollWidth: document.body.scrollWidth,
              overflowX: getComputedStyle(document.documentElement).overflowX,
              bar: rect(document.querySelector('header > div')),
              brand: rect(document.querySelector('header a[href="/admin"]')),
              actions: rect(actions),
              controls: [...actions.children]
                .filter(element => getComputedStyle(element).display !== 'none')
                .map(rect),
              navigation: rect(document.querySelector('nav[aria-label="Admin navigation"]')),
              navigationClientWidth: document.querySelector('nav[aria-label="Admin navigation"]').clientWidth,
              navigationScrollWidth: document.querySelector('nav[aria-label="Admin navigation"]').scrollWidth,
              heading: rect(document.querySelector('main h1')),
              main: rect(document.querySelector('main'))
            };
          });
          assert.ok(metrics.scrollWidth <= metrics.viewport, `${label}: document overflow`);
          assert.ok(metrics.bodyScrollWidth <= metrics.viewport, `${label}: body overflow`);
          assert.notEqual(metrics.overflowX, 'hidden', `${label}: overflow must not be masked`);
          if (width >= 640) {
            assert.equal(metrics.bar.height, 64, `${label}: top bar must stay one row`);
            assert.ok(metrics.brand.right <= metrics.actions.left, `${label}: brand overlaps controls`);
          }
          for (const control of metrics.controls) {
            assert.ok(control.width > 0, `${label}: hidden action`);
            assert.ok(control.left >= 0 && control.right <= width, `${label}: clipped action`);
            assert.ok(control.top >= metrics.bar.top && control.bottom <= metrics.bar.bottom,
              `${label}: action escaped top row`);
          }
          for (const selector of ['#admin-header-actions > a[href="/"]', 'a[href="/admin/logout"]']) {
            assert.ok(await page.locator(selector).isVisible(), `${label}: missing ${selector}`);
          }
          if (width >= 768) {
            assert.ok(metrics.navigation.width > 0, `${label}: missing desktop/tablet links`);
            if (width >= 1280) {
              assert.ok(metrics.navigationScrollWidth <= metrics.navigationClientWidth,
                `${label}: desktop links should fit without scrolling`);
            }
            assert.ok(metrics.navigation.right <= metrics.actions.left, `${label}: navigation overlaps controls`);
          } else {
            assert.ok(await page.getByRole('navigation', { name: 'Admin mobile navigation' }).isVisible(),
              `${label}: missing mobile links`);
          }
          assert.ok(metrics.main.left >= 0 && metrics.main.right <= width, `${label}: clipped main`);
          assert.ok(metrics.heading.left >= 0 && metrics.heading.right <= width, `${label}: clipped heading`);
          const group = page.getByRole('group', { name: 'Search and appearance', exact: true });
          assert.equal(await group.locator('button').count(), 3, `${label}: shared admin controls missing`);
          await group.locator('#header-search-btn').click();
          await page.locator('#headerSearchInput').fill('SMTP');
          assert.equal(await page.locator('#headerSearchResults a[href="/admin/settings#smtp-settings"]').count(),
            1, `${label}: missing admin settings search result`);
          await page.locator('#headerSearchInput').fill('no-such-admin-page');
          assert.ok(await page.getByText('No results found for', { exact: false }).isVisible(),
            `${label}: missing no-results feedback`);
          await page.keyboard.press('Escape');
          assert.ok(await group.locator('#header-search-btn').evaluate(e => e === document.activeElement),
            `${label}: search did not restore focus`);
          await page.keyboard.press('Control+k');
          assert.ok(await page.locator('#header-search-modal').isVisible(), `${label}: search shortcut failed`);
          await page.keyboard.press('Escape');
          for (const font of await page.locator('nav:visible a').evaluateAll(links =>
            links.map(link => parseFloat(getComputedStyle(link).fontSize)))) {
            assert.ok(font >= 16, `${label}: navigation below 16px`);
          }
          await page.locator('#admin-palette-dropdown-btn').click();
          assert.ok(await page.locator('#admin-palette-dropdown-menu').isVisible(),
            `${label}: appearance menu did not open`);
          const menu = await page.locator('#admin-palette-dropdown-menu').boundingBox();
          assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= width,
            `${label}: clipped appearance menu`);
          await page.locator('#admin-palette-dropdown-btn').click();
          if (route === '/admin/inquiries') {
            for (const selector of [
              'a[href="/admin/inquiries/export"]', '#openSmtpModalBtn',
              'a[href^="mailto:"]', 'select[name="status"]', 'button[aria-label="Delete inquiry"]'
            ]) {
              const box = await page.locator(selector).first().boundingBox();
              assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${label}: clipped ${selector}`);
            }
            await page.locator('#openSmtpModalBtn').click();
            assert.ok(await page.locator('#smtpModal').isVisible(), `${label}: SMTP modal did not open`);
            await page.locator('#closeSmtpModalBtn').click();
            assert.ok(await page.locator('#smtpModal').isHidden(), `${label}: SMTP modal did not close`);
          }
        }
      }
      console.log(`PASS ${width}px: ${routes.length} admin and ${publicRoutes.length} homepage fixtures, light and dark`);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { renderAuditPages, routes, publicRoutes };

if (require.main === module) {
  verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
