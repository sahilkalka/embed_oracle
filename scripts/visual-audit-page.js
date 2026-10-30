const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

const TARGET_PATH = process.argv[2] || '/admin';
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

async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    targetPath: TARGET_PATH,
    url: `${BASE_URL}${TARGET_PATH}`,
    results: [],
    errors: [],
  };

  try {
    // Check if route is admin
    const isAdmin = TARGET_PATH.startsWith('/admin') && TARGET_PATH !== '/admin/login';
    let authCookies = [];

    if (isAdmin) {
      const loginContext = await browser.newContext();
      const loginPage = await loginContext.newPage();
      await loginPage.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
      await loginPage.fill('input[name="email"]', 'admin@embeddedindia.in');
      await loginPage.fill('input[name="password"]', 'AdminEmbedded@2026!');
      await loginPage.click('button[type="submit"]');
      await loginPage.waitForURL('**/admin**', { timeout: 10000 });
      authCookies = (await loginContext.storageState()).cookies;
      await loginContext.close();
    }

    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });

        if (authCookies.length > 0) {
          await context.addCookies(authCookies);
        }

        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.goto(`${BASE_URL}${TARGET_PATH}`, { waitUntil: 'networkidle', timeout: 30000 });

        // Apply theme explicitly to DOM
        await page.evaluate(t => {
          if (t === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('color-theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('color-theme', 'light');
          }
        }, theme);

        await page.waitForTimeout(400);

        const safeSlug = TARGET_PATH.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'home';
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

        // Run axe contrast audit
        let contrastViolations = [];
        try {
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2aa', 'wcag21aa'])
            .analyze();
          contrastViolations = axe.violations
            .filter(v => v.id === 'color-contrast')
            .flatMap(v => v.nodes.map(n => ({
              target: n.target.join(' '),
              html: n.html.slice(0, 120),
              summary: n.failureSummary,
            })))
            .slice(0, 10);
        } catch (e) {
          report.errors.push(`Axe audit error: ${e.message}`);
        }

        // Check for clipped text and overlapping elements
        const domIssues = await page.evaluate(() => {
          const issues = [];
          const all = Array.from(document.querySelectorAll('a, button, input, select, textarea, h1, h2, h3, p, span'));
          const vw = document.documentElement.clientWidth;

          for (const el of all) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            // Off right
            if (rect.right > vw + 2) {
              issues.push({ type: 'overflow-right', tag: el.tagName, text: el.textContent?.slice(0, 30), right: rect.right, vw });
            }
          }
          return issues.slice(0, 8);
        });

        report.results.push({
          viewport: vp.name,
          theme,
          screenshot: path.relative(path.join(__dirname, '..'), screenshotPath),
          overflow,
          contrastViolations,
          domIssues,
          consoleErrors,
        });

        await context.close();
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();

