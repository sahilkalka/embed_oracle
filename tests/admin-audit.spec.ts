import { test, expect, Page, BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

/**
 * ADMIN DASHBOARD AUDIT (read-only)
 * ---------------------------------
 * - Logs in with ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_PASSWORD
 *   (priority: process.env > .env > .env.example)
 * - Crawls every /admin page by GET only. Never submits forms (except login) and
 *   never follows delete/logout/publish/... links, so no data is changed.
 * - Checks: broken pages, JS errors, broken assets, bad data in tables
 *   (undefined / NaN / [object Object] / Invalid Date / raw EJS), visual layout
 *   (cut-off / clipped / overlapping buttons, wrapped labels, sideways scroll),
 *   WCAG (axe), mobile sidebar toggle, and admin security (auth guard, wrong
 *   password, cookie flags, cache-control, noindex).
 * - Writes ADMIN_REPORT.md + admin-audit-screenshots/
 *
 * Run:
 *   AUDIT_URL=https://embeddedindia.in npx playwright test admin-audit.spec.ts --project=Desktop-Chrome
 */

test.setTimeout(0);
test.use({ bypassCSP: true });

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ADMIN_ROOT = '/admin';
const MAX_PAGES = 60;
const MAX_PER_PATTERN = 2;               // e.g. only 2 of /admin/blogs/:id/edit
const MAX_VISUAL_PER_ROUTE = 8;
const MIN_CLIP_PX = 6;
const SHOT_DIR = 'admin-audit-screenshots';
const MAX_SHOTS = 150;
const TEST_WRONG_PASSWORD = (process.env.ADMIN_TEST_WRONG_PASSWORD ?? 'true') !== 'false'; // 1 failed attempt only
const REPORT_CONSOLE_ERRORS = false;

const VIEWPORTS = [
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Laptop',  width: 1366, height: 768  },
  { name: 'Tablet',  width: 768,  height: 1024 },
  { name: 'Mobile',  width: 390,  height: 844  },
];

// Links that could change data or end the session - never visited
const UNSAFE_LINK =
  /logout|log-out|signout|sign-out|delete|remove|destroy|purge|truncate|reset|clear|approve|reject|publish|toggle|archive|restore|backup|import|send|resend|activate|deactivate|ban|block|seed|migrate|duplicate|clone|download|export|\/api\//i;

// Intentional scroll containers (tables wrapped in overflow-x-auto, sliders)
const IGNORE_SELECTOR =
  '[data-audit-ignore], .swiper, [class*="carousel"], [class*="marquee"], [class*="overflow-x-auto"], [class*="overflow-auto"], [class*="table-responsive"]';

type Severity = 'High' | 'Medium' | 'Low';
const SEVERITY_ORDER: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };

const VISUAL_CATEGORY: Record<string, string> = {
  VIEWPORT_CLIP:    'Visual: Cut off at screen edge',
  ANCESTOR_CLIP:    'Visual: Clipped by container',
  CONTENT_OVERFLOW: 'Visual: Label spills out of button',
  BUTTON_WRAP:      'Visual: Button label wraps',
  ICON_MISALIGNED:  'Visual: Icon/label misaligned',
  OVERLAP:          'Visual: Overlapping controls',
  IMG_DISTORTED:    'Visual: Image stretched',
  PAGE_OVERFLOW:    'Responsive: Page scrolls sideways',
  BAD_DATA:         'Data: Broken value shown',
  RAW_TEMPLATE:     'Data: Template/server error shown',
};

const FREEZE_CSS = `
*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}
html{scroll-behavior:auto!important}
`;

// ---------------------------------------------------------------------------
// .env loader (no dotenv dependency)
// ---------------------------------------------------------------------------
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

function loadCredentials() {
  const fromExample = readEnvFile(path.resolve('.env.example'));
  const fromEnv = readEnvFile(path.resolve('.env'));
  const pick = (...keys: string[]) => {
    for (const k of keys) if (process.env[k]) return { v: process.env[k]!, src: 'process.env' };
    for (const k of keys) if (fromEnv[k]) return { v: fromEnv[k], src: '.env' };
    for (const k of keys) if (fromExample[k]) return { v: fromExample[k], src: '.env.example' };
    return { v: '', src: 'missing' };
  };
  const email = pick('ADMIN_DEFAULT_EMAIL', 'ADMIN_EMAIL', 'ADMIN_USER');
  const password = pick('ADMIN_DEFAULT_PASSWORD', 'ADMIN_PASSWORD', 'ADMIN_PASS');
  return { email: email.v, password: password.v, source: `${email.src}/${password.src}` };
}

