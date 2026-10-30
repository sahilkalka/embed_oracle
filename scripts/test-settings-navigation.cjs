process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const app = require('../app');

const sections = [
  'ai-engine',
  'faq-manager',
  'site-customizer',
  'seo-scripts',
  'monetization-ads',
  'newsletter-config',
  'smtp-settings',
  'team-accounts'
];

(async () => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 }
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('input[name="email"]', 'admin@embeddedindia.in');
      await page.fill('input[name="password"]', 'AdminEmbedded@2026!');
      await Promise.all([
        page.waitForURL((url) => url.pathname.startsWith('/admin') && url.pathname !== '/admin/login'),
        page.click('button[type="submit"]')
      ]);

      await page.goto(`${baseUrl}/admin/settings`, { waitUntil: 'domcontentloaded' });
      const count = await page.locator('#settings-sidebar-nav .settings-nav-btn').count();
      assert.equal(count, sections.length, `${viewport.name}: expected ${sections.length} navigation items`);

      // Verify default section without hash is ai-engine (first sub-header item)
      const defaultActive = await page.locator('#settings-sidebar-nav .settings-nav-btn[aria-current="page"]').getAttribute('data-settings-tab');
      assert.equal(defaultActive, 'ai-engine', `${viewport.name}: expected /admin/settings to default to ai-engine`);
      const aiEngineVisibleByDefault = await page.locator('#ai-engine').evaluate((el) => !el.classList.contains('hidden'));
      assert.equal(aiEngineVisibleByDefault, true, `${viewport.name}: expected #ai-engine to be visible by default`);

      // Verify feature-flags and integrations do not exist
      assert.equal(await page.locator('#feature-flags').count(), 0, `${viewport.name}: expected #feature-flags to be removed`);
      assert.equal(await page.locator('#integrations').count(), 0, `${viewport.name}: expected #integrations to not exist`);

      const navMetrics = await page.locator('#settings-sidebar-nav').evaluate((el) => {
        const items = Array.from(el.querySelectorAll('.settings-nav-btn')).map((item) => {
          const rect = item.getBoundingClientRect();
          const label = item.querySelector('.settings-nav-label');
          return {
            right: rect.right,
            left: rect.left,
            truncated: label ? label.scrollWidth > label.clientWidth + 1 : false
          };
        });
        const rect = el.getBoundingClientRect();
        return {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          outOfBounds: items.some((item) => item.left < rect.left - 1 || item.right > rect.right + 1),
          truncated: items.some((item) => item.truncated)
        };
      });
      assert.ok(navMetrics.scrollWidth <= navMetrics.clientWidth + 1, `${viewport.name}: settings nav should not overflow horizontally`);
      assert.equal(navMetrics.outOfBounds, false, `${viewport.name}: all settings nav items should fit inside the nav`);
      assert.equal(navMetrics.truncated, false, `${viewport.name}: settings nav labels should not truncate`);

      for (const section of sections) {
        await page.click(`#settings-sidebar-nav [data-settings-tab="${section}"]`);
        const active = await page.locator('#settings-sidebar-nav .settings-nav-btn[aria-current="page"]').getAttribute('data-settings-tab');
        const visible = await page.locator(`#${section}`).evaluate((el) => !el.classList.contains('hidden'));
        assert.equal(active, section, `${viewport.name}: expected ${section} nav button to be current`);
        assert.equal(visible, true, `${viewport.name}: expected ${section} section to be visible`);
      }

      await context.close();
    }

    console.log('Settings navigation verification passed.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
