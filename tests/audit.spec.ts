import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// Disable timeout so full 70+ page crawl never aborts mid-run
test.setTimeout(0);
// Allow injecting the "freeze animations" style even when helmet CSP is active
test.use({ bypassCSP: true });

const VIEWPORTS = [
  { name: 'Desktop',     width: 1920, height: 1080 },
  { name: 'Laptop',      width: 1366, height: 768  },
  { name: 'Tablet',      width: 768,  height: 1024 },
  { name: 'Mobile',      width: 390,  height: 844  },
  { name: 'SmallMobile', width: 360,  height: 740  },
  // { name: 'Reflow320',   width: 320,  height: 640  }, // WCAG 1.4.10 reflow width (disabled: too noisy)
];

const THEMES = ['light', 'dark', 'emerald', 'vscode', 'amber', 'cyan', 'slate'];
const CORE_TEMPLATES = ['/', '/services', '/projects', '/blogs', '/tools', '/contact'];
const MAX_PAGES = 75;
const SHOT_DIR = 'audit-screenshots';
const MAX_SHOTS = 250;

const FREEZE_CSS = `
*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;caret-color:transparent!important}
html{scroll-behavior:auto!important}
[data-aos],.reveal,.fade-in,.fade-up,.animate-on-scroll{opacity:1!important;transform:none!important}
`;

type Severity = 'High' | 'Medium' | 'Low';
const SEVERITY_ORDER: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };

// ---------------------------------------------------------------------------
// NOISE CONTROL - tune here instead of editing the checks
// ---------------------------------------------------------------------------
// Only the checks listed here are reported. Uncomment a line to re-enable it.
const ENABLED_CHECKS = new Set<string>([
  'VIEWPORT_CLIP',     // button/text cut at screen edge (the "Fill Form" case)
  'ANCESTOR_CLIP',     // button/text cut by its card
  'CONTENT_OVERFLOW',  // label wider than its button
  'BUTTON_WRAP',       // 1-3 word button label broken onto 2 lines
  'ICON_MISALIGNED',   // icon and label on different lines
  'OVERLAP',           // button overlapping other content
  'IMG_DISTORTED',     // stretched image
  'PAGE_OVERFLOW',     // whole page scrolls sideways
  'BOTTOM_BAR_COVER',  // footer hidden behind bottom nav
  // 'TEXT_CLIPPED_V',
  // 'TEXT_ELLIPSIS',
  // 'TEXT_SQUEEZED',
  // 'TOUCH_TARGET',
  // 'ICON_MISSING',
]);
const MIN_SEVERITY: Severity = 'Medium';   // 'High' = only severe issues, 'Low' = everything
const MIN_CLIP_PX = 6;                     // ignore clipping/overflow smaller than this (sub-pixel / shadow noise)
const MAX_VISUAL_PER_ROUTE = 8;            // cap new visual issues per page
const REPORT_CONSOLE_ERRORS = false;       // console.error() messages (usually 3rd-party noise)
// Intentional overflow containers (sliders, marquees, tickers) - never reported as clipped
const IGNORE_SELECTOR =
  '[data-audit-ignore], .swiper, .slick-track, .splide, .glide, [class*="marquee"], [class*="ticker"], [class*="carousel"], [class*="scroll-x"], [class*="overflow-x-auto"]';

const VISUAL_CATEGORY: Record<string, string> = {
  VIEWPORT_CLIP:   'Visual: Cut off at screen edge',
  ANCESTOR_CLIP:   'Visual: Clipped by container',
  CONTENT_OVERFLOW:'Visual: Content spills out of box',
  TEXT_CLIPPED_V:  'Visual: Text cut at bottom',
  TEXT_ELLIPSIS:   'Visual: Label truncated (...)',
  BUTTON_WRAP:     'Visual: Button label wraps',
  ICON_MISALIGNED: 'Visual: Icon/label misaligned',
  TEXT_SQUEEZED:   'Visual: Text squeezed',
  // EDGE_HUG:        'Visual: No side padding',   // disabled (too noisy)
  OVERLAP:         'Visual: Overlapping elements',
  // TINY_FONT:       'Visual: Font too small',    // disabled (too noisy)
  IMG_DISTORTED:   'Visual: Image stretched',
  ICON_MISSING:    'Visual: Icon not rendered',
  TOUCH_TARGET:    'Mobile UX: Touch target',
  PAGE_OVERFLOW:   'Responsive: Page scrolls sideways',
  BOTTOM_BAR_COVER:'Visual: Content under fixed bar',
};

// ---------------------------------------------------------------------------
// Source location helpers (git grep, cached, no shell -> no injection issues)
// ---------------------------------------------------------------------------
const grepCache = new Map<string, string[]>();