// ---------------------------------------------------------------------------
// Source location helpers
// ---------------------------------------------------------------------------
const grepCache = new Map<string, string[]>();
function grepAll(token: string): string[] {
  if (grepCache.has(token)) return grepCache.get(token)!;
  let hits: string[] = [];
  try {
    const out = execFileSync('git', ['grep', '-n', '-F', '-e', token, '--', 'views', 'public/js'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    hits = out.split('\n').filter((l) => /\.(ejs|js):\d+:/.test(l)).map((l) => l.split(':').slice(0, 2).join(':'));
  } catch {}
  grepCache.set(token, hits);
  return hits;
}

function inferAdminView(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, '').replace(/\/(\d+|[0-9a-f]{24}|[0-9a-f-]{36})(?=\/|$)/gi, '');
  const candidates = [`views/${clean}.ejs`, `views/${clean}/index.ejs`, `views/pages/${clean}.ejs`, `views/admin/${clean.replace(/^admin\/?/, '') || 'dashboard'}.ejs`, 'views/admin/index.ejs', 'views/admin/dashboard.ejs'];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return `Route: ${route}`;
}

function findSourceLocation(htmlSnippet: string, route: string, visibleText = ''): string {
  const openTag = htmlSnippet.match(/^<[^>]+>/)?.[0] || htmlSnippet;
  const tokens: string[] = [];
  const attr =
    openTag.match(/\bid=["']([^"']{3,})["']/) ||
    openTag.match(/\bdata-(?!audit)[a-z-]+=["']([^"']{4,})["']/) ||
    openTag.match(/\baria-label=["']([^"']{4,})["']/) ||
    openTag.match(/\bhref=["']([^"'#?]{4,})["']/);
  if (attr?.[1]) tokens.push(attr[1]);
  const text = (visibleText || htmlSnippet.match(/>([^<]{4,60})</)?.[1] || '').replace(/\s+/g, ' ').replace(/["'\\]/g, '').trim();
  if (text.length > 3) tokens.push(text.length > 30 ? text.slice(0, 30).replace(/\s+\S*$/, '') : text);
  const view = inferAdminView(route);
  for (const t of tokens) {
    const hits = grepAll(t);
    if (!hits.length) continue;
    return hits.find((h) => h.startsWith(view)) || hits.find((h) => h.includes('admin')) || hits[0];
  }
  return view;
}

function getElementSignature(html: string): string {
  const tag = (html.match(/^<([a-z0-9-]+)/i)?.[1] || 'el').toLowerCase();
  const id = html.match(/\bid=["']([^"']+)["']/)?.[1] || '';
  const cls = html.match(/\bclass=["']([^"']+)["']/)?.[1] || '';
  return `${tag}#${id}.${cls.trim().replace(/\s+/g, '.')}`;
}

// /admin/blogs/42/edit -> /admin/blogs/:id/edit
function routePattern(route: string): string {
  return route
    .split('/')
    .map((s) => (/^\d+$/.test(s) || /^[0-9a-f]{24}$/i.test(s) || /^[0-9a-f-]{36}$/i.test(s) ? ':id' : s))
    .join('/');
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
async function settle(page: Page, ms = 60) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(ms);
}

async function preparePage(page: Page) {
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
  await page.evaluate(async () => { try { await (document as any).fonts?.ready; } catch {} });
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await settle(page, 100);
}

const PASSWORD_SEL = 'input[type="password"]';
const EMAIL_SEL = 'input[type="email"], input[name*="email" i], input[name="username" i], input[id*="email" i], input[autocomplete="username"]';
const SUBMIT_SEL = 'button[type="submit"], input[type="submit"], form button:not([type="button"])';

async function hasLoginForm(page: Page) {
  return page.locator('form[action="/admin/login"]').first().isVisible().catch(() => false);
}

async function submitLogin(page: Page, email: string, password: string) {
  await page.locator(EMAIL_SEL).first().fill(email);
  await page.locator(PASSWORD_SEL).first().fill(password);
  const submit = page.locator(SUBMIT_SEL).first();
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    (await submit.isVisible().catch(() => false)) ? submit.click() : page.locator(PASSWORD_SEL).first().press('Enter'),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

let shotCount = 0;
async function captureElement(page: Page, auditId: string, name: string): Promise<string | undefined> {
  if (shotCount >= MAX_SHOTS) return;
  try {
    const loc = page.locator(`[data-audit-id="${auditId}"]`).first();
    if (!(await loc.count())) return;
    await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await loc.evaluate((el: HTMLElement) => { el.style.outline = '3px solid #ff0033'; el.style.outlineOffset = '2px'; });
    const box = await loc.boundingBox();
    const vp = page.viewportSize();
    let file: string | undefined;
    if (box && vp) {
      const pad = 60;
      const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
      const w = Math.min(vp.width - x, box.width + pad * 2), h = Math.min(vp.height - y, box.height + pad * 2);
      if (w > 5 && h > 5) {
        file = path.join(SHOT_DIR, `${String(++shotCount).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`);
        await page.screenshot({ path: file, clip: { x, y, width: w, height: h } });
      }
    }
    await loc.evaluate((el: HTMLElement) => { el.style.outline = ''; el.style.outlineOffset = ''; });
    return file;
  } catch { return; }
}

// ---------------------------------------------------------------------------
// In-browser visual + data scan (only checks a human would notice)
// ---------------------------------------------------------------------------
type Finding = { kind: string; severity: Severity; detail: string; fix: string; html: string; text: string; sig: string; auditId: string };

const adminScan = (args: { minClip: number; ignoreSel: string; checkData: boolean }) => {
  const T = args.minClip;
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('[data-audit-id]').forEach((e) => e.removeAttribute('data-audit-id'));
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [role="button"], [role="tab"]';
  const findings: any[] = [];
  const seen = new Set<string>();
  let idSeq = 0;

  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const snippet = (el: Element) => clean(el.outerHTML).slice(0, 140);
  const sigOf = (el: Element) => `${el.tagName.toLowerCase()}#${el.id || ''}.${(el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 8).join('.')}`;
  const ownText = (el: Element) => clean(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(' '));
  const fullText = (el: Element) => clean((el as HTMLElement).innerText || el.textContent || '').slice(0, 60);
  const isVisible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('[aria-hidden="true"], [inert], [hidden], .sr-only, template, noscript')) return false;
    if (args.ignoreSel && el.closest(args.ignoreSel)) return false;
    const a = el as any;
    if (typeof a.checkVisibility === 'function' && !a.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return true;
  };
  const inFixed = (el: Element) => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };
  const visibleRect = (el: Element) => {
    const box = el.getBoundingClientRect();
    let left = box.left;
    let right = box.right;
    let top = box.top;
    let bottom = box.bottom;
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const parentBox = parent.getBoundingClientRect();
      const clipLeft = parentBox.left + parent.clientLeft;
      const clipTop = parentBox.top + parent.clientTop;
      if (style.overflowX !== 'visible') {
        left = Math.max(left, clipLeft);
        right = Math.min(right, clipLeft + parent.clientWidth);
      }
      if (style.overflowY !== 'visible') {
        top = Math.max(top, clipTop);
        bottom = Math.min(bottom, clipTop + parent.clientHeight);
      }
      if (right <= left || bottom <= top) return null;
    }
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const textRects = (el: Element) => {
    const out: DOMRect[] = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      if (!(n.textContent || '').trim() || n.parentElement?.closest('.sr-only')) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const rr of Array.from(rg.getClientRects())) if (rr.width > 0.5 && rr.height > 0.5) out.push(rr);
    }
    return out;
  };
  const lineCount = (rects: DOMRect[]) => {
    const tops: number[] = [];
    for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
    return tops.length;
  };
  const push = (el: Element, kind: string, severity: string, detail: string, fix: string) => {
    const sig = sigOf(el);
    if (seen.has(kind + '|' + sig)) return;
    seen.add(kind + '|' + sig);
    const html = snippet(el);
    const auditId = `a${++idSeq}`;
    el.setAttribute('data-audit-id', auditId);
    findings.push({ kind, severity, detail, fix, html, text: fullText(el), sig, auditId });
  };

  const se = document.documentElement;
  if (se.scrollWidth > se.clientWidth + T) {
    findings.push({ kind: 'PAGE_OVERFLOW', severity: 'High', detail: `Page scrolls sideways (${se.scrollWidth}px > ${se.clientWidth}px)`,
      fix: 'Wrap wide tables in <div class="overflow-x-auto">, and add min-w-0 to the main content column next to the sidebar.',
      html: '<html>', text: '', sig: 'html', auditId: '' });
  }

  const candidates: Element[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (el instanceof SVGElement || ['SCRIPT', 'STYLE', 'BR', 'NOSCRIPT', 'TEMPLATE', 'IFRAME'].includes(el.tagName)) continue;
    const interactive = el.matches(INTERACTIVE);
    if (!interactive && el.tagName !== 'IMG' && ownText(el).length < 2) continue;
    if (!isVisible(el)) continue;
    candidates.push(el);
  }

  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const interactive = el.matches(INTERACTIVE);
    const isImg = el.tagName === 'IMG';
    const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    const label = interactive ? 'Button/link' : isImg ? 'Image' : 'Text';

    // Bad data rendered into the UI (tables, stat cards, badges)
    if (args.checkData && !interactive && !isImg) {
      const t = ownText(el);
      if (/\b(undefined|NaN|\[object Object\]|Invalid Date)\b/.test(t) || /^null$/i.test(t)) {
        push(el, 'BAD_DATA', 'High', `Shows broken value: "${t.slice(0, 60)}"`,
          'Guard the value in the EJS template / controller (e.g. <%= item.x ?? "-" %>, format dates only when valid).');
        continue;
      }
      if (/<%|%>|ReferenceError|TypeError:|Cannot read propert|is not defined/.test(t)) {
        push(el, 'RAW_TEMPLATE', 'High', `Template/server error visible: "${t.slice(0, 60)}"`,
          'Fix the EJS expression or pass the missing variable from the route handler.');
        continue;
      }
    }

    // Cut off at the screen edge
    if ((r.left < -T && r.right > T) || (r.right > vw + T && r.left < vw - T)) {
      push(el, 'VIEWPORT_CLIP', interactive ? 'High' : 'Medium',
        `${label} cut off at screen edge (left=${Math.round(r.left)}, right=${Math.round(r.right)}, screen=${vw})`,
        'Wrap or stack the toolbar/row on small screens (flex-wrap / flex-col sm:flex-row), min-w-0 on text, shrink-0 on buttons.');
      continue;
    }

    // Clipped by an overflow:hidden ancestor (cards, sidebar, modals)
    if (!isImg) {
      let clippedBy: Element | null = null;
      let dir = '';
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        const ox = acs.overflowX, oy = acs.overflowY;
        if (((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 1) || ((oy === 'auto' || oy === 'scroll') && a.scrollHeight > a.clientHeight + 1)) break;
        const hidX = ox === 'hidden' || ox === 'clip', hidY = oy === 'hidden' || oy === 'clip';
        if (!hidX && !hidY) continue;
        const ar = a.getBoundingClientRect();
        if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) break; // fully hidden = intentional
        if (hidX && (r.right > ar.right + T || r.left < ar.left - T)) { clippedBy = a; dir = 'horizontally'; break; }
        if (hidY && (r.bottom > ar.bottom + T || r.top < ar.top - T)) { clippedBy = a; dir = 'vertically'; break; }
      }
      if (clippedBy) {
        push(el, 'ANCESTOR_CLIP', interactive ? 'High' : 'Medium', `${label} clipped ${dir} by \`${snippet(clippedBy).slice(0, 90)}\``,
          'Let the container grow or wrap its content; for tables use an overflow-x-auto wrapper instead of overflow-hidden.');
        continue;
      }
    }

    if (interactive && !isField) {
      // Label wider than its button
      if (cs.display !== 'inline' && el.clientWidth > 0 && el.scrollWidth - el.clientWidth > T && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        push(el, 'CONTENT_OVERFLOW', 'High', `Label spills ${el.scrollWidth - el.clientWidth}px outside button "${fullText(el)}"`,
          'Remove fixed width on the button or give it shrink-0 / min-w-fit.');
      }
      const looksLikeButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ||
        (el.tagName === 'A' && cs.display !== 'inline' && cs.flexDirection !== 'column' &&
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0));
      if (looksLikeButton) {
        const rects = textRects(el);
        const words = fullText(el).split(' ').filter(Boolean).length;
        const lines = lineCount(rects);
        if (words > 0 && words <= 3 && lines > 1) {
          push(el, 'BUTTON_WRAP', 'Medium', `Button "${fullText(el)}" wraps onto ${lines} lines (${Math.round(r.width)}px)`,
            'Add whitespace-nowrap + shrink-0, or let the toolbar wrap.');
        }
        const icon = Array.from(el.querySelectorAll('svg, i, img')).find((i) => i.getBoundingClientRect().width > 0);
        if (icon && rects.length) {
          const ir = icon.getBoundingClientRect();
          const top = Math.min(...rects.map((x) => x.top)), bottom = Math.max(...rects.map((x) => x.bottom));
          if (ir.bottom <= top + 1 || ir.top >= bottom - 1) {
            push(el, 'ICON_MISALIGNED', 'Medium', `Icon and label of "${fullText(el)}" on different lines`,
              'Use inline-flex items-center gap-2 whitespace-nowrap; shrink-0 on the icon.');
          }
        }
      }
    }

    if (isImg) {
      const img = el as HTMLImageElement;
      if (img.naturalWidth && img.naturalHeight && cs.objectFit === 'fill') {
        const nr = img.naturalWidth / img.naturalHeight;
        if (Math.abs(nr - r.width / r.height) / nr > 0.06) {
          push(el, 'IMG_DISTORTED', 'Medium', `Image stretched (natural ${img.naturalWidth}x${img.naturalHeight}, shown ${Math.round(r.width)}x${Math.round(r.height)})`,
            'Add object-cover / object-contain, or h-auto.');
        }
      }
    }
  }

  // Overlapping controls (at least one side clickable)
  const boxes = candidates
    .filter((e) => e.tagName !== 'IMG' && getComputedStyle(e).display !== 'inline')
    .flatMap((el) => {
      const r = visibleRect(el);
      return r ? [{ el, r, fixed: inFixed(el), inter: el.matches(INTERACTIVE) }] : [];
    })
    .sort((a, b) => a.r.top - b.r.top);
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j];
      if (B.r.top >= A.r.bottom) break;
      if (A.fixed !== B.fixed || (!A.inter && !B.inter)) continue;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (ix <= T || iy <= T) continue;
      if ((ix * iy) / Math.min(A.r.width * A.r.height, B.r.width * B.r.height) < 0.3) continue;
      push(A.el, 'OVERLAP', A.inter && B.inter ? 'High' : 'Medium',
        `"${fullText(A.el) || A.el.tagName}" overlaps "${fullText(B.el) || B.el.tagName}" — other: \`${snippet(B.el).slice(0, 80)}\``,
        'Fix absolute positioning / negative margins, or let the header/toolbar wrap.');
    }
  }
  return findings;
};

