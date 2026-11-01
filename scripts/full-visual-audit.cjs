const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');

process.env.NODE_ENV = 'test';

const app = require('../src/server');
const prisma = require('../src/services/db');
const toolsRegistry = require('../src/data/toolsRegistry');
const { JWT_SECRET } = require('../src/middleware/auth');

prisma.analytics.create = async () => ({});
prisma.incrementToolExecution = () => {};
prisma.incrementPostView = () => {};
const findTestimonial = prisma.testimonial.findUnique.bind(prisma.testimonial);
prisma.testimonial.findUnique = async options => {
  if (options.where.id === 'visual-audit-testimonial') {
    return {
      id: 'visual-audit-testimonial',
      name: 'Visual Audit Client',
      role: 'Engineering Lead',
      company: 'Example Company',
      quote: 'Representative testimonial content for rendering the edit form.',
      rating: 5,
      isApproved: false,
      isPublic: true,
      source: 'admin',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    };
  }
  return findTestimonial(options);
};

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'tablet', width: 768, height: 1024, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

const OUTPUT_DIR = path.resolve(__dirname, '../scratch/visual-audit-' + new Date().toISOString().replace(/[:.]/g, '-'));
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.md');

function safeName(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'home';
}

async function buildRouteMatrix() {
  const routes = [
    { path: '/', label: 'Home', access: 'public' },
    { path: '/about', label: 'About', access: 'public' },
    { path: '/contact', label: 'Contact', access: 'public' },
    { path: '/services', label: 'Services', access: 'public' },
    { path: '/services/embedded-ui-hmi-development', label: 'Service detail', access: 'public' },
    { path: '/privacy', label: 'Privacy policy', access: 'public' },
    { path: '/privacy-policy', label: 'Privacy policy alias', access: 'public' },
    { path: '/submit-review', label: 'Submit review', access: 'public' },
    { path: '/projects', label: 'Projects', access: 'public' },
    { path: '/blogs', label: 'Blogs', access: 'public' },
    { path: '/tools', label: 'Tools hub', access: 'public' }
  ];

  for (const category of toolsRegistry.getAllCategories()) {
    for (const tool of category.tools) {
      routes.push({
        path: `/tools/${category.slug}/${tool.slug}`,
        label: `Tool: ${tool.title}`,
        access: 'public'
      });
    }
  }

  const [post, project, editablePost, editableProject, editableTestimonial] = await Promise.all([
    prisma.post.findFirst({ where: { status: 'published' }, select: { slug: true } }),
    prisma.project.findFirst({ select: { slug: true } }),
    prisma.post.findFirst({ select: { id: true } }),
    prisma.project.findFirst({ select: { id: true } }),
    prisma.testimonial.findFirst({ select: { id: true } })
  ]);

  if (post) routes.push({ path: `/blogs/${encodeURIComponent(post.slug)}`, label: 'Blog detail', access: 'public' });
  if (project) routes.push({ path: `/projects/${encodeURIComponent(project.slug)}`, label: 'Project detail', access: 'public' });

  const adminRoutes = [
    ['/admin/login', 'Admin login', 'public'],
    ['/admin', 'Admin dashboard'],
    ['/admin/assets', 'Asset manager'],
    ['/admin/traffic', 'Traffic dashboard'],
    ['/admin/inquiries', 'Inquiries'],
    ['/admin/subscribers', 'Subscribers'],
    ['/admin/posts', 'Posts'],
    ['/admin/posts/new', 'Create post'],
    ['/admin/ai', 'AI settings redirect'],
    ['/admin/settings', 'Settings'],
    ['/admin/projects', 'Projects manager'],
    ['/admin/projects/new', 'Create project'],
    ['/admin/customizer', 'Customizer'],
    ['/admin/testimonials', 'Testimonials'],
    ['/admin/testimonials/new', 'Create testimonial']
  ];

  for (const [route, label, access = 'admin'] of adminRoutes) {
    routes.push({ path: route, label, access });
  }

  if (editablePost) routes.push({ path: `/admin/posts/${encodeURIComponent(editablePost.id)}/edit`, label: 'Edit post', access: 'admin' });
  if (editableProject) routes.push({ path: `/admin/projects/${encodeURIComponent(editableProject.id)}/edit`, label: 'Edit project', access: 'admin' });
  const testimonialEditId = editableTestimonial?.id || 'visual-audit-testimonial';
  routes.push({ path: `/admin/testimonials/${encodeURIComponent(testimonialEditId)}/edit`, label: 'Edit testimonial', access: 'admin' });

  return { routes, dynamicData: { post: Boolean(post), project: Boolean(project), editablePost: Boolean(editablePost), editableProject: Boolean(editableProject), editableTestimonial: Boolean(editableTestimonial) } };
}