function grepAll(token: string): string[] {
  if (grepCache.has(token)) return grepCache.get(token)!;
  let hits: string[] = [];
  try {
    const out = execFileSync('git', ['grep', '-n', '-F', '-e', token, '--', 'views', 'public/js'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    hits = out
      .split('\n')
      .filter((l) => /\.(ejs|js):\d+:/.test(l))
      .map((l) => l.split(':').slice(0, 2).join(':'));
  } catch {}
  grepCache.set(token, hits);
  return hits;
}

// Map URL route to likely EJS view file when grep doesn't find a unique token
function inferViewFromRoute(route: string): string {
  if (route === '/') return 'views/pages/index.ejs';
  const clean = route.replace(/^\/+|\/+$/g, '');
  const candidates = [`views/pages/${clean}.ejs`, `views/pages/${clean}/index.ejs`, `views/${clean}.ejs`];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  if (clean.startsWith('tools/')) return `views/pages/tools/ (${clean})`;
  if (clean.startsWith('services/')) return `views/pages/services/ (${clean})`;
  return `Route: ${route}`;
}

// Locate EJS file:line. Uses attributes of the OPENING tag only, then visible text.
// When a token hits several files, prefer the view that belongs to the current route.
function findSourceLocation(htmlSnippet: string, route: string, visibleText = ''): string {
  const openTag = htmlSnippet.match(/^<[^>]+>/)?.[0] || htmlSnippet;
  const tokens: string[] = [];
  const attr =
    openTag.match(/\bid=["']([^"']{3,})["']/) ||
    openTag.match(/\bdata-(?!audit)[a-z-]+=["']([^"']{4,})["']/) ||
    openTag.match(/\baria-label=["']([^"']{4,})["']/) ||
    openTag.match(/\bhref=["']([^"'#?]{4,})["']/) ||
    openTag.match(/\bsrc=["']([^"'?]{4,})["']/);
  if (attr?.[1]) tokens.push(attr[1]);

  const text = (visibleText || htmlSnippet.match(/>([^<]{4,60})</)?.[1] || '')
    .replace(/\s+/g, ' ')
    .replace(/["'\\]/g, '')
    .trim();
  if (text.length > 3) tokens.push(text.length > 30 ? text.slice(0, 30).replace(/\s+\S*$/, '') : text);

  const routeView = inferViewFromRoute(route);
  for (const t of tokens) {
    const hits = grepAll(t);
    if (!hits.length) continue;
    return hits.find((h) => h.startsWith(routeView)) || hits[0];
  }
  return routeView;
}

function getElementSignature(htmlSnippet: string): string {
  const tag = (htmlSnippet.match(/^<([a-z0-9-]+)/i)?.[1] || 'el').toLowerCase();
  const id = htmlSnippet.match(/\bid=["']([^"']+)["']/)?.[1] || '';
  const cls = htmlSnippet.match(/\bclass=["']([^"']+)["']/)?.[1] || '';
  return `${tag}#${id}.${cls.trim().replace(/\s+/g, '.')}`;
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
async function settle(page: Page, ms = 60) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(ms);
}

// Wait for load + fonts, freeze animations, scroll the whole page once so
// scroll-reveal sections and lazy images are in their final visible state.
async function preparePage(page: Page) {
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
  await page.evaluate(async () => {
    try { await (document as any).fonts?.ready; } catch {}
    const step = Math.max(300, window.innerHeight * 0.8);
    const max = Math.min(document.documentElement.scrollHeight, 40000);
    for (let y = 0; y < max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await settle(page, 100);
}

async function applyTheme(page: Page, themeName: string) {
  await page.evaluate((t: string) => {
    const html = document.documentElement;
    const body = document.body;
    const btn = document.querySelector(
      `[data-theme="${t}"], [data-accent="${t}"], button[aria-label*="${t}" i]`
    ) as HTMLElement | null;
    if (btn) btn.click();

    if (t === 'light') {
      html.classList.remove('dark');
      body.classList.remove('dark');
      html.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else if (t === 'dark') {
      html.classList.add('dark');
      body.classList.add('dark');
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      html.setAttribute('data-theme', t);
      html.setAttribute('data-accent', t);
      body.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
      localStorage.setItem('accent', t);
    }
  }, themeName);
  await settle(page, 40);
}

// Screenshot the offending element with a red outline (cropped, viewport only)
let shotCount = 0;
async function captureElement(page: Page, auditId: string, name: string): Promise<string | undefined> {
  if (shotCount >= MAX_SHOTS) return;
  try {
    const loc = page.locator(`[data-audit-id="${auditId}"]`).first();
    if (!(await loc.count())) return;
    await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await loc.evaluate((el: HTMLElement) => {
      el.dataset.auditOutline = el.style.outline;
      el.style.outline = '3px solid #ff0033';
      el.style.outlineOffset = '2px';
    });
    const box = await loc.boundingBox();
    const vp = page.viewportSize();
    let file: string | undefined;
    if (box && vp) {
      const pad = 60;
      const x = Math.max(0, box.x - pad);
      const y = Math.max(0, box.y - pad);
      const w = Math.min(vp.width - x, box.width + pad * 2);
      const h = Math.min(vp.height - y, box.height + pad * 2);
      if (w > 5 && h > 5) {
        file = path.join(SHOT_DIR, `${String(++shotCount).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`);
        await page.screenshot({ path: file, clip: { x, y, width: w, height: h } });
      }
    }
    await loc.evaluate((el: HTMLElement) => {
      el.style.outline = el.dataset.auditOutline || '';
      el.style.outlineOffset = '';
      delete el.dataset.auditOutline;
    });
    return file;
  } catch {
    return;
  }
}

// ---------------------------------------------------------------------------
// In-browser visual scan: catches what a human eye sees (clipping, cut-off
// buttons, wrapped labels, overlaps, squeezed text, stretched images, etc.)
// ---------------------------------------------------------------------------
type Finding = {
  kind: string;
  severity: Severity;
  detail: string;
  fix: string;
  html: string;
  text: string;
  sig: string;
  auditId: string;
};

const visualScan = (args: { scope: string | null; isTouch: boolean; fixedOnly: boolean; minClip: number; ignoreSel: string; enabled: string[] }) => {
  const enabled = new Set(args.enabled);
  const T = args.minClip;
  const vw = document.documentElement.clientWidth;
  const root: Element = (args.scope && document.querySelector(args.scope)) || document.body;
  document.querySelectorAll('[data-audit-id]').forEach((e) => e.removeAttribute('data-audit-id'));

  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [role="button"], [role="tab"], summary';
  const findings: any[] = [];
  const seen = new Set<string>();
  let idSeq = 0;

  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const snippet = (el: Element) => clean(el.outerHTML).slice(0, 140);
  const sigOf = (el: Element) => {
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 8).join('.');
    return `${el.tagName.toLowerCase()}#${el.id || ''}.${cls}`;
  };
  const ownText = (el: Element) =>
    clean(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(' '));
  const fullText = (el: Element) => clean((el as HTMLElement).innerText || el.textContent || '').slice(0, 60);

  const isVisible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('[aria-hidden="true"], [inert], [hidden], .sr-only, template, noscript')) return false;
    if (args.ignoreSel && el.closest(args.ignoreSel)) return false;
    const anyEl = el as any;
    if (typeof anyEl.checkVisibility === 'function' &&
        !anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return true;
  };

  const inFixed = (el: Element) => {
    let n: Element | null = el;
    while (n && n !== document.body) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
      n = n.parentElement;
    }
    return false;
  };

  const textRects = (el: Element, deep: boolean) => {
    const nodes: Node[] = [];
    if (deep) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) nodes.push(n);
    } else {
      el.childNodes.forEach((n) => { if (n.nodeType === 3) nodes.push(n); });
    }
    const out: DOMRect[] = [];
    for (const n of nodes) {
      if (!(n.textContent || '').trim()) continue;
      if (n.parentElement?.closest('.sr-only, [aria-hidden="true"]')) continue;
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
  const unionRect = (rects: DOMRect[]) =>
    rects.length
      ? {
          left: Math.min(...rects.map((r) => r.left)),
          right: Math.max(...rects.map((r) => r.right)),
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        }
      : null;

  const push = (el: Element, kind: string, severity: string, detail: string, fix: string) => {
    if (!enabled.has(kind)) return;
    const sig = sigOf(el);
    const key = kind + '|' + sig;
    if (seen.has(key)) return;
    seen.add(key);
    const html = snippet(el); // capture before tagging
    const auditId = `a${++idSeq}`;
    el.setAttribute('data-audit-id', auditId);
    findings.push({ kind, severity, detail, fix, html, text: fullText(el), sig, auditId });
  };

  // ---- Candidate elements: interactive, text-bearing, images ----
  const candidates: Element[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el instanceof SVGElement) continue;
    if (['SCRIPT', 'STYLE', 'BR', 'NOSCRIPT', 'TEMPLATE', 'IFRAME'].includes(el.tagName)) continue;
    const interactive = el.matches(INTERACTIVE);
    const hasText = ownText(el).length > 1;
    if (!interactive && !hasText && el.tagName !== 'IMG') continue;
    if (!isVisible(el)) continue;
    if (args.fixedOnly && !inFixed(el)) continue;
    candidates.push(el);
  }

  // ---- Page-level horizontal overflow ----
  const se = document.documentElement;
  if (!args.fixedOnly && se.scrollWidth > se.clientWidth + 2) {
    findings.push({
      kind: 'PAGE_OVERFLOW', severity: 'High',
      detail: `Page scrolls sideways (${se.scrollWidth}px > ${se.clientWidth}px)`,
      fix: 'Find the widest child (see other Visual issues on this route) and constrain it; do not just hide it with overflow-x-hidden.',
      html: '<html>', text: '', sig: 'html', auditId: '',
    });
  }

  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const interactive = el.matches(INTERACTIVE);
    const isImg = el.tagName === 'IMG';
    const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    const label = interactive ? 'Button/link' : isImg ? 'Image' : 'Text';

    // 1. Partially cut off at the viewport edge (also catches cases hidden by body{overflow-x:hidden})
    const partiallyOut = (r.left < -T && r.right > T) || (r.right > vw + T && r.left < vw - T);
    if (partiallyOut) {
      push(el, 'VIEWPORT_CLIP', interactive ? 'High' : 'Medium',
        `${label} is cut off at the screen edge (left=${Math.round(r.left)}px, right=${Math.round(r.right)}px, screen=${vw}px)`,
        'Parent row is wider than the screen: use flex-wrap or flex-col below sm, add min-w-0 to the flexible text column, shrink-0 on the button, and replace fixed widths with w-full/max-w-full.');
      continue;
    }

    // 2. Partially clipped by an ancestor with overflow:hidden/clip (rounded cards etc.)
    if (!isImg) {
      let a = el.parentElement;
      let clippedBy: Element | null = null;
      let dir = '';
      while (a && a !== document.body && a !== document.documentElement) {
        const acs = getComputedStyle(a);
        const ox = acs.overflowX, oy = acs.overflowY;
        const scrollsX = (ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 1;
        const scrollsY = (oy === 'auto' || oy === 'scroll') && a.scrollHeight > a.clientHeight + 1;
        if (scrollsX || scrollsY) break; // intentional scroller / carousel
        const hidX = ox === 'hidden' || ox === 'clip';
        const hidY = oy === 'hidden' || oy === 'clip';
        if (hidX || hidY) {
          const ar = a.getBoundingClientRect();
          const L = ar.left + parseFloat(acs.borderLeftWidth), R = ar.right - parseFloat(acs.borderRightWidth);
          const Tp = ar.top + parseFloat(acs.borderTopWidth), B = ar.bottom - parseFloat(acs.borderBottomWidth);
          if (r.right <= L || r.left >= R || r.bottom <= Tp || r.top >= B) break; // fully hidden = intentional (collapsed / slide)
          if (hidX && (r.right > R + T || r.left < L - T)) { clippedBy = a; dir = 'horizontally'; break; }
          if (hidY && (r.bottom > B + T || r.top < Tp - T)) { clippedBy = a; dir = 'vertically'; break; }
        }
        a = a.parentElement;
      }
      if (clippedBy) {
        push(el, 'ANCESTOR_CLIP', interactive ? 'High' : 'Medium',
          `${label} is clipped ${dir} by its container \`${snippet(clippedBy).slice(0, 90)}\``,
          'Content does not fit the card at this width: stack the row (flex-col sm:flex-row), allow wrap (flex-wrap gap-3), add min-w-0 to text column and shrink-0/whitespace-nowrap to the button, or make the button w-full on mobile.');
        continue;
      }
    }

    // 3. Content wider/taller than the element's own box
    if (!isImg && !isField && cs.display !== 'inline' && el.clientWidth > 0) {
      const overX = el.scrollWidth - el.clientWidth;
      const scrollableX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      if (overX > T && !scrollableX) {
        if (cs.textOverflow === 'ellipsis') {
          push(el, 'TEXT_ELLIPSIS', interactive ? 'Medium' : 'Low',
            `${label} text truncated with "..." ("${fullText(el)}")`,
            'Give the label more room or allow wrapping on small screens; truncate only non-essential text.');
        } else {
          push(el, 'CONTENT_OVERFLOW', interactive ? 'High' : 'Low',
            `${label} content spills ${overX}px outside its box ("${fullText(el)}")`,
            'Remove fixed width/whitespace-nowrap or give the element room (shrink-0, min-w-fit); wrap the parent row on mobile.');
        }
      }
      const overY = el.scrollHeight - el.clientHeight;
      const clamp = (cs as any).webkitLineClamp;
      if (overY > T && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && (!clamp || clamp === 'none')) {
        push(el, 'TEXT_CLIPPED_V', 'Medium',
          `${label} is cut at the bottom by ${overY}px (fixed height + overflow hidden)`,
          'Replace fixed h-* with min-h-* or auto height; use line-clamp-* if truncation is intended.');
      }
    }

    // 4. Button label wrapping / icon on a different line than the label
    if (interactive && !isField) {
      const looksLikeButton =
        el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ||
        (cs.display !== 'inline' &&
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0));
      if (looksLikeButton) {
        const rects = textRects(el, true);
        const words = fullText(el).split(' ').filter(Boolean).length;
        const lines = lineCount(rects);
        if (words > 0 && words <= 3 && lines > 1) {
          push(el, 'BUTTON_WRAP', 'Medium',
            `Short button label "${fullText(el)}" breaks onto ${lines} lines (${Math.round(r.width)}px wide)`,
            'Add whitespace-nowrap + shrink-0 to the button and let the row wrap, or make the button full-width on mobile.');
        }
        const tr = unionRect(rects);
        const icon = Array.from(el.querySelectorAll('svg, i, img')).find((i) => i.getBoundingClientRect().width > 0);
        if (icon && tr && !el.matches('.appearance-palette')) {
          const ir = icon.getBoundingClientRect();
          if (ir.bottom <= tr.top + 1 || ir.top >= tr.bottom - 1) {
            push(el, 'ICON_MISALIGNED', 'Medium',
              `Icon and label of "${fullText(el)}" sit on different lines`,
              'Use inline-flex items-center gap-2 whitespace-nowrap on the button; add shrink-0 to the icon.');
          }
        }
      }
    }

    // 5. Text squeezed into a narrow column (cramped mobile layouts)
    if (args.isTouch && !interactive && !isImg) {
      const t = ownText(el);
      if (t.length > 25) {
        const lines = lineCount(textRects(el, false));
        if (lines >= 3 && t.length / lines < 14) {
          push(el, 'TEXT_SQUEEZED', 'Medium',
            `Text squeezed into ${Math.round(r.width)}px (${lines} lines, ~${Math.round(t.length / lines)} chars/line): "${t.slice(0, 50)}"`,
            'Stack side-by-side items vertically on mobile (flex-col / grid-cols-1) or move the side element below the text.');
        }
      }
    }

    // ---- DISABLED: EDGE_HUG (6) and TINY_FONT (7) checks generate too many issues ----
    // // 6. Text touching the screen edge (missing container padding)
    // if (args.isTouch && !interactive && !isImg) {
    //   const tr = unionRect(textRects(el, false));
    //   if (tr && tr.right > 0 && tr.left < vw && (tr.left < 6 || tr.right > vw - 6)) {
    //     push(el, 'EDGE_HUG', 'Low',
    //       `Text touches the screen edge (left=${Math.round(tr.left)}px, right=${Math.round(tr.right)}px)`,
    //       'Add horizontal padding to the section container (px-4 sm:px-6).');
    //   }
    // }

    // // 7. Tiny fonts on touch screens
    // if (args.isTouch && !isImg && ownText(el).length > 1) {
    //   const size = parseFloat(cs.fontSize);
    //   if (size < 12) {
    //     push(el, 'TINY_FONT', 'Low', `Font size ${size}px is hard to read on a phone`,
    //       'Use at least 12px (text-xs) for meta text and 14-16px for body copy.');
    //   }
    // }

    // 8. Stretched / squashed images
    if (isImg) {
      const img = el as HTMLImageElement;
      if (img.naturalWidth && img.naturalHeight && cs.objectFit === 'fill') {
        const nr = img.naturalWidth / img.naturalHeight;
        const rr = r.width / r.height;
        if (Math.abs(nr - rr) / nr > 0.06) {
          push(el, 'IMG_DISTORTED', 'Medium',
            `Image is stretched (natural ${img.naturalWidth}x${img.naturalHeight}, shown ${Math.round(r.width)}x${Math.round(r.height)})`,
            'Add object-cover / object-contain, or set only one of width/height (h-auto).');
        }
      }
    }

    // 9. Touch targets (skip inline links inside sentences - WCAG exception)
    if (args.isTouch && interactive) {
      const inlineInText = cs.display === 'inline' && !!el.parentElement && ownText(el.parentElement).length > 20;
      if (!inlineInText && (r.width < 32 || r.height < 32)) {
        push(el, 'TOUCH_TARGET', 'Medium', `Touch target only ${Math.round(r.width)}x${Math.round(r.height)}px`,
          'Increase padding or add min-h-[44px] min-w-[44px] on touch devices.');
      }
    }
  }

  // 10. Overlapping elements (in-flow vs in-flow, fixed vs fixed)
  const boxes = candidates
    .filter((e) => e.tagName !== 'IMG' && getComputedStyle(e).display !== 'inline')
    .map((el) => ({ el, r: el.getBoundingClientRect(), fixed: inFixed(el), inter: el.matches(INTERACTIVE) }))
    .sort((a, b) => a.r.top - b.r.top);
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j];
      if (B.r.top >= A.r.bottom) break;
      if (A.fixed !== B.fixed) continue; // floating buttons over scrolling content is normal
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (ix <= T || iy <= T) continue;
      if (!A.inter && !B.inter) continue; // text-on-text overlaps are mostly decorative layering
      const minArea = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
      if ((ix * iy) / minArea < 0.3) continue;
      push(A.el, 'OVERLAP', A.inter && B.inter ? 'High' : 'Medium',
        `"${fullText(A.el) || A.el.tagName}" overlaps "${fullText(B.el) || B.el.tagName}" (${Math.round(ix)}x${Math.round(iy)}px) — other: \`${snippet(B.el).slice(0, 80)}\``,
        A.fixed ? 'Re-position floating elements (different bottom/right offsets or stack them in one flex column).'
                : 'Fix negative margins / absolute positioning, or allow the container to grow (remove fixed height).');
    }
  }

  // 11. Icon placeholders never replaced by the icon library
  for (const el of Array.from(root.querySelectorAll('i[data-lucide], i[data-feather]'))) {
    if (el.closest('[hidden], [aria-hidden="true"] [hidden]')) continue;
    push(el, 'ICON_MISSING', 'Low', `Icon placeholder "${el.getAttribute('data-lucide') || el.getAttribute('data-feather')}" was not rendered`,
      'Call lucide.createIcons() after dynamic content is inserted, or check the icon name.');
  }

  return findings as any[];
};