// ---------------------------------------------------------------------------
// TEST
// ---------------------------------------------------------------------------
test('Admin Dashboard Audit (read-only)', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'Desktop-Chrome', 'Handled internally across all viewports');

  const startTime = Date.now();
  const rootUrl = (process.env.AUDIT_URL || baseURL || 'http://localhost:3000').replace(/\/+$/, '');
  const creds = loadCredentials();
  if (!creds.email || !creds.password) {
    throw new Error('Admin credentials not found. Set ADMIN_DEFAULT_EMAIL and ADMIN_DEFAULT_PASSWORD in process env, .env or .env.example (project root).');
  }
  console.log(`\n🔐 Using admin credentials from ${creds.source} (${creds.email})`);

  fs.rmSync(SHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const issues = new Map<string, { severity: Severity; category: string; issue: string; fix: string; location: string; routes: Set<string>; shot?: string }>();
  let pageNewIssues = 0;
  const addIssue = (o: { key: string; severity: Severity; category: string; issue: string; fix: string; location: string; route: string }): boolean => {
    const ex = issues.get(o.key);
    if (ex) { ex.routes.add(o.route); return false; }
    issues.set(o.key, { severity: o.severity, category: o.category, issue: o.issue, fix: o.fix, location: o.location, routes: new Set([o.route]) });
    pageNewIssues++;
    console.log(`      ❌ [ISSUE #${issues.size}] (${o.severity}) ${o.category} -> ${o.location}`);
    return true;
  };

  const visited = new Set<string>();
  const routeVisualCount = new Map<string, number>();
  const reportFindings = async (findings: Finding[], route: string, vp: { name: string; width: number }, ctx = '') => {
    const sorted = [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const f of sorted) {
      if (f.severity === 'Low') continue;
      const key = `VIS:${f.kind}:${f.sig}`;
      if (!issues.has(key)) {
        const n = routeVisualCount.get(route) || 0;
        if (n >= MAX_VISUAL_PER_ROUTE) continue;
        routeVisualCount.set(route, n + 1);
      }
      const isNew = addIssue({
        key, severity: f.severity,
        category: `${VISUAL_CATEGORY[f.kind] || f.kind} (${vp.name} ${vp.width}px${ctx})`,
        issue: f.html === '<html>' ? f.detail : `${f.detail} — \`${f.html}\``,
        fix: f.fix,
        location: f.html === '<html>' ? inferAdminView(route) : findSourceLocation(f.html, route, f.text),
        route: `${route} [${vp.name}${ctx}]`,
      });
      if (isNew && f.auditId) {
        const shot = await captureElement(page, f.auditId, `${f.kind}-${vp.name}`);
        if (shot) issues.get(key)!.shot = shot;
      }
    }
  };

  const flushReport = (isFinal = false) => {
    const sorted = Array.from(issues.values()).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const count = (s: Severity) => sorted.filter((i) => i.severity === s).length;
    const lines = [
      `# Admin Dashboard Audit Report`,
      `Status: **${isFinal ? 'COMPLETED' : 'IN PROGRESS...'}** | Crawled **${visited.size}** admin routes on \`${rootUrl}${ADMIN_ROOT}\` across **${VIEWPORTS.length} resolutions**. Found **${issues.size}** unique issues (High: ${count('High')}, Medium: ${count('Medium')}, Low: ${count('Low')}).`,
      ``,
      `## Instructions for Agentic AI`,
      `1. Fix issues in severity order (High -> Medium -> Low). Security rows first.`,
      `2. Open the screenshot (red outline = offending element) to see exactly what the admin sees.`,
      `3. Jump to **File / Location** and fix the shared admin layout/partial where possible.`,
      `4. Do not change admin business logic or data; only fix guards, templates and styling.`,
      `5. Re-run \`admin-audit.spec.ts\` until it reports 0 issues.`,
      ``,
      `| # | Severity | Category | File / Location | Issue Details | Required Fix | Affected Routes / Context | Screenshot |`,
      `|---|---|---|---|---|---|---|---|`,
    ];
    let i = 1;
    for (const it of sorted) {
      const ra = Array.from(it.routes);
      const rt = ra.length > 2 ? `${ra.slice(0, 2).join(', ')} (+${ra.length - 2} more)` : ra.join(', ');
      const esc = (s: string) => s.replace(/\|/g, '\\|');
      lines.push(`| ${i++} | **${it.severity}** | **${esc(it.category)}** | \`${it.location}\` | ${esc(it.issue)} | ${esc(it.fix)} | \`${esc(rt)}\` | ${it.shot ? `[view](${it.shot.replace(/\\/g, '/')})` : '-'} |`);
    }
    if (!issues.size) lines.push(`| - | - | **ALL PASSED** | - | Zero issues across ${visited.size} admin pages | None | All | - |`);
    fs.writeFileSync('ADMIN_REPORT.md', lines.join('\n'), 'utf8');
  };

  console.log(`======================================================================`);
  console.log(`🚀 STARTING ADMIN AUDIT ON: ${rootUrl}${ADMIN_ROOT}`);
  console.log(`======================================================================`);

  // -------------------------------------------------------------------------
  // 1. SECURITY: anonymous access + wrong password (separate clean context)
  // -------------------------------------------------------------------------
  const anon: BrowserContext = await browser.newContext({ bypassCSP: true });
  const anonPage = await anon.newPage();
  let loginUrl = '';
  try {
    process.stdout.write(`🛡️  Checking login guard... `);
    await anonPage.goto(`${rootUrl}${ADMIN_ROOT}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await anonPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    if (!(await hasLoginForm(anonPage))) {
      addIssue({ key: 'SEC_NO_GUARD_ROOT', severity: 'High', category: 'Security', issue: `${ADMIN_ROOT} is reachable without logging in (no login form shown)`,
        fix: 'Protect all /admin routes with an auth middleware that redirects to the login page.', location: 'src/routes/admin*.js / middleware', route: ADMIN_ROOT });
      console.log('❌ no login form');
    } else {
      loginUrl = anonPage.url();
      console.log(`✅ redirected to ${new URL(loginUrl).pathname}`);
      const lp = (await anonPage.request.get(loginUrl)).headers();
      if (!/noindex/i.test(lp['x-robots-tag'] || '') && !(await anonPage.locator('meta[name="robots"][content*="noindex" i]').count())) {
        addIssue({ key: 'SEC_NOINDEX', severity: 'Low', category: 'Security/SEO', issue: 'Admin login page can be indexed by search engines',
          fix: 'Add <meta name="robots" content="noindex,nofollow"> to the admin layout or X-Robots-Tag: noindex header for /admin.', location: findSourceLocation('<input type="password">', ADMIN_ROOT), route: new URL(loginUrl).pathname });
      }

      if (TEST_WRONG_PASSWORD) {
        process.stdout.write(`🛡️  Checking wrong password is rejected (1 attempt)... `);
        await submitLogin(anonPage, creds.email, `${creds.password}__wrong__`);
        if (!(await hasLoginForm(anonPage))) {
          addIssue({ key: 'SEC_WRONG_PWD', severity: 'High', category: 'Security', issue: 'Login succeeded with a WRONG password',
            fix: 'Verify password hash comparison (bcrypt.compare) and do not create a session on failure.', location: 'src/routes/admin auth handler', route: new URL(loginUrl).pathname });
          console.log('❌ accepted');
        } else {
          const feedback = await anonPage.locator('[role="alert"], .alert, .error, [class*="error"], [class*="danger"], [class*="red-"]').filter({ hasText: /\S/ }).first().isVisible().catch(() => false);
          if (!feedback) {
            addIssue({ key: 'UX_LOGIN_FEEDBACK', severity: 'Medium', category: 'Admin UX', issue: 'Wrong password shows no visible error message',
              fix: 'Render a flash/alert message (role="alert") on failed login.', location: findSourceLocation('<input type="password">', ADMIN_ROOT), route: new URL(loginUrl).pathname });
          }
          console.log('✅ rejected');
        }
      }
    }
  } catch (e: any) {
    console.log(`⚠️ ${String(e?.message || e).split('\n')[0]}`);
  }

  // -------------------------------------------------------------------------
  // 2. LOGIN
  // -------------------------------------------------------------------------
  let currentRoute = ADMIN_ROOT;
  page.on('pageerror', (err) => {
    const msg = err.message.split('\n')[0].slice(0, 100);
    addIssue({ key: `JS:${msg}`, severity: 'High', category: 'Functionality', issue: `Uncaught JS error: ${msg}`, fix: 'Fix client-side script exception', location: inferAdminView(currentRoute), route: currentRoute });
  });
  page.on('console', (m) => {
    if (!REPORT_CONSOLE_ERRORS || m.type() !== 'error') return;
    const msg = m.text().split('\n')[0].slice(0, 100);
    if (/Failed to load resource/i.test(msg)) return;
    addIssue({ key: `CONSOLE:${msg}`, severity: 'Low', category: 'Console Error', issue: msg, fix: 'Resolve the console error', location: inferAdminView(currentRoute), route: currentRoute });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (!u.startsWith(rootUrl)) return;
    const p = new URL(u).pathname;
    if (res.status() >= 500 && res.request().resourceType() !== 'document') {
      addIssue({ key: `XHR500:${routePattern(p)}`, severity: 'High', category: 'Backend', issue: `HTTP ${res.status()} from ${p} (data widget/API failed)`, fix: 'Check server logs for this endpoint', location: `Route: ${p}`, route: currentRoute });
    }
    if (res.status() >= 400 && /\.(css|js|mjs|woff2?|ttf|png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i.test(u)) {
      addIssue({ key: `ASSET:${p}`, severity: 'High', category: 'Broken Asset', issue: `HTTP ${res.status()} for ${p}`, fix: 'Fix asset path or restore file under public/', location: grepAll(p)[0] || inferAdminView(currentRoute), route: currentRoute });
    }
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${rootUrl}${ADMIN_ROOT}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (await hasLoginForm(page)) {
    process.stdout.write(`🔑 Logging in... `);
    await submitLogin(page, creds.email, creds.password);
    if (await hasLoginForm(page)) {
      const msg = (await page.locator('[role="alert"], .alert, .error, [class*="error"]').first().innerText().catch(() => '')).trim();
      flushReport(true);
      throw new Error(`Login failed for ${creds.email}${msg ? ` — page says: "${msg.slice(0, 120)}"` : ''}. Check credentials in ${creds.source}.`);
    }
    console.log(`✅ Logged in -> ${new URL(page.url()).pathname}`);
  }

  // Session cookie flags
  const cookies = await page.context().cookies(rootUrl);
  const session = cookies.find((c) => /sess|sid|token|auth|connect/i.test(c.name)) || cookies[0];
  if (session) {
    const problems: string[] = [];
    if (!session.httpOnly) problems.push('HttpOnly missing');
    if (rootUrl.startsWith('https') && !session.secure) problems.push('Secure missing');
    if (!session.sameSite || session.sameSite === 'None') problems.push(`SameSite=${session.sameSite || 'unset'}`);
    if (problems.length) {
      addIssue({ key: 'SEC_COOKIE', severity: 'High', category: 'Security', issue: `Session cookie "${session.name}": ${problems.join(', ')}`,
        fix: 'Set cookie: { httpOnly: true, secure: true (prod), sameSite: "lax" } in express-session / cookie options.', location: 'server.js / app.js', route: ADMIN_ROOT });
    }
  }

  // -------------------------------------------------------------------------
  // 3. CRAWL ADMIN PAGES
  // -------------------------------------------------------------------------
  const startPath = new URL(page.url()).pathname.startsWith(ADMIN_ROOT) ? new URL(page.url()).pathname : ADMIN_ROOT;
  const queue: string[] = [startPath];
  if (startPath !== ADMIN_ROOT) queue.push(ADMIN_ROOT);
  const patternCount = new Map<string, number>();
  const skippedUnsafe = new Set<string>();

  while (queue.length && visited.size < MAX_PAGES) {
    const route = queue.shift()!;
    if (visited.has(route)) continue;
    const pat = routePattern(route);
    if ((patternCount.get(pat) || 0) >= MAX_PER_PATTERN) continue;
    patternCount.set(pat, (patternCount.get(pat) || 0) + 1);
    visited.add(route);
    currentRoute = route;
    pageNewIssues = 0;

    console.log(`\n----------------------------------------------------------------------`);
    console.log(`🌐 [${visited.size}/${Math.min(visited.size + queue.length, MAX_PAGES)}] ${route} (Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Issues: ${issues.size})`);

    await page.setViewportSize({ width: 1920, height: 1080 });
    let response;
    try {
      response = await page.goto(`${rootUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {
      addIssue({ key: `TIMEOUT:${pat}`, severity: 'High', category: 'Performance', issue: 'Admin page load timed out (>15s)', fix: 'Paginate / index the DB query behind this page', location: inferAdminView(route), route });
      continue;
    }
    const status = response?.status() || 0;
    if (status >= 400) {
      addIssue({ key: `HTTP:${pat}`, severity: 'High', category: 'Broken Page', issue: `Admin link returns HTTP ${status}`, fix: 'Fix the sidebar/table href or the route handler', location: inferAdminView(route), route });
      continue;
    }
    if (await hasLoginForm(page) && !route.includes('password')) {
      addIssue({ key: `SESSION_LOST:${pat}`, severity: 'High', category: 'Functionality', issue: 'Session lost - page redirected to login while logged in', fix: 'Check session middleware / role check for this route', location: inferAdminView(route), route });
      continue;
    }

    const h = response?.headers() || {};
    if (!/no-store|private/i.test(h['cache-control'] || '')) {
      addIssue({ key: 'SEC_CACHE', severity: 'Medium', category: 'Security', issue: `Admin pages are cacheable (Cache-Control: "${h['cache-control'] || 'none'}")`,
        fix: 'In admin router: res.set("Cache-Control", "no-store") for all /admin responses.', location: 'src/routes/admin*.js', route });
    }

    await preparePage(page);

    // Discover links (GET only, unsafe actions skipped)
    const hrefs = await page.$$eval('a[href]', (els) => els.map((a) => ({
      href: a.getAttribute('href') || '',
      method: a.getAttribute('data-method') || '',
      confirm: (a.getAttribute('onclick') || '').includes('confirm'),
    })));
    let added = 0;
    for (const l of hrefs) {
      let p: string;
      try {
        const u = new URL(l.href, page.url());
        if (u.origin !== new URL(rootUrl).origin) continue;
        p = u.pathname.replace(/\/+$/, '') || '/';
      } catch { continue; }
      if (!p.startsWith(ADMIN_ROOT)) continue;
      if (UNSAFE_LINK.test(p) || (l.method && l.method.toLowerCase() !== 'get') || l.confirm) { skippedUnsafe.add(p); continue; }
      if (/\.(pdf|zip|csv|xlsx|png|jpe?g|svg)$/i.test(p)) continue;
      if (!visited.has(p) && !queue.includes(p)) { queue.push(p); added++; }
    }

    const meta = await page.evaluate(() => ({
      title: document.title.trim(),
      headings: document.querySelectorAll('h1, h2').length,
      brokenImgs: Array.from(document.querySelectorAll('img')).filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src')!),
      emptyTables: Array.from(document.querySelectorAll('table')).filter((t) => t.querySelectorAll('tbody tr').length === 0 && !t.querySelector('tfoot')).length,
    }));
    console.log(`   🔗 +${added} links | title="${meta.title.slice(0, 40)}" | brokenImgs=${meta.brokenImgs.length}`);
    if (!meta.title) addIssue({ key: `TITLE:${pat}`, severity: 'Low', category: 'Admin UX', issue: 'Missing <title>', fix: 'Set a page title in the admin layout', location: inferAdminView(route), route });
    if (!meta.headings) addIssue({ key: `HEAD:${pat}`, severity: 'Low', category: 'Admin UX', issue: 'Page has no visible h1/h2 heading', fix: 'Add a page heading', location: inferAdminView(route), route });
    if (meta.emptyTables) addIssue({ key: `EMPTYTBL:${pat}`, severity: 'Medium', category: 'Admin UX', issue: `${meta.emptyTables} table(s) render with no rows and no empty-state message`, fix: 'Show an "No records yet" row when the list is empty', location: inferAdminView(route), route });
    for (const src of meta.brokenImgs) {
      addIssue({ key: `IMG:${src}`, severity: 'High', category: 'Content', issue: `Broken image src="${src}"`, fix: 'Fix image path / upload storage', location: findSourceLocation(`<img src="${src}">`, route), route });
    }

    // Accessibility (serious/critical, light theme only - admin is internal)
    process.stdout.write(`   ♿ WCAG... `);
    try {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of axe.violations) {
        if (v.impact !== 'critical' && v.impact !== 'serious') continue;
        for (const node of v.nodes.slice(0, 5)) {
          const snip = node.html.replace(/\s+/g, ' ').slice(0, 120);
          addIssue({ key: `A11Y:${v.id}:${getElementSignature(snip)}`, severity: v.impact === 'critical' ? 'High' : 'Medium', category: `A11y (${v.id})`,
            issue: `Element: \`${snip}\``, fix: v.help, location: findSourceLocation(snip, route), route });
        }
      }
      console.log('✓');
    } catch { console.log('skipped'); }

    // Visual checks per viewport
    process.stdout.write(`   📱 Visual: `);
    for (const vp of VIEWPORTS) {
      process.stdout.write(`[${vp.name}] `);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 80);
      const findings = (await page.evaluate(adminScan, { minClip: MIN_CLIP_PX, ignoreSel: IGNORE_SELECTOR, checkData: vp.name === 'Desktop' })) as Finding[];
      await reportFindings(findings, route, vp);

      // Mobile: sidebar toggle must open a visible menu
      if (vp.width < 1024 && visited.size === 1) {
        const toggle = page.locator('[aria-label*="menu" i], [aria-label*="sidebar" i], [data-sidebar-toggle], button[aria-controls*="sidebar" i], #sidebar-toggle').first();
        if (await toggle.isVisible().catch(() => false)) {
          const navLinksBefore = await page.locator('aside a:visible, nav a:visible').count();
          await toggle.click().catch(() => {});
          await settle(page, 300);
          const navLinksAfter = await page.locator('aside a:visible, nav a:visible').count();
          if (navLinksAfter <= navLinksBefore) {
            addIssue({ key: `SIDEBAR_TOGGLE:${vp.name}`, severity: 'High', category: `Admin UX (${vp.name})`, issue: 'Sidebar/menu toggle does not reveal navigation links',
              fix: 'Check the toggle click handler and the hidden/translate classes on the sidebar', location: findSourceLocation('<button aria-label="menu">', route), route: `${route} [${vp.name}]` });
          } else {
            const open = (await page.evaluate(adminScan, { minClip: MIN_CLIP_PX, ignoreSel: IGNORE_SELECTOR, checkData: false })) as Finding[];
            await reportFindings(open.filter((f) => f.kind !== 'OVERLAP'), route, vp, ', sidebar open');
            await page.keyboard.press('Escape').catch(() => {});
            if (await page.locator('aside a:visible, nav a:visible').count() > navLinksBefore) await toggle.click().catch(() => {});
            await settle(page, 200);
          }
        } else if (!(await page.locator('aside a:visible, nav a:visible').count())) {
          addIssue({ key: `NO_MOBILE_NAV:${vp.name}`, severity: 'High', category: `Admin UX (${vp.name})`, issue: 'No visible navigation and no menu toggle on this screen size',
            fix: 'Add a hamburger button that opens the sidebar below lg', location: inferAdminView(route), route: `${route} [${vp.name}]` });
        }
      }
    }
    process.stdout.write('✓\n');

    console.log(`   ✅ Finished ${route} (+${pageNewIssues} new | ${issues.size} total)`);
    flushReport(false);
  }

  // -------------------------------------------------------------------------
  // 4. AUTH GUARD ON EVERY CRAWLED ROUTE (anonymous, no redirects followed)
  // -------------------------------------------------------------------------
  process.stdout.write(`\n🛡️  Verifying ${visited.size} admin routes are blocked when logged out... `);
  let unguarded = 0;
  for (const route of visited) {
    try {
      const r = await anon.request.get(`${rootUrl}${route}`, { maxRedirects: 0 });
      if (r.status() === 200) {
        const body = await r.text();
        if (!/type=["']?password/i.test(body)) {
          unguarded++;
          addIssue({ key: `SEC_UNGUARDED:${routePattern(route)}`, severity: 'High', category: 'Security', issue: 'Admin page content served WITHOUT login (HTTP 200)',
            fix: 'Apply the admin auth middleware to this route (router.use(requireAdmin) before route definitions).', location: inferAdminView(route), route });
        }
      }
    } catch {}
  }
  console.log(unguarded ? `❌ ${unguarded} unguarded` : '✅ all protected');
  await anon.close();

  flushReport(true);
  console.log(`\n======================================================================`);
  console.log(`🏁 ADMIN AUDIT COMPLETE in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`📊 Admin pages: ${visited.size} | Issues: ${issues.size} | Screenshots: ${shotCount} | Unsafe links skipped: ${skippedUnsafe.size}`);
  console.log(`📄 Report: ADMIN_REPORT.md | 🖼️  ${SHOT_DIR}/`);
  console.log(`======================================================================\n`);

  expect(issues.size, `Found ${issues.size} admin issues. Share ADMIN_REPORT.md (and ${SHOT_DIR}/) with your AI agent.`).toBe(0);
});