function makeAdminCookie(baseUrl) {
  const token = jwt.sign({
    userId: 'visual-audit',
    email: 'visual-audit@example.test',
    username: 'Visual Audit',
    role: 'admin'
  }, JWT_SECRET, { expiresIn: '1h' });

  return {
    name: 'admin_token',
    value: token,
    url: baseUrl,
    httpOnly: true,
    sameSite: 'Lax'
  };
}

async function inspectPage(browser, baseUrl, route, viewport, outputDir, authCookie) {
  const result = {
    route: route.path,
    label: route.label,
    viewport: viewport.name,
    status: null,
    finalUrl: '',
    screenshot: '',
    horizontalOverflow: false,
    consoleErrors: [],
    failedRequests: [],
    error: null
  };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile
  });

  if (route.access === 'admin') await context.addCookies([authCookie]);

  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => result.consoleErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseUrl)) result.failedRequests.push(`${request.url()}: ${request.failure()?.errorText || 'request failed'}`);
  });
  page.on('response', response => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      result.failedRequests.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  try {
    const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    result.status = response ? response.status() : null;
    result.finalUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    if (route.access === 'admin' && new URL(page.url()).pathname.startsWith('/admin/login')) {
      result.error = 'Admin route redirected to login; audit authentication was rejected.';
    } else if (!response || response.status() >= 400) {
      result.error = `Unexpected page response: ${result.status || 'no response'}`;
    }

    await page.waitForTimeout(300);
    result.horizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });

    const screenshotName = `${safeName(route.path)}-${viewport.name}.png`;
    const screenshotPath = path.join(outputDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = path.relative(path.resolve(__dirname, '..'), screenshotPath).replace(/\\/g, '/');
  } catch (error) {
    result.error = error.message;
  } finally {
    await context.close();
  }

  return result;
}