// Detect last page content hidden behind a fixed bottom nav / cookie bar on phones
const bottomBarScan = async () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  const bars = Array.from(document.querySelectorAll('body *')).filter((el) => {
    if (getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > vw * 0.8 && r.bottom >= vh - 2 && r.height > 20 && r.height < vh * 0.3;
  });
  if (!bars.length) return null;
  const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
  let lastBottom = 0;
  let lastHtml = '';
  for (const el of Array.from(document.querySelectorAll('footer *, main *'))) {
    if (bars.some((b) => b.contains(el))) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.width < 1) continue;
    if (r.bottom > lastBottom) { lastBottom = r.bottom; lastHtml = el.outerHTML.replace(/\s+/g, ' ').slice(0, 120); }
  }
  return lastBottom > barTop + 2
    ? { overlap: Math.round(lastBottom - barTop), barHtml: bars[0].outerHTML.replace(/\s+/g, ' ').slice(0, 100), lastHtml }
    : null;
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
test('Full Multi-Resolution & Multi-Theme Website Audit', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'Desktop-Chrome', 'Handled internally across all viewports and themes');

  const startTime = Date.now();
  const rootUrl = (process.env.AUDIT_URL || baseURL || 'http://localhost:3000').replace(/\/+$/, '');
  const visited = new Set<string>();
  const queue: string[] = ['/'];

  fs.rmSync(SHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const issues = new Map<string, {
    severity: Severity;
    category: string;
    issue: string;
    fix: string;
    location: string;
    routes: Set<string>;
    shot?: string;
  }>();
  let pageNewIssues = 0;

  const addIssue = (o: { key: string; severity: Severity; category: string; issue: string; fix: string; location: string; route: string }): boolean => {
    const existing = issues.get(o.key);
    if (existing) { existing.routes.add(o.route); return false; }
    issues.set(o.key, { severity: o.severity, category: o.category, issue: o.issue, fix: o.fix, location: o.location, routes: new Set([o.route]) });
    pageNewIssues++;
    console.log(`      ❌ [ISSUE #${issues.size}] (${o.severity}) ${o.category} -> ${o.location}`);
    return true;
  };


  const routeVisualCount = new Map<string, number>();
  const reportFindings = async (findings: Finding[], route: string, vp: { name: string; width: number }, ctx = '') => {
    const kept = findings
      .filter((f) => ENABLED_CHECKS.has(f.kind) && SEVERITY_ORDER[f.severity] <= SEVERITY_ORDER[MIN_SEVERITY])
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const f of kept) {
      const key = `VIS:${f.kind}:${f.sig}`; // one issue per element, all viewports listed in routes
      if (!issues.has(key)) {
        const n = routeVisualCount.get(route) || 0;
        if (n >= MAX_VISUAL_PER_ROUTE) continue;
        routeVisualCount.set(route, n + 1);
      }
      const isNew = addIssue({
        key,
        severity: f.severity,
        category: `${VISUAL_CATEGORY[f.kind] || f.kind} (${vp.name} ${vp.width}px${ctx})`,
        issue: f.html === '<html>' ? f.detail : `${f.detail} — \`${f.html}\``,
        fix: f.fix,
        location: f.html === '<html>' ? inferViewFromRoute(route) : findSourceLocation(f.html, route, f.text),
        route: `${route} [${vp.name}${ctx}]`,
      });
      if (isNew && f.auditId) {
        const shot = await captureElement(page, f.auditId, `${f.kind}-${vp.name}`);
        if (shot) issues.get(key)!.shot = shot;
      }
    }
  };

  const flushReportToDisk = (isFinal = false) => {
    const sorted = Array.from(issues.values()).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const count = (s: Severity) => sorted.filter((i) => i.severity === s).length;
    const lines: string[] = [
      `# Automated Multi-Resolution, Multi-Theme & Visual UI Audit Report`,
      `Status: **${isFinal ? 'COMPLETED' : 'IN PROGRESS...'}** | Crawled **${visited.size}** routes on \`${rootUrl}\` across **${VIEWPORTS.length} resolutions** and **${THEMES.length} themes**. Found **${issues.size}** unique root-cause issues (High: ${count('High')}, Medium: ${count('Medium')}, Low: ${count('Low')}).`,
      ``,
      `## Instructions for Agentic AI`,
      `1. Fix issues in severity order (High -> Medium -> Low).`,
      `2. Open the screenshot (red outline = offending element) to see exactly what the user sees.`,
      `3. Jump directly to **File / Location** and fix the shared class/component (do not read unrelated files). One fix usually clears every listed route.`,
      `4. Do not hide problems with overflow-hidden; make the layout fit (wrap, stack, min-w-0, shrink-0).`,
      `5. Re-run the audit until it reports 0 issues.`,
      ``,
      `| # | Severity | Category | File / Location | Issue Details | Required Fix | Affected Routes / Context | Screenshot |`,
      `|---|---|---|---|---|---|---|---|`,
    ];
    let index = 1;
    for (const item of sorted) {
      const routeArr = Array.from(item.routes);
      const routesText = routeArr.length > 2 ? `${routeArr.slice(0, 2).join(', ')} (+${routeArr.length - 2} more)` : routeArr.join(', ');
      const esc = (s: string) => s.replace(/\|/g, '\\|');
      const shot = item.shot ? `[view](${item.shot.replace(/\\/g, '/')})` : '-';
      lines.push(`| ${index++} | **${item.severity}** | **${esc(item.category)}** | \`${item.location}\` | ${esc(item.issue)} | ${esc(item.fix)} | \`${esc(routesText)}\` | ${shot} |`);
    }
    if (issues.size === 0) {
      lines.push(`| - | - | **ALL PASSED** | - | Zero issues across ${visited.size} pages, ${VIEWPORTS.length} resolutions and ${THEMES.length} themes | None | All | - |`);
    }
    fs.writeFileSync('AGENT_REPORT.md', lines.join('\n'), 'utf8');
  };

  console.log(`\n======================================================================`);
  console.log(`🚀 STARTING FULL-SITE VISUAL AUDIT ON: ${rootUrl}`);
  console.log(`======================================================================`);

  // --- Sitemap seed ---
  process.stdout.write(`🔍 Checking ${rootUrl}/sitemap.xml... `);
  try {
    const sitemapRes = await page.request.get(`${rootUrl}/sitemap.xml`);
    if (sitemapRes.ok()) {
      const xml = await sitemapRes.text();
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        try {
          const pathname = new URL(m[1]).pathname;
          if (pathname && !queue.includes(pathname)) queue.push(pathname);
        } catch {}
      }
      console.log(`✅ Seeded ${queue.length} URLs from sitemap.`);
    } else {
      console.log(`⚠️ Missing (HTTP ${sitemapRes.status()}).`);
      addIssue({ key: 'SEO_SITEMAP', severity: 'Medium', category: 'SEO', issue: 'Missing or inaccessible /sitemap.xml', fix: 'Generate and serve /sitemap.xml', location: 'src/routes/seo.js', route: '/sitemap.xml' });
    }
  } catch {
    console.log(`⚠️ Could not fetch sitemap.`);
  }

  // --- Global listeners: JS errors, console errors, broken assets ---
  let currentRoute = '/';
  page.on('pageerror', (err) => {
    const msg = err.message.split('\n')[0].slice(0, 100);
    addIssue({ key: `JS:${msg}`, severity: 'High', category: 'Functionality', issue: `Uncaught JS error: ${msg}`, fix: 'Fix client-side script exception', location: inferViewFromRoute(currentRoute), route: currentRoute });
  });
  page.on('console', (m) => {
    if (!REPORT_CONSOLE_ERRORS || m.type() !== 'error') return;
    const msg = m.text().split('\n')[0].slice(0, 100);
    if (/Failed to load resource/i.test(msg)) return; // reported as Broken Asset with the URL
    addIssue({ key: `CONSOLE:${msg}`, severity: 'Low', category: 'Console Error', issue: msg, fix: 'Resolve the console error', location: inferViewFromRoute(currentRoute), route: currentRoute });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() < 400 || !u.startsWith(rootUrl)) return;
    if (!/\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i.test(u)) return;
    const p = new URL(u).pathname;
    const hit = grepAll(p)[0];
    addIssue({ key: `ASSET:${p}`, severity: 'High', category: 'Broken Asset', issue: `HTTP ${res.status()} for ${p} (styles/fonts/icons may render wrong)`, fix: 'Fix the asset path or restore the file under public/', location: hit || inferViewFromRoute(currentRoute), route: currentRoute });
  });

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const route = queue.shift()!;
    if (visited.has(route)) continue;
    visited.add(route);
    currentRoute = route;
    pageNewIssues = 0;

    const totalPlanned = Math.min(visited.size + queue.length, MAX_PAGES);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`🌐 [${visited.size}/${totalPlanned}] Auditing Route: "${route}" (Elapsed: ${elapsedSec}s | Unique Issues: ${issues.size})`);

    await page.setViewportSize({ width: 1920, height: 1080 });

    let response;
    try {
      response = await page.goto(`${rootUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {
      console.log(`   ❌ Navigation timed out (>15s) on ${route}`);
      addIssue({ key: `TIMEOUT:${route}`, severity: 'High', category: 'Performance', issue: 'Page load timed out (>15s)', fix: 'Optimize route handler or blocking scripts', location: inferViewFromRoute(route), route });
      continue;
    }

    const status = response?.status() || 0;
    if (status >= 400) {
      console.log(`   ❌ Broken route HTTP ${status} on ${route}`);
      addIssue({ key: `HTTP:${route}`, severity: 'High', category: 'SEO/Crawl', issue: `Broken internal link (HTTP ${status})`, fix: 'Fix broken href or add Express route handler', location: inferViewFromRoute(route), route });
      continue;
    }

    // --- A. SECURITY HEADERS, COOKIE BANNER, FORMS & WIDGETS (Homepage) ---
    if (route === '/') {
      process.stdout.write(`   🛡️  Checking Security Headers, Cookie Banner, Sliders & Forms... `);
      const headers = response?.headers() || {};
      const requiredHeaders: Record<string, string> = {
        'x-content-type-options': 'Add helmet() or set X-Content-Type-Options: "nosniff"',
        'x-frame-options': 'Add helmet() or set X-Frame-Options: "SAMEORIGIN"',
        'strict-transport-security': 'Add HSTS header in helmet() configuration',
        'content-security-policy': 'Configure Content-Security-Policy in helmet()',
        'referrer-policy': 'Set Referrer-Policy: "strict-origin-when-cross-origin"',
      };
      for (const [h, fixMsg] of Object.entries(requiredHeaders)) {
        if (!headers[h]) addIssue({ key: `SEC_${h}`, severity: 'Medium', category: 'Security', issue: `Missing HTTP header: ${h}`, fix: fixMsg, location: 'server.js / app.js', route: '/' });
      }

      const acceptBtn = page.locator('#cookie-accept');
      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click();
        const banner = page.locator('#cookie-notice, [id*="cookie-banner"]').first();
        if ((await banner.count()) > 0 && (await banner.isVisible())) {
          addIssue({ key: 'COMP_COOKIE', severity: 'High', category: 'Compliance', issue: 'Clicking #cookie-accept did not hide cookie banner', fix: 'Ensure click handler hides banner container', location: findSourceLocation('<button id="cookie-accept">', '/'), route: '/' });
        }
      }

      const slider = page.locator('input[type="range"]').first();
      if (await slider.isVisible().catch(() => false)) {
        await slider.fill('5');
        await slider.dispatchEvent('change');
        const resultText = page.locator('text=/\\d+(\\.\\d+)?\\s*(mils|mm)/i').first();
        if (!(await resultText.isVisible())) {
          addIssue({ key: 'FUNC_SLIDER', severity: 'Medium', category: 'Functionality', issue: 'IPC-2221 trace slider did not update output text', fix: 'Check slider input event listener', location: 'views/pages/index.ejs', route: '/' });
        }
      }

      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('invalid-email');
        const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
        if (!isInvalid) {
          addIssue({ key: 'FUNC_FORM', severity: 'Medium', category: 'Functionality', issue: 'Email input accepts malformed email addresses', fix: 'Add type="email" and required attributes', location: 'views/pages/index.ejs', route: '/' });
        }
        await emailInput.fill('');
      }
      console.log(`Done.`);
    }

    // Load fonts, freeze animations, trigger scroll-reveal & lazy images
    await preparePage(page);

    // --- B. DISCOVER INTERNAL LINKS ---
    const hrefs = await page.$$eval('a[href^="/"]', (els) => els.map((a) => a.getAttribute('href') || '').filter(Boolean));
    let newlyQueued = 0;
    for (const raw of hrefs) {
      const clean = raw.split('#')[0].split('?')[0];
      if (
        clean && clean.startsWith('/') && !clean.startsWith('//') &&
        !clean.match(/\.(pdf|zip|png|jpg|jpeg|svg|xml|txt|ico)$/i) &&
        !visited.has(clean) && !queue.includes(clean)
      ) {
        queue.push(clean);
        newlyQueued++;
      }
    }

    // --- C. PERFORMANCE & SEO CHECKS ---
    const pageMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime || 0;
      return {
        fcp: Math.round(fcp),
        domComplete: nav ? Math.round(nav.domComplete) : 0,
        title: document.title.trim(),
        metaDesc: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || '',
        h1Count: document.querySelectorAll('h1').length,
        brokenImgs: Array.from(document.querySelectorAll('img'))
          .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src'))
          .map((img) => img.getAttribute('src')!),
      };
    });

    console.log(`   ⚡ Perf: FCP=${pageMetrics.fcp}ms, DOM=${pageMetrics.domComplete}ms | 🔍 SEO: H1=${pageMetrics.h1Count}, BrokenImgs=${pageMetrics.brokenImgs.length} | 🔗 +${newlyQueued} links`);

    const view = inferViewFromRoute(route);
    if (pageMetrics.fcp > 2500) addIssue({ key: `PERF_FCP:${route}`, severity: 'Medium', category: 'Performance', issue: `Slow FCP (${pageMetrics.fcp}ms > 2500ms)`, fix: 'Defer non-critical JS/CSS', location: view, route });
    if (pageMetrics.domComplete > 4500) addIssue({ key: `PERF_DOM:${route}`, severity: 'Medium', category: 'Performance', issue: `Slow DOM Complete (${pageMetrics.domComplete}ms > 4500ms)`, fix: 'Lazy-load heavy widgets', location: view, route });
    if (!pageMetrics.title) addIssue({ key: `SEO_TITLE:${route}`, severity: 'Medium', category: 'SEO', issue: 'Missing <title> tag', fix: 'Add descriptive <title>', location: view, route });
    if (!pageMetrics.metaDesc) addIssue({ key: `SEO_DESC:${route}`, severity: 'Low', category: 'SEO', issue: 'Missing meta description', fix: 'Add <meta name="description">', location: view, route });
    if (!pageMetrics.canonical) addIssue({ key: `SEO_CANON:${route}`, severity: 'Low', category: 'SEO', issue: 'Missing canonical link tag', fix: 'Add <link rel="canonical">', location: view, route });
    if (pageMetrics.h1Count !== 1) addIssue({ key: `SEO_H1:${route}`, severity: 'Low', category: 'SEO', issue: `Found ${pageMetrics.h1Count} <h1> tags (should be 1)`, fix: 'Ensure exactly one <h1> per page', location: view, route });
    for (const src of pageMetrics.brokenImgs) {
      addIssue({ key: `IMG:${src}`, severity: 'High', category: 'Content', issue: `Broken image src="${src}"`, fix: 'Fix image path or restore asset', location: findSourceLocation(`<img src="${src}">`, route), route });
    }

    const isCoreTemplate = CORE_TEMPLATES.includes(route);

    // --- D. THEME CONTRAST + WCAG ACCESSIBILITY ---
    const themesToTest = route === '/' ? THEMES : isCoreTemplate ? ['light', 'dark'] : ['light'];
    process.stdout.write(`   🎨 Auditing Themes & WCAG (${themesToTest.length}): `);

    for (let i = 0; i < themesToTest.length; i++) {
      const themeName = themesToTest[i];
      process.stdout.write(`[${themeName}] `);
      await applyTheme(page, themeName);

      const builder = new AxeBuilder({ page }).exclude('iframe[src*="youtube-nocookie.com/embed/"]');
      const axe = i === 0
        ? await builder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        : await builder.withRules(['color-contrast']).analyze();

      for (const v of axe.violations) {
        if (v.impact !== 'critical' && v.impact !== 'serious') continue;
        for (const node of v.nodes) {
          const snippet = node.html.replace(/\s+/g, ' ').slice(0, 120);
          const elSig = getElementSignature(snippet);
          const loc = findSourceLocation(snippet, route);
          if (v.id === 'color-contrast') {
            const failureDetail = node.any[0]?.message?.replace(/\s+/g, ' ') || v.help;
            addIssue({
              key: `CONTRAST:${themeName}:${elSig}`,
              severity: 'Medium',
              category: `Theme Contrast (${themeName.toUpperCase()})`,
              issue: `Element: \`${snippet}\` — ${failureDetail}`,
              fix: `Update Tailwind text/bg contrast class in "${themeName}" mode to >= 4.5:1`,
              location: loc,
              route: `${route} [${themeName}]`,
            });
          } else {
            const specificFix = v.id === 'label-content-name-mismatch'
              ? 'Remove redundant aria-label (or make it match visible text exactly)'
              : v.help;
            addIssue({ key: `A11Y:${v.id}:${elSig}`, severity: v.impact === 'critical' ? 'High' : 'Medium', category: `A11y (${v.id})`, issue: `Element: \`${snippet}\``, fix: specificFix, location: loc, route });
          }
        }
      }
    }
    if (themesToTest.length > 1) await applyTheme(page, 'light'); // restore before layout checks
    process.stdout.write(`✓\n`);

    // --- E. VISUAL / RESPONSIVE CHECKS ACROSS VIEWPORTS ---
    const viewportsToTest = isCoreTemplate ? VIEWPORTS : VIEWPORTS.filter((v) => v.name !== 'Laptop');
    process.stdout.write(`   📱 Visual checks (${viewportsToTest.length} viewports): `);

    for (const vp of viewportsToTest) {
      process.stdout.write(`[${vp.name}] `);
      const isTouch = vp.width < 1024;
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 80);

      // 1) Full scan of in-flow + fixed elements at top of page
      const findings = (await page.evaluate(visualScan, { scope: null, isTouch, fixedOnly: false, minClip: MIN_CLIP_PX, ignoreSel: IGNORE_SELECTOR, enabled: [...ENABLED_CHECKS] })) as Finding[];
      await reportFindings(findings, route, vp);

      // 2) Floating elements (back-to-top, chat FAB, bottom nav) only appear after scrolling
      if (isTouch) {
        const cover = ENABLED_CHECKS.has('BOTTOM_BAR_COVER') ? await page.evaluate(bottomBarScan) : null;
        if (cover) {
          addIssue({
            key: `VIS:BOTTOM_BAR_COVER:${getElementSignature(cover.barHtml)}`,
            severity: 'Medium',
            category: `${VISUAL_CATEGORY.BOTTOM_BAR_COVER} (${vp.name} ${vp.width}px)`,
            issue: `Last content \`${cover.lastHtml}\` is hidden ${cover.overlap}px behind fixed bar \`${cover.barHtml}\``,
            fix: 'Add bottom padding to body/footer equal to the bar height on mobile (e.g. pb-20 md:pb-0).',
            location: findSourceLocation(cover.barHtml, route),
            route: `${route} [${vp.name}]`,
          });
        }
        const fixedFindings = (await page.evaluate(visualScan, { scope: null, isTouch, fixedOnly: true, minClip: MIN_CLIP_PX, ignoreSel: IGNORE_SELECTOR, enabled: [...ENABLED_CHECKS] })) as Finding[];
        await reportFindings(fixedFindings, route, vp, ', scrolled');
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      // 3) Mobile menu open state (homepage only - header is shared)
      if (route === '/' && vp.width < 768) {
        const toggle = page.locator('header [aria-label*="menu" i], header button[aria-controls]').first();
        if (await toggle.isVisible().catch(() => false)) {
          await toggle.click().catch(() => {});
          await settle(page, 250);
          const menuFindings = (await page.evaluate(visualScan, { scope: null, isTouch, fixedOnly: true, minClip: MIN_CLIP_PX, ignoreSel: IGNORE_SELECTOR, enabled: [...ENABLED_CHECKS] })) as Finding[];
          await reportFindings(menuFindings, route, vp, ', menu open');
          await page.keyboard.press('Escape').catch(() => {});
          if ((await toggle.getAttribute('aria-expanded').catch(() => null)) === 'true') await toggle.click().catch(() => {});
          await settle(page, 150);
        }
      }
    }
    process.stdout.write(`✓\n`);

    console.log(`   ✅ Finished "${route}" (+${pageNewIssues} new root-cause issues | ${issues.size} total saved to AGENT_REPORT.md)`);
    flushReportToDisk(false);
  }

  flushReportToDisk(true);
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n======================================================================`);
  console.log(`🏁 AUDIT COMPLETE in ${totalSec}s!`);
  console.log(`📊 Pages Crawled: ${visited.size} | Unique Root-Cause Issues: ${issues.size} | Screenshots: ${shotCount}`);
  console.log(`📄 Report: AGENT_REPORT.md | 🖼️  Screenshots: ${SHOT_DIR}/`);
  console.log(`======================================================================\n`);

  expect(issues.size, `Found ${issues.size} unique issues. Share AGENT_REPORT.md (and ${SHOT_DIR}/) with your AI agent to fix them.`).toBe(0);
});
