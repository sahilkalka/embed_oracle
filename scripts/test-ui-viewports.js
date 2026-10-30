const assert = require('node:assert/strict');
const { chromium } = require('playwright');

let BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
let ephemeralServer = null;

const SCREEN_PROFILES = [
  { name: 'Desktop', width: 1440, height: 900, isMobileView: false },
  { name: 'Tablet',  width: 768,  height: 1024, isMobileView: false },
  { name: 'Mobile',  width: 375,  height: 812,  isMobileView: true }
];

const PUBLIC_PAGES = [
  '/',
  '/services',
  '/services/embedded-ui-hmi-development',
  '/projects',
  '/tools',
  '/blogs',
  '/about',
  '/contact'
];

async function isServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.status === 200 || res.status === 302;
  } catch (e) {
    return false;
  }
}

async function gotoWithRetry(page, url, options = { waitUntil: 'domcontentloaded', timeout: 25000 }, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await page.goto(url, options);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

async function run() {
  console.log(`\n========================================================`);
  console.log(`🚀 Starting Full UI Test Suite on ${BASE_URL}`);
  console.log(`========================================================\n`);

  const serverReady = await isServerUp();
  if (!serverReady) {
    process.env.NODE_ENV = 'test';
    const app = require('../src/server');
    ephemeralServer = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    BASE_URL = `http://127.0.0.1:${ephemeralServer.address().port}`;
    console.log(`🔌 Started ephemeral test server at ${BASE_URL}\n`);
  } else {
    console.log(`🔌 Connected to running application server at ${BASE_URL}\n`);
  }

  const browser = await chromium.launch({ headless: true });
  let totalTests = 0;
  let passedTests = 0;
  const failures = [];

  async function check(desc, fn) {
    totalTests++;
    process.stdout.write(`  • [${desc}] ... `);
    try {
      await fn();
      console.log(`✅ PASS`);
      passedTests++;
    } catch (err) {
      console.log(`❌ FAIL: ${err.message}`);
      failures.push({ desc, error: err.message });
    }
    await new Promise(r => setTimeout(r, 100));
  }

  try {
    // 1. Authenticate admin context once for admin tests
    const adminContext = await browser.newContext();
    const loginPage = await adminContext.newPage();
    await gotoWithRetry(loginPage, `${BASE_URL}/admin/login`);
    await loginPage.fill('input[name="email"]', 'admin@embeddedindia.in');
    await loginPage.fill('input[name="password"]', 'AdminEmbedded@2026!');
    await loginPage.click('button[type="submit"]');
    await loginPage.waitForURL('**/admin', { timeout: 15000 });
    const authCookies = (await adminContext.storageState()).cookies;
    await adminContext.close();
    console.log(`🔑 Admin credentials authenticated successfully.\n`);

    // 2. Iterate through all 3 screen profiles (Desktop, Tablet, Mobile)
    for (const screen of SCREEN_PROFILES) {
      console.log(`\n--------------------------------------------------------`);
      console.log(`📱 SCREEN PROFILE: ${screen.name} (${screen.width}x${screen.height})`);
      console.log(`--------------------------------------------------------`);

      const context = await browser.newContext({
        viewport: { width: screen.width, height: screen.height },
        deviceScaleFactor: 1
      });
      await context.addCookies(authCookies);
      const page = await context.newPage();

      // Listen for uncaught JS errors
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));

      // Test A: No Horizontal Overflow on Public Pages
      for (const route of PUBLIC_PAGES) {
        await check(`${screen.name} - ${route} has no horizontal overflow`, async () => {
          await gotoWithRetry(page, `${BASE_URL}${route}`);
          const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            return {
              scrollWidth: docWidth,
              winWidth: winWidth,
              hasOverflow: docWidth > winWidth + 2
            };
          });
          assert.equal(overflow.hasOverflow, false,
            `Overflow detected on ${route}: scrollWidth=${overflow.scrollWidth} > winWidth=${overflow.winWidth}`);
        });
      }

      // Test B: Navigation Menu Bar Behavior (Consistent & Collapsed ONLY for Mobile) & Zero Scroll in Header Actions
      await check(`${screen.name} - Public navigation menu visibility, icon buttons, and zero horizontal scroll`, async () => {
        await gotoWithRetry(page, `${BASE_URL}/`);

        const desktopNav = page.locator('nav[aria-label="Primary Navigation"]');
        const mobileBtn = page.locator('#mobile-menu-btn');
        const mobileMenu = page.locator('#mobile-menu');

        // Verify header actions bar never overflows horizontally
        const headerActionsOverflow = await page.locator('#public-header-actions').evaluate(el => {
          return el.scrollWidth > el.clientWidth + 2;
        });
        assert.equal(headerActionsOverflow, false, '#public-header-actions must not require horizontal scrolling');

        if (screen.isMobileView) {
          // Mobile (< 768px): Collapsed
          assert.equal(await desktopNav.isVisible(), false, 'Desktop/Tablet navigation must be hidden on mobile');
          assert.equal(await mobileBtn.isVisible(), true, 'Mobile menu toggle button must be visible on mobile');

          // Test toggle open/close & SVG icons inside mobile menu
          await mobileBtn.click();
          assert.equal(await mobileMenu.isVisible(), true, 'Mobile dropdown menu did not open on click');
          const mobileIcons = await mobileMenu.locator('a svg').count();
          assert.ok(mobileIcons >= 6, `Expected SVG icons on all mobile menu items, found ${mobileIcons}`);
          await page.keyboard.press('Escape');
          assert.equal(await mobileMenu.isVisible(), false, 'Mobile dropdown menu did not close on Escape');
        } else {
          // Desktop & Tablet (>= 768px): Expanded & Visible
          assert.equal(await desktopNav.isVisible(), true,
            `${screen.name} must show expanded Primary Navigation in header`);
          assert.equal(await mobileBtn.isVisible(), false,
            `${screen.name} must NOT show mobile hamburger button`);
          const navIcons = await desktopNav.locator('a svg').count();
          assert.ok(navIcons >= 6, `Expected SVG icons on all primary navigation items, found ${navIcons}`);
        }
      });

      // Test C: Embedded UI for Industrial & Medical HMI Discipline (TouchGFX on STM32 MCU + Qt on MPU)
      await check(`${screen.name} - Embedded UI / HMI (TouchGFX on STM32 MCU & Qt on MPU) across Home, Services, Detail, and RFQ`, async () => {
        // 1. Homepage: Archetype pill, spotlight card, and estimator phase pill
        await gotoWithRetry(page, `${BASE_URL}/`);
        const hmiArchetypePill = page.locator('#archetypePills button[data-type="hmi"]');
        assert.equal(await hmiArchetypePill.count(), 1, 'Missing TouchGFX / Qt HMI archetype pill on homepage');
        await hmiArchetypePill.click();
        const snippetText = await page.locator('#liveCodeSnippet').textContent();
        assert.ok(snippetText.includes('TouchGFX') || snippetText.includes('STM32'), 'HMI archetype code snippet did not render TouchGFX / STM32 code');

        const hmiEstimatorPill = page.locator('#estimatorPhasePills button[data-val="hmi"]');
        assert.equal(await hmiEstimatorPill.count(), 1, 'Missing TouchGFX / Qt HMI phase pill in interactive estimator');

        // 2. Services overview: Discipline 03 section & TouchGFX vs Qt comparison matrix
        await gotoWithRetry(page, `${BASE_URL}/services`);
        const hmiSection = page.locator('#hmi-ui');
        assert.equal(await hmiSection.count(), 1, 'Missing #hmi-ui discipline section on /services');
        const hmiText = await hmiSection.textContent();
        assert.ok(hmiText.includes('TouchGFX') && hmiText.includes('Qt'), 'Discipline 03 must highlight both TouchGFX (STM32 MCU) and Qt (MPU)');

        // 3. Dedicated Service Detail Page: /services/embedded-ui-hmi-development
        await gotoWithRetry(page, `${BASE_URL}/services/embedded-ui-hmi-development`);
        const detailHeading = await page.locator('h1').textContent();
        assert.ok(detailHeading.includes('Embedded UI for Industrial & Medical HMI'), 'Service detail H1 mismatch');
        const detailBody = await page.locator('main').textContent();
        assert.ok(detailBody.includes('Chrom-ART') && detailBody.includes('Qt / QML'), 'Service detail missing TouchGFX Chrom-ART or Qt / QML architecture matrix');

        // 4. Contact / RFQ Page: Discipline icon button & query parameter pre-selection
        await gotoWithRetry(page, `${BASE_URL}/contact?service=embedded-ui-hmi-development`);
        const rfqHmiBtn = page.locator('#rfq-discipline-hmi');
        assert.equal(await rfqHmiBtn.count(), 1, 'Missing #rfq-discipline-hmi button on /contact');
        const rfqSvgCount = await page.locator('#rfq-service-grid .rfq-type-btn svg').count();
        assert.ok(rfqSvgCount >= 6, 'All RFQ discipline buttons must include SVG icons');
      });

      // Test D: Admin Dashboard Regrouped 3-Zone Layout & Non-Scrolling Mobile Icon Grid
      await check(`${screen.name} - Regrouped 3-Zone Admin Dashboard & non-scrolling mobile icon navigation`, async () => {
        await gotoWithRetry(page, `${BASE_URL}/admin`);

        // Verify no page-level horizontal overflow on /admin
        const adminOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 2;
        });
        assert.equal(adminOverflow, false, `Admin dashboard has horizontal overflow on ${screen.name}`);

        // Verify regrouped 3-Zone Command Center headings and quick actions
        const bodyText = await page.locator('main').textContent();
        assert.ok(bodyText.includes('Platform Telemetry Pulse'), 'Missing Zone 1: Platform Telemetry Pulse');
        assert.ok(bodyText.includes('Lead & Audience Pipeline'), 'Missing Zone 2: Lead & Audience Pipeline');
        assert.ok(bodyText.includes('System Configuration Dock'), 'Missing Zone 3: System Configuration Dock');
        assert.equal(await page.locator('#cronBtn').count(), 1, 'Missing #cronBtn AI Auto-Blogger quick action');

        const adminTopNav = page.locator('nav[aria-label="Admin navigation"]');
        const adminMobileNav = page.locator('nav[aria-label="Admin mobile navigation"]');

        if (screen.isMobileView) {
          assert.equal(await adminTopNav.isVisible(), false,
            'Admin top-bar navigation must be hidden on mobile view');
          assert.equal(await adminMobileNav.isVisible(), true,
            'Admin mobile sub-nav grid must be visible on mobile view');

          // Ensure Admin mobile nav has SVG icons and ZERO horizontal scroll
          const mobileNavIcons = await adminMobileNav.locator('a svg').count();
          assert.equal(mobileNavIcons, 6, 'All 6 admin mobile nav buttons must contain SVG icons');
          const mobileNavScroll = await adminMobileNav.evaluate(el => el.scrollWidth > el.clientWidth + 2);
          assert.equal(mobileNavScroll, false, 'Admin mobile navigation must not scroll horizontally');
        } else {
          assert.equal(await adminTopNav.isVisible(), true,
            `${screen.name} must show Admin navigation tabs in header`);
          assert.equal(await adminMobileNav.isVisible(), false,
            `${screen.name} must NOT show mobile sub-nav row`);
        }

        // Also check /admin/settings defaults to ai-engine, has no #feature-flags, and mobile nav grid has no horizontal overflow
        await gotoWithRetry(page, `${BASE_URL}/admin/settings`);
        const settingsNav = page.locator('#settings-sidebar-nav');
        const settingsNavOverflow = await settingsNav.evaluate(el => el.scrollWidth > el.clientWidth + 2);
        assert.equal(settingsNavOverflow, false, '#settings-sidebar-nav must not overflow horizontally');
        const defaultTab = await page.locator('#settings-sidebar-nav .settings-nav-btn[aria-current="page"]').getAttribute('data-settings-tab');
        assert.equal(defaultTab, 'ai-engine', '/admin/settings must default to ai-engine');
        assert.equal(await page.locator('#feature-flags').count(), 0, '#feature-flags must be removed');
        assert.equal(await page.locator('#integrations').count(), 0, '#integrations must not exist');

        // Verify #monetization-ads has no top ad-placement-card grid and clicking preview slots toggles active state
        await gotoWithRetry(page, `${BASE_URL}/admin/settings#monetization-ads`);
        assert.equal(await page.locator('#monetization-ads .ad-placement-card').count(), 0, 'Top .ad-placement-card grid must be removed');
        const slot1Before = await page.locator('#ad_toggle_slot1').inputValue();
        await page.locator('#ad_wf_slot1').click();
        const slot1After = await page.locator('#ad_toggle_slot1').inputValue();
        assert.notEqual(slot1Before, slot1After, 'Clicking #ad_wf_slot1 must toggle #ad_toggle_slot1');
        await page.locator('#ad_wf_slot1').click(); // restore

        // Verify /admin/inquiries, /admin/subscribers, /admin/posts, /admin/projects have ZERO horizontal scroll (page or inner containers on mobile)
        for (const adminSubPage of ['/admin/inquiries', '/admin/subscribers', '/admin/posts', '/admin/projects']) {
          await gotoWithRetry(page, `${BASE_URL}${adminSubPage}`);
          const scrollCheck = await page.evaluate((isMobile) => {
            const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
            const h1 = document.querySelector('main h1');
            const h1Width = h1 ? h1.getBoundingClientRect().width : 0;
            const innerScrollingEls = [];
            let postsActionWrap = false;
            if (isMobile) {
              document.querySelectorAll('main *').forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || el.clientWidth === 0) return;
                if (['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 2) {
                  innerScrollingEls.push({ tag: el.tagName, className: el.className, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
                }
              });
              if (window.location.pathname === '/admin/posts') {
                document.querySelectorAll('.md\\:hidden > div').forEach(card => {
                  const row = card.lastElementChild;
                  if (row && row.children.length === 2) {
                    const left = row.children[0].getBoundingClientRect();
                    const right = row.children[1].getBoundingClientRect();
                    if (Math.abs(left.top - right.top) > 20) postsActionWrap = true;
                  }
                });
              }
            }
            return { docOverflow, h1Width, innerScrollingEls, postsActionWrap };
          }, screen.isMobileView);
          assert.equal(scrollCheck.docOverflow, false, `${adminSubPage} has page-level horizontal overflow on ${screen.name}`);
          assert.ok(scrollCheck.h1Width >= 240, `${adminSubPage} h1 width (${scrollCheck.h1Width}px) is squeezed on ${screen.name}`);
          assert.equal(scrollCheck.postsActionWrap, false, `${adminSubPage} mobile card actions wrapped onto a new line on ${screen.name}`);
          assert.equal(scrollCheck.innerScrollingEls.length, 0,
            `${adminSubPage} has inner horizontal scrollbar on ${screen.name}: ${JSON.stringify(scrollCheck.innerScrollingEls)}`);
        }
      });

      // Test E: Search Dialog & Focus Restoration (Including New HMI Service in Search Index)
      await check(`${screen.name} - Search modal opens, finds TouchGFX & Inquiries, and restores focus on Escape`, async () => {
        await gotoWithRetry(page, `${BASE_URL}/admin`);
        const searchBtn = page.locator('#header-search-btn');
        assert.ok(await searchBtn.isVisible(), 'Header search button is not visible');

        await searchBtn.click();
        const modal = page.locator('#header-search-modal');
        assert.ok(await modal.isVisible(), 'Header search modal did not open');

        const input = page.locator('#headerSearchInput');
        await input.fill('touchgfx');
        assert.ok(await page.locator('#headerSearchResults a[href*="/services/embedded-ui-hmi-development"]').count() >= 1,
          'Search results missing new TouchGFX / Qt HMI service link');

        await input.fill('inquiries');
        assert.ok(await page.locator('#headerSearchResults a[href*="/admin/inquiries"]').count() >= 1,
          'Search results missing inquiry link');

        // Close search with Escape and verify focus restoration
        await page.keyboard.press('Escape');
        assert.equal(await modal.isVisible(), false, 'Search modal did not close on Escape');
        const focused = await searchBtn.evaluate(el => el === document.activeElement);
        assert.equal(focused, true, 'Focus was not restored to search trigger button');
      });

      // Test F: Theme Appearance Toggle & Palette Menu
      await check(`${screen.name} - Theme mode toggle and accent color menu`, async () => {
        await gotoWithRetry(page, `${BASE_URL}/`);

        const paletteBtn = page.locator('#palette-dropdown-btn');
        assert.ok(await paletteBtn.isVisible(), 'Palette dropdown trigger is missing');
        await paletteBtn.click();

        const menu = page.locator('#palette-dropdown-menu-appearance');
        assert.ok(await menu.isVisible(), 'Appearance dropdown menu did not open');

        const isDarkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        const modeSwitchLabel = menu.locator('label.appearance-mode');
        await modeSwitchLabel.click();
        const isDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        assert.notEqual(isDarkBefore, isDarkAfter, 'Night mode switch did not toggle dark mode class');

        // Revert toggle
        await modeSwitchLabel.click();

        const paletteOptions = menu.locator('button[data-scheme]');
        assert.ok(await paletteOptions.count() >= 3, 'Missing accent palette options');

        await paletteBtn.click();
      });

      // Test G: Engineering Calculators on /tools
      await check(`${screen.name} - Engineering tools page renders calculators interactively`, async () => {
        await gotoWithRetry(page, `${BASE_URL}/tools`);
        const toolCards = page.locator('a[href^="/tools/"]');
        assert.ok(await toolCards.count() >= 6, 'Missing calculator cards on /tools');
        assert.equal(pageErrors.length, 0, `JavaScript errors on /tools: ${pageErrors.join(', ')}`);
      });

      await context.close();
    }

    console.log(`\n========================================================`);
    console.log(`📊 UI Test Results: ${passedTests}/${totalTests} Passed`);
    console.log(`========================================================\n`);

    if (failures.length > 0) {
      console.error(`💥 Failed tests:`);
      failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f.desc} -> ${f.error}`));
      process.exit(1);
    } else {
      console.log(`🎉 All Desktop, Tablet, and Mobile UI tests passed with zero defects!\n`);
      process.exit(0);
    }
  } catch (fatal) {
    console.error('Fatal test error:', fatal);
    process.exit(2);
  } finally {
    await browser.close();
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(resolve));
    }
  }
}

run();