async function inspectSettingsTabs(browser, baseUrl, viewport, outputDir, authCookie) {
  const results = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile
  });
  await context.addCookies([authCookie]);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseUrl)) failedRequests.push(`${request.url()}: ${request.failure()?.errorText || 'request failed'}`);
  });
  page.on('response', response => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedRequests.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`${baseUrl}/admin/settings`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  if (new URL(page.url()).pathname.startsWith('/admin/login')) {
    await context.close();
    return [{ route: '/admin/settings', label: 'Settings panels', viewport: viewport.name, error: 'Admin authentication was rejected.' }];
  }

  const tabIds = await page.locator('[data-settings-tab]').evaluateAll(elements =>
    [...new Set(elements.map(element => element.getAttribute('data-settings-tab')).filter(Boolean))]
  );

  for (const tabId of tabIds) {
    const result = {
      route: `/admin/settings#${tabId}`,
      label: `Settings: ${tabId}`,
      viewport: viewport.name,
      status: 200,
      finalUrl: '',
      screenshot: '',
      horizontalOverflow: false,
      consoleErrors,
      failedRequests,
      error: null
    };
    try {
      await page.locator(`[data-settings-tab="${tabId}"]`).first().click();
      await page.waitForTimeout(300);
      result.finalUrl = new URL(page.url()).pathname + new URL(page.url()).hash;
      result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      const screenshotPath = path.join(outputDir, `admin-settings-${safeName(tabId)}-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = path.relative(path.resolve(__dirname, '..'), screenshotPath).replace(/\\/g, '/');
    } catch (error) {
      result.error = error.message;
    }
    results.push(result);
  }

  if (tabIds.length === 0) {
    results.push({ route: '/admin/settings', label: 'Settings panels', viewport: viewport.name, error: 'No settings tabs with data-settings-tab were found.' });
  }

  await context.close();
  return results;
}

function writeReport(results, matrix, viewports) {
  const issues = results.filter(result => result.error || result.horizontalOverflow || result.consoleErrors?.length || result.failedRequests?.length);
  const lines = [
    '# Full Application Visual Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Coverage: ${matrix.routes.length} routes/templates and settings panels at ${viewports.map(viewport => `${viewport.name} (${viewport.width}x${viewport.height})`).join(', ')}.`,
    `Results: ${results.length - issues.length} clean captures; ${issues.length} entries need review.`,
    '',
    '## Data-backed routes',
    '',
    `- Published blog detail available: ${matrix.dynamicData.post ? 'yes' : 'no; no seeded published post was available'}`,
    `- Project detail available: ${matrix.dynamicData.project ? 'yes' : 'no; no seeded project was available'}`,
    `- Existing post edit form available: ${matrix.dynamicData.editablePost ? 'yes' : 'no; no existing post was available'}`,
    `- Existing project edit form available: ${matrix.dynamicData.editableProject ? 'yes' : 'no; no existing project was available'}`,
    `- Existing testimonial edit form available: ${matrix.dynamicData.editableTestimonial ? 'yes' : 'no; no existing testimonial was available'}`,
    '',
    '## Captures',
    ''
  ];

  for (const result of results) {
    const flags = [];
    if (result.error) flags.push(`ERROR: ${result.error}`);
    if (result.horizontalOverflow) flags.push('horizontal overflow');
    if (result.consoleErrors?.length) flags.push(`${result.consoleErrors.length} console error(s)`);
    if (result.failedRequests?.length) flags.push(`${result.failedRequests.length} failed same-origin request(s)`);
    lines.push(`- **${result.viewport} | ${result.label}** ( ${result.route} )${result.status ? `: HTTP ${result.status}` : ''}${flags.length ? `; ${flags.join('; ')}` : '; no automated findings'}${result.screenshot ? `; screenshot:  ${result.screenshot} ` : ''}`.replace(/\u0000/g, '`'));
    for (const error of [...(result.consoleErrors || []), ...(result.failedRequests || [])]) {
      lines.push(`  - ${error.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`Report: ${path.relative(path.resolve(__dirname, '..'), REPORT_PATH).replace(/\\/g, '/')}`);
  console.log(`Captures: ${results.length}; entries needing review: ${issues.length}`);
  return issues.length;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const matrix = await buildRouteMatrix();
  const filters = Object.fromEntries(process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
  const routes = filters.route ? matrix.routes.filter(route => route.path === filters.route) : matrix.routes;
  const viewports = filters.viewport ? VIEWPORTS.filter(viewport => viewport.name === filters.viewport) : VIEWPORTS;
  if (!routes.length || !viewports.length) {
    throw new Error('No matching route or viewport. Use --route=/path and --viewport=desktop|tablet|mobile.');
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authCookie = makeAdminCookie(baseUrl);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      console.log(`Auditing ${viewport.name} (${viewport.width}x${viewport.height})`);
      for (const route of routes) {
        results.push(await inspectPage(browser, baseUrl, route, viewport, OUTPUT_DIR, authCookie));
      }
      if (routes.some(route => route.path === '/admin/settings')) {
        results.push(...await inspectSettingsTabs(browser, baseUrl, viewport, OUTPUT_DIR, authCookie));
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const issueCount = writeReport(results, { ...matrix, routes }, viewports);
  if (issueCount > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});