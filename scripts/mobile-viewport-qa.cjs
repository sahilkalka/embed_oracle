const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

process.env.NODE_ENV = 'test';
const db = require('../src/services/db');
// Exercise public pages without changing analytics or usage counters.
db.analytics.create = async () => ({});
db.calculatorStat.create = async () => ({});
db.calculatorStat.update = async () => ({});
const app = require('../src/server');
const dir = path.join(__dirname, '../scratch/mobile-viewport');
fs.mkdirSync(dir, { recursive: true });
const routes = ['/', '/projects', '/tools/engineering-hardware/pcb-trace'];
const selectors = ['body > header', '#public-header-actions', '#palette-dropdown-wrapper', '#consoleTabs', '#scopeCanvas', 'aside[aria-label="Lab Telemetry"]', '#categoryPillList', '[role="tablist"]', 'header.spaceship-ambient-mesh'];

async function checkMobile(page, route, width) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow at ' + width + route);
  if (route === '/') {
    await page.locator('[data-tab="scope"]').click();
    await page.locator('#scopeCanvas').scrollIntoViewIfNeeded();
    assert(await page.locator('#consoleTabs button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)), 'Console tab text fits');
    assert(await page.locator('#scopeCanvas').evaluate(canvas => {
      const rect = canvas.getBoundingClientRect();
      const outer = document.querySelector('#hero-console').getBoundingClientRect();
      return rect.height >= 144 && rect.top >= outer.top && rect.bottom <= outer.bottom;
    }), 'Whole waveform canvas fits inside console');
    for (const waveform of ['Square', 'Sine', 'Burst']) {
      await page.getByRole('button', { name: waveform, exact: true }).click();
      await page.waitForTimeout(40);
      assert(await page.locator('#scopeCanvas').evaluate(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 150 && pixels[i + 1] > pixels[i] * 1.2) return true;
        return false;
      }), waveform + ' waveform drawn');
    }
    await page.screenshot({ path: path.join(dir, width + '-console.png') });
    assert(await page.locator('[data-mobile-process] .w-20.h-20').evaluateAll(badges => badges.length === 4 && badges.every(el => {
      const r = el.getBoundingClientRect(); return r.width === 64 && r.height === 64;
    })), 'Process badges remain square');
    await page.locator('[data-mobile-process]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(dir, width + '-process.png') });
    const lab = page.locator('aside[aria-label="Lab Telemetry"]');
    await lab.scrollIntoViewIfNeeded();
    assert(await lab.locator('> div > div:first-child > span:first-child').evaluate(el => el.scrollWidth <= el.clientWidth), 'Lab pill does not wrap or overflow');
    await page.screenshot({ path: path.join(dir, width + '-telemetry.png') });
  } else {
    const pills = route === '/projects' ? '#categoryPillList > a' : '[role="tablist"] > a';
    assert(await page.locator(pills).evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth)), 'Pill labels fit at ' + width + route);
    await page.locator(pills).last().scrollIntoViewIfNeeded();
    assert(await page.locator(pills).last().isVisible(), 'Last pill reachable');
    if (route.includes('/tools')) {
      assert.equal(await page.locator('header.spaceship-ambient-mesh').evaluate(el => getComputedStyle(el).position), 'static');
      await page.locator('#interactive-tool').scrollIntoViewIfNeeded();
      assert(await page.locator('header.spaceship-ambient-mesh').evaluate(el => el.getBoundingClientRect().bottom < 100), 'Tool banner scrolls away');
      const output = page.locator('#trace-resWidthMils'); const before = await output.textContent();
      await page.locator('#trace-current').fill('5');
      assert.notEqual(await output.textContent(), before, 'Tool remains usable');
    }
    await page.screenshot({ path: path.join(dir, width + (route === '/projects' ? '-projects.png' : '-tool.png')) });
  }
  // The single appearance button opens a panel with five fixed palettes.
  await page.getByRole('button', {name:'Appearance',exact:true}).click();
  const panel=page.locator('.appearance-panel');
  for(const scheme of ['cyber-emerald','vscode-theme','solar-amber','quantum-cyan','titanium-slate']) {
    const swatch=panel.locator('[data-scheme="'+scheme+'"]');
    assert(await swatch.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}), 'Palette is not clipped');
    await swatch.click();assert.equal(await page.locator('html').getAttribute('data-palette'),scheme);
  }
  const mode=panel.getByRole('switch',{name:'Night mode'});
  await mode.check();assert(await page.locator('html').evaluate(el=>el.classList.contains('dark')));
  await mode.uncheck();assert(!(await page.locator('html').evaluate(el=>el.classList.contains('dark'))));
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});

}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true });
  const results = {};
  try {
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('color-theme', 'light'));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      for (const route of routes) {
        await page.goto('http://127.0.0.1:' + server.address().port + route, { waitUntil: 'networkidle' });
        results[width + route] = await page.evaluate(selectors => Object.fromEntries(selectors.map(selector => {
          const el = document.querySelector(selector); if (!el) return [selector, null];
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return [selector, { x: r.x, y: r.y, width: r.width, height: r.height, position: s.position, overflowX: s.overflowX, overflowY: s.overflowY, display: s.display }];
        })), selectors);
        if (width < 768) await checkMobile(page, route, width);
      }
      assert.deepEqual(errors, [], 'No browser errors at ' + width);
      await context.close();
    }
    const baselinePath = path.join(dir, 'baseline.json');
    if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      for (const key of Object.keys(baseline).filter(key => /^(768|1440)\//.test(key))) {
        for (const selector of selectors.filter(selector=>!['#public-header-actions','#palette-dropdown-wrapper'].includes(selector))) assert.deepEqual(results[key][selector], baseline[key][selector], 'Desktop/tablet unchanged: ' + key + selector);
      }
      console.log('PASS: unaffected desktop/tablet layout comparisons (appearance controls excluded).');
    }
    fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify(results, null, 2));
    console.log('PASS: mobile at 320, 360, 390 and 430px; waves, labels, badges, scrollable pills, tool access, palettes and theme controls.');
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
