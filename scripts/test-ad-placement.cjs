process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const app = require('../app');

(async () => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', 'admin@embeddedindia.in');
    await page.fill('input[name="password"]', 'AdminEmbedded@2026!');
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith('/admin') && url.pathname !== '/admin/login'),
      page.click('button[type="submit"]')
    ]);

    await page.goto(`${baseUrl}/admin/settings#monetization-ads`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#monetization-ads:not(.hidden)');

    // 1. Verify top Ad placements cards/buttons are completely removed
    const oldCardCount = await page.locator('#monetization-ads .ad-placement-card').count();
    assert.equal(oldCardCount, 0, 'Expected old .ad-placement-card section to be removed');

    // 2. Verify all 6 preview placement slots exist and are interactive buttons
    const slots = [
      { preview: '#ad_wf_slot1', input: '#ad_toggle_slot1' },
      { preview: '#ad_wf_slot2', input: '#ad_toggle_slot2' },
      { preview: '#ad_wf_slot3', input: '#ad_toggle_slot3' },
      { preview: '#ad_wf_slot4', input: '#ad_toggle_slot4' },
      { preview: '#ad_wf_slot_tools_h', input: '#ad_toggle_slot_tools_header' },
      { preview: '#ad_wf_slot_tools_f', input: '#ad_toggle_slot_tools_footer' }
    ];

    const slotCount = await page.locator('#monetization-ads .ad-preview-slot').count();
    assert.equal(slotCount, 6, 'Expected six interactive preview slots');

    // 3. Click each preview slot to toggle Disabled -> Active (or Active -> Disabled -> Active)
    for (const slot of slots) {
      const initialVal = await page.locator(slot.input).inputValue();
      const expectedAfterFirstClick = initialVal === 'false' ? 'true' : 'false';
      const expectedStateText1 = expectedAfterFirstClick === 'true' ? 'Active' : 'Disabled';

      await page.click(slot.preview);
      assert.equal(await page.locator(slot.input).inputValue(), expectedAfterFirstClick);
      assert.equal(await page.locator(slot.preview).getAttribute('data-active'), expectedAfterFirstClick);
      assert.equal(await page.locator(slot.preview).getAttribute('aria-checked'), expectedAfterFirstClick);
      assert.equal((await page.locator(`${slot.preview} .ad-preview-state`).textContent()).trim(), expectedStateText1);

      // Click again to restore
      await page.click(slot.preview);
      assert.equal(await page.locator(slot.input).inputValue(), initialVal);
    }

    // 4. Test saving a toggled preview slot state
    await page.click('#ad_wf_slot3');
    const toggledSlot3Val = await page.locator('#ad_toggle_slot3').inputValue();
    await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/admin/settings') && res.request().method() === 'POST'),
      page.click('#monetization-ads button[type="submit"]')
    ]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#monetization-ads:not(.hidden)');
    assert.equal(await page.locator('#ad_toggle_slot3').inputValue(), toggledSlot3Val);
    assert.equal(await page.locator('#ad_wf_slot3').getAttribute('data-active'), toggledSlot3Val);

    // Restore slot 3 back to active
    if (toggledSlot3Val === 'false') {
      await page.click('#ad_wf_slot3');
      await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/admin/settings') && res.request().method() === 'POST'),
        page.click('#monetization-ads button[type="submit"]')
      ]);
    }

    console.log('Ad placement interactive preview verification passed.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
