const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const AxeBuilder = require('@axe-core/playwright').default;
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.ADMIN_JWT_SECRET = 'admin-responsive-qa-only';
const db = require('../src/services/db');
const { clearSettingsCache } = require('../src/middleware/seo');
const originalSettings = db.setting.findMany.bind(db.setting);
const override = { maintenance_mode: 'false', enable_copilot: 'true', enable_back_to_top: 'true', enable_rfq_popup: 'false', custom_faqs: '[]' };
db.setting.findMany = async () => Object.entries({ ...Object.fromEntries((await originalSettings()).map(r => [r.key, r.value])), ...override }).map(([key, value]) => ({ key, value }));
db.setting.upsert = async ({ create, update, where }) => { override[where.key] = update.value; return { ...create, ...update }; };
const originalUser = db.user.findUnique.bind(db.user);
db.user.findUnique = async args => args.where.id === 'qa-admin' ? { id: 'qa-admin', email: 'qa@example.test', username: 'QA', role: 'admin' } : originalUser(args);
db.analytics.create = async () => ({});
db.calculatorStat.create = async () => ({});
db.calculatorStat.update = async () => ({});
const app = require('../src/server');
const token = jwt.sign({ userId: 'qa-admin', role: 'admin' }, process.env.ADMIN_JWT_SECRET);
const out = path.join(__dirname, '../scratch/admin-responsive'); fs.mkdirSync(out, { recursive: true });
const presets = require('../src/data/colorThemes');
const sections = ['ai-engine', 'site-customizer', 'seo-scripts', 'monetization-ads', 'newsletter-config', 'smtp-settings', 'team-accounts', 'faq-manager'];
const pages = ['/admin', '/admin/inquiries', '/admin/subscribers', '/admin/posts', '/admin/projects', '/admin/ai'];

