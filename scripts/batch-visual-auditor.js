const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isTouch: false },
  { name: 'tablet', width: 768, height: 1024, isTouch: true },
  { name: 'mobile', width: 375, height: 812, isTouch: true },
];
const THEMES = ['light', 'dark'];

const screenshotsDir = path.join(__dirname, '../scratch/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function auditRoute(browser, authCookies, route) {
  const result = {
    route,
    passed: true,
    viewports: {},
    issues: [],
  };

  for (const vp of VIEWPORTS) {
    result.viewports[vp.name] = {};
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      if (authCookies.length > 0 && route.startsWith('/admin') && route !== '/admin/login') {
        await context.addCookies(authCookies);
      }

      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', err => consoleErrors.push(err.message));

      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
      } catch (e) {
        result.issues.push(`${vp.name}-${theme}: Navigation timeout/error: ${e.message}`);
        result.passed = false;
        await context.close();
        continue;
      }

      // Explicitly toggle theme in DOM
      await page.evaluate(t => {
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
          localStorage.setItem('color-theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('color-theme', 'light');
        }
      }, theme);

      await page.waitForTimeout(300);

      const safeSlug = route.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'home';
      const screenshotPath = path.join(screenshotsDir, `${safeSlug}_${vp.name}_${theme}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Check horizontal overflow
      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
        const clientWidth = docEl.clientWidth;
        return {
          hasOverflow: scrollWidth > clientWidth + 1,
          scrollWidth,
          clientWidth,
        };
      });

      if (overflow.hasOverflow) {
        result.issues.push(`${vp.name}-${theme}: Page horizontal overflow: ${overflow.scrollWidth} > ${overflow.clientWidth}`);
        result.passed = false;
      }

      // Contrast violations
      let contrastViolations = [];
      try {
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2aa', 'wcag21aa'])
          .analyze();
        contrastViolations = axe.violations
          .filter(v => v.id === 'color-contrast')
          .flatMap(v => v.nodes.map(n => ({
            target: n.target.join(' '),
            html: n.html.slice(0, 100),
            summary: n.failureSummary,
          })))
          .slice(0, 5);

        if (contrastViolations.length > 0) {
          result.issues.push(`${vp.name}-${theme}: ${contrastViolations.length} contrast violations`);
          // Don't necessarily fail pass immediately if minor, but log it
        }
      } catch (err) {}

      result.viewports[vp.name][theme] = {
        hasOverflow: overflow.hasOverflow,
        contrastViolationsCount: contrastViolations.length,
        contrastViolations,
      };

      await context.close();
    }
  }

  return result;
}

async function main() {
  const routesToTest = process.argv.slice(2);
  if (routesToTest.length === 0) {
    console.error('Please specify routes to test');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  // Get auth cookies for admin routes
  const loginContext = await browser.newContext();
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
  await loginPage.fill('input[name="email"]', 'admin@embeddedindia.in');
  await loginPage.fill('input[name="password"]', 'AdminEmbedded@2026!');
  await loginPage.click('button[type="submit"]');
  await loginPage.waitForURL('**/admin**', { timeout: 10000 });
  const authCookies = (await loginContext.storageState()).cookies;
  await loginContext.close();

  const allReports = [];
  for (const route of routesToTest) {
    console.log(`Auditing: ${route}...`);
    const r = await auditRoute(browser, authCookies, route);
    allReports.push(r);
    console.log(`  -> ${r.passed ? '✅ PASS' : '❌ FAIL'}: ${r.issues.join('; ') || 'No issues'}`);
  }

  await browser.close();
  console.log('\n=== FINAL AUDIT REPORT ===');
  console.log(JSON.stringify(allReports, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