(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const width of [320, 360, 390, 768, 1024, 1280, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      await context.addCookies([{ name: 'admin_token', value: token, url: base }]);
      await context.addInitScript(() => localStorage.setItem('color-theme', 'light'));
      const page = await context.newPage();
      page.on('pageerror', error => failures.push(width + ' JS: ' + error.message));
      async function inspect(label) {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' page overflow: ' + label);
        const bad = await page.locator('main').evaluate(main => Array.from(main.querySelectorAll('button, .theme-toggle-badge, .scheduler-status')).filter(el => {
          if (!el.getClientRects().length || el.closest('#iframeViewportWrapper')) return false;
          return el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible';
        }).map(el => ({ text: el.textContent.trim().slice(0, 60), width: el.clientWidth, scroll: el.scrollWidth })));
        for (const table of await page.locator('main table:visible').all()) {
          assert(await table.evaluate(el => { const parent = el.parentElement; return el.scrollWidth <= parent.clientWidth + 1 || ['auto','scroll'].includes(getComputedStyle(parent).overflowX); }), 'Tables scroll instead of squeezing text');
        }
        if (bad.length) failures.push({ width, label, controls: bad });
      }
      for (const url of pages) {
        const response = await page.goto(base + url, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200, url);
        await page.waitForTimeout(150); await inspect(url);
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(out, width + '-' + url.split('/').pop() + '.png'), fullPage: true });
      }
      await page.goto(base + '/admin/settings', { waitUntil: 'domcontentloaded' });
      for (const section of sections) {
        await page.locator('[data-settings-tab="' + section + '"]').click();
        await page.waitForTimeout(120); await inspect(section);
        if (section === 'feature-flags') {
          for (const [mode, viewport] of [['desktop', 1440], ['tablet', 768], ['mobile', 390]]) {
            await page.locator('#vp-btn-' + mode).click(); await page.waitForTimeout(200);
            const frame = page.locator('#liveHomepageIframe');
            assert.equal(await frame.evaluate(el => el.contentWindow.innerWidth), viewport, width + ' actual ' + mode + ' viewport');
            const layout = await page.evaluate(() => {
              const a = document.getElementById('iframeViewportWrapper').getBoundingClientRect();
              const b = document.getElementById('iframeScaleContainer').getBoundingClientRect();
              return { left: a.left - b.left, right: b.right - a.right, center: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) };
            });
            assert(layout.left >= -1 && layout.right >= -1 && layout.center <= 1, width + ' preview centered and contained ' + mode + JSON.stringify(layout));
          }
        }
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(out, width + '-' + section + '.png'), fullPage: true });
      }
      await page.goto(base + '/admin/settings#theme-engine', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#theme-engine').count(), 0, 'Theme editor removed');
      assert(await page.locator('#site-customizer').isVisible(), 'Legacy theme link redirects to existing settings');
      const aiLink = page.locator('#settings-sidebar-nav a[href="/admin/settings#ai-engine"]');
      await aiLink.click(); await page.waitForURL('**/admin/settings#ai-engine');
      assert.equal(await page.locator('header a[href="/admin/ai"]').count(), 0, 'AI removed from global header');
      assert.equal(await page.locator('#settings-sidebar-nav [data-settings-tab]').count(), 8, 'Settings navigation remains on AI Engine');
      await page.locator('#settings-sidebar-nav [data-settings-tab="site-customizer"]').click();
      await page.waitForURL('**/admin/settings#site-customizer');
      assert(await page.locator('#site-customizer').isVisible(), 'Return to settings works');
      assert.equal(await page.locator('#admin-header-actions a[href="/"]').count(),0,'Visit Site removed');
      assert.equal(await page.locator('.admin-signout svg').count(),1,'Sign out has an icon');
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.evaluate(()=>window.scrollTo({top:700,behavior:'instant'}));await page.waitForTimeout(100);
      assert(await page.locator('#back-to-top-btn').evaluate(el=>{const a=el.getBoundingClientRect(),b=document.getElementById('copilot-trigger-btn').getBoundingClientRect();return a.bottom<=b.top || b.bottom<=a.top || a.right<=b.left || b.right<=a.left;}),'Floating utilities do not overlap');
      await page.locator('#copilot-trigger-btn').click();
      assert(await page.locator('#copilot-drawer').evaluate(el => el.getAnimations().length > 0), 'Copilot opening animates');
      await page.waitForTimeout(550); assert(await page.locator('#copilot-drawer').isVisible());
      assert.equal(await page.locator('#back-to-top-btn').evaluate(el=>getComputedStyle(el).visibility),'hidden');
      const bar=page.locator('#copilot-prompts');
      assert.notEqual(await bar.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none','Prompt scrollbar visible');
      await page.locator('#copilot-prompts-next').click();await page.waitForTimeout(400);
      assert(await bar.evaluate(el=>el.scrollLeft>0),'Prompt next arrow scrolls');
      await page.locator('#copilot-prompts-prev').click();await page.waitForTimeout(400);
      assert(await bar.evaluate(el=>el.scrollLeft<2),'Prompt previous arrow scrolls');
      if([390,1440].includes(width))await page.screenshot({path:path.join(out,width+'-copilot-controls.png')});
      await page.locator('#copilot-close-btn').click(); await page.locator('#copilot-drawer').waitFor({state:'hidden',timeout:2000});
      assert(!(await page.locator('#copilot-drawer').isVisible()), 'Copilot closes');
      await page.locator('#copilot-trigger-btn').click(); await page.waitForTimeout(70);
      await page.locator('#copilot-close-btn').click(); await page.waitForTimeout(70);
      await page.locator('#copilot-trigger-btn').click(); await page.waitForTimeout(550);
      assert(await page.locator('#copilot-drawer').isVisible(), 'Interrupted animation reopens');
      await page.keyboard.press('Escape'); await page.locator('#copilot-drawer').waitFor({state:'hidden',timeout:2000});
      assert(!(await page.locator('#copilot-drawer').isVisible()));
      if (width === 390) {
        await page.goto(base + '/admin/settings#faq-manager');
        await page.locator('#addFaqRow').click();
        await page.locator('#faqEditorRows input').fill('Can you review an existing design?');
        await page.locator('#faqEditorRows textarea').fill('Yes. Share your requirements for an engineering review.');
        const saved = page.waitForResponse(r => r.url().endsWith('/admin/settings') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Save FAQs', exact: true }).click(); assert.equal((await saved).status(), 200);
        clearSettingsCache(); await page.goto(base);
        assert.equal(await page.locator('#faq details').filter({ hasText: 'Can you review an existing design?' }).count(), 1, 'Saved FAQ is published');
        await page.goto(base + '/admin/settings#faq-manager');
        assert.equal(await page.locator('#faqEditorRows input').inputValue(), 'Can you review an existing design?', 'FAQ reloads');
        await page.getByRole('button', { name: 'Remove FAQ 1', exact: true }).click();
        assert.equal(await page.locator('#custom_faqs').inputValue(), '[]');
      }
      for (const url of ['/', '/admin/ai']) {
        await page.goto(base + url, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Appearance', exact: true }).click();
        const panel = page.locator('.appearance-panel');
        await page.waitForTimeout(300);
        assert(await panel.isVisible());
        assert.equal(await panel.locator('.appearance-palette').count(), 5);
        assert(await panel.evaluate(el => { const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight+1; }), 'Appearance panel fits viewport');
        for (const theme of presets) {
          await panel.getByRole('button', { name:theme.name, exact:true }).click();
          assert.equal(await page.locator('html').getAttribute('data-palette'),theme.key);
        }
        const toggle=panel.getByRole('switch', { name:'Night mode' });
        await toggle.check(); assert(await page.locator('html').evaluate(el=>el.classList.contains('dark')));
        assert(await page.locator('.appearance-mode-moon').isVisible(),'Icon indicates night mode');
        assert.equal(await page.locator('html').evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()),presets.at(-1).dark['--primary-color'],'Original dark palette color restored');
        await toggle.uncheck(); assert(!(await page.locator('html').evaluate(el=>el.classList.contains('dark'))));
        assert(await page.locator('.appearance-mode-sun').isVisible(),'Icon indicates light mode');
        assert.equal(await page.locator('html').evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()),presets.at(-1).light['--primary-color'],'Original light palette color restored');
        await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden', timeout: 1500 });
        assert(!(await panel.isVisible()));
        await page.reload({ waitUntil:'domcontentloaded' });
        assert.equal(await page.locator('html').getAttribute('data-palette'),presets.at(-1).key, 'Palette persists');
        if (url === '/admin/ai') {
          await page.getByRole('button',{name:'Appearance',exact:true}).click();
          await panel.getByRole('button',{name:'VS Code Inspired',exact:true}).click();
          await panel.getByRole('switch',{name:'Night mode'}).check();
          await page.locator('#providerCards label').filter({has:page.locator('input[value="openai"]')}).click();
          await page.waitForTimeout(350);
          const audit=await new AxeBuilder({page}).include('#providerCards').include('#settings-sidebar-nav').withTags(['wcag2aa']).analyze();
          assert.deepEqual(audit.violations.filter(v=>v.id==='color-contrast').map(v=>v.nodes.map(n=>n.target)),[],'VS Code dark provider/navigation contrast');
          if([390,1440].includes(width))await page.screenshot({path:path.join(out,width+'-vscode-dark.png')});
        }
        if ([390,1440].includes(width)) {
          await page.getByRole('button', { name:'Appearance',exact:true }).click();await page.waitForTimeout(300);
          await page.screenshot({path:path.join(out,width+'-appearance-'+(url==='/'?'public':'admin')+'.png')});
        }
      }
      await context.close(); console.log('Checked', width + 'px');
    }
    const invalid = await request(app).post('/admin/settings').set('Authorization', 'Bearer ' + token).send({ custom_faqs: '[{"question":"","answer":"Missing question"}]' }); assert.equal(invalid.status, 400);
    assert.deepEqual(failures, [], 'UI overflow / browser errors');
    console.log('PASS: admin routes and settings sections, real preview viewports, FAQ save/publish/edit/remove, Copilot animations, and responsive layouts.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
