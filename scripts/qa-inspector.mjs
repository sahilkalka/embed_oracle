// qa-inspector.mjs
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const TARGET_URL = process.argv[2] || 'http://localhost:3000';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isTouch: false },
  { name: 'tablet', width: 768, height: 1024, isTouch: true },
  { name: 'mobile', width: 375, height: 812, isTouch: true },
];

const THEMES = ['light', 'dark'];

/**
 * Helper injected into the browser to generate a unique, readable CSS selector for the agent
 */
const domAuditScript = (isTouchViewport) => {
  const getSelector = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 4) {
      let selector = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        const classes = cur.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.includes(':') && !c.startsWith('hover'))
          .slice(0, 2);
        if (classes.length) {
          selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
        }
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(selector);
      cur = parent;
    }
    return parts.join(' > ');
  };

  const isVisible = (el) => {
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const results = {
    pageHasHorizontalScroll:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    overflowingElements: [],
    overlappingElements: [],
    clippedTextElements: [],
    undersizedTouchTargets: [],
    staticInteractiveElements: [],
  };

  const vw = document.documentElement.clientWidth;
  const allElements = Array.from(document.querySelectorAll('body *')).filter(isVisible);

  // 1. Detect Horizontal Overflowing Elements & Clipped Text
  for (const el of allElements) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Check if element extends past right or left viewport edge
    if (rect.right > vw + 2 || rect.left < -2) {
      // Ignore intentionally scrollable carousels inside hidden overflow parents
      const parentOverflowX = el.parentElement
        ? window.getComputedStyle(el.parentElement).overflowX
        : 'visible';
      if (parentOverflowX !== 'auto' && parentOverflowX !== 'scroll' && parentOverflowX !== 'hidden') {
        results.overflowingElements.push({
          selector: getSelector(el),
          tag: el.tagName.toLowerCase(),
          overflowRightPx: Math.round(rect.right - vw),
          overflowLeftPx: rect.left < 0 ? Math.round(Math.abs(rect.left)) : 0,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    }

    // Check for unintentionally clipped text inside buttons or badges
    if (
      ['BUTTON', 'A', 'SPAN', 'H1', 'H2', 'H3', 'P'].includes(el.tagName) &&
      el.children.length === 0 &&
      el.textContent.trim().length > 0
    ) {
      if (
        el.scrollWidth > el.clientWidth + 2 &&
        style.textOverflow !== 'ellipsis' &&
        (style.overflowX === 'hidden' || style.overflow === 'hidden')
      ) {
        results.clippedTextElements.push({
          selector: getSelector(el),
          text: el.textContent.trim().slice(0, 40),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
        });
      }
    }
  }

  // 2. Detect Interactive & Text Overlaps (Bounding Box Intersection)
  const candidates = allElements.filter((el) => {
    const tag = el.tagName;
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'SVG'].includes(tag)) return true;
    // Include leaf text nodes
    if (el.children.length === 0 && el.textContent.trim().length > 0) return true;
    return false;
  });

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const elA = candidates[i];
      const elB = candidates[j];

      // Skip ancestor-descendant pairs
      if (elA.contains(elB) || elB.contains(elA)) continue;

      const rA = elA.getBoundingClientRect();
      const rB = elB.getBoundingClientRect();

      const overlapX = Math.max(0, Math.min(rA.right, rB.right) - Math.max(rA.left, rB.left));
      const overlapY = Math.max(0, Math.min(rA.bottom, rB.bottom) - Math.max(rA.top, rB.top));
      const overlapArea = overlapX * overlapY;

      // Require > 20px² overlap to ignore 1px border touching
      if (overlapArea > 20 && overlapX > 4 && overlapY > 4) {
        results.overlappingElements.push({
          elementA: getSelector(elA),
          elementB: getSelector(elB),
          textA: (elA.textContent || '').trim().slice(0, 25),
          textB: (elB.textContent || '').trim().slice(0, 25),
          overlapPx: { width: Math.round(overlapX), height: Math.round(overlapY) },
        });
      }
    }
  }

  // 3. Audit Interactive Elements (Touch Target Size & Micro-interaction Transitions)
  const interactives = Array.from(
    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')
  ).filter(isVisible);

  for (const el of interactives) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Check 44x44px touch target minimum on Tablet/Mobile (skip inline text links inside paragraphs)
    const isInlineLink =
      el.tagName === 'A' &&
      style.display === 'inline' &&
      el.parentElement &&
      ['P', 'LI', 'SPAN'].includes(el.parentElement.tagName);

    if (isTouchViewport && !isInlineLink && (rect.width < 44 || rect.height < 44)) {
      results.undersizedTouchTargets.push({
        selector: getSelector(el),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30),
        size: { width: Math.round(rect.width), height: Math.round(rect.height) },
        requiredMinimum: '44x44px',
      });
    }

    // Check if buttons/CTA links lack smooth CSS transitions ("aliveness" check)
    if (el.tagName === 'BUTTON' || (el.tagName === 'A' && style.display !== 'inline')) {
      const duration = style.transitionDuration;
      if (!duration || duration === '0s' || duration === '0ms') {
        results.staticInteractiveElements.push({
          selector: getSelector(el),
          issue: 'Missing CSS transition (transition-duration is 0s). Add cubic-bezier transition for hover/active bounciness.',
        });
      }
    }
  }

  // Deduplicate & cap noisy arrays so agent prompt context stays clean
  results.overflowingElements = results.overflowingElements.slice(0, 15);
  results.overlappingElements = results.overlappingElements.slice(0, 15);
  results.undersizedTouchTargets = results.undersizedTouchTargets.slice(0, 15);
  results.staticInteractiveElements = results.staticInteractiveElements.slice(0, 15);

  return results;
};

async function runAudit(url) {
  const browser = await chromium.launch({ headless: true });
  const fullReport = {
    url,
    timestamp: new Date().toISOString(),
    summary: { totalIssues: 0, passed: true },
    runtimeErrors: { consoleErrors: [], failedRequests: [] },
    matrix: {},
  };

  try {
    for (const vp of VIEWPORTS) {
      fullReport.matrix[vp.name] = {};

      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });

        const page = await context.newPage();

        // Capture Console & Network failures on the initial pass
        if (vp.name === 'desktop' && theme === 'light') {
          page.on('console', (msg) => {
            if (msg.type() === 'error') fullReport.runtimeErrors.consoleErrors.push(msg.text());
          });
          page.on('pageerror', (err) => {
            fullReport.runtimeErrors.consoleErrors.push(err.message);
          });
          page.on('response', (res) => {
            if (res.status() >= 400) {
              fullReport.runtimeErrors.failedRequests.push({
                url: res.url(),
                status: res.status(),
              });
            }
          });
        }

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // Force common class/attribute theme toggles used by Tailwind, Bootstrap, and custom themes
        await page.evaluate((targetTheme) => {
          const root = document.documentElement;
          const body = document.body;
          root.classList.remove('light', 'dark');
          body.classList.remove('light', 'dark');
          root.classList.add(targetTheme);
          body.classList.add(targetTheme);
          root.setAttribute('data-theme', targetTheme);
          root.setAttribute('data-bs-theme', targetTheme);
          root.style.colorScheme = targetTheme;
        }, theme);

        // Wait briefly for CSS theme variables and transitions to settle
        await page.waitForTimeout(350);

        // Run Layout, Overlap & Aliveness DOM Audit
        const domResults = await page.evaluate(domAuditScript, vp.isTouch);

        // Run Axe-Core Contrast & WCAG Audit
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2aa', 'wcag21aa'])
          .analyze();

        const contrastFailures = axeResults.violations
          .filter((v) => v.id === 'color-contrast')
          .flatMap((v) =>
            v.nodes.map((n) => ({
              selector: n.target.join(' '),
              htmlSnippet: n.html.slice(0, 100),
              failureSummary: n.failureSummary,
            }))
          )
          .slice(0, 15);

        const issueCount =
          (domResults.pageHasHorizontalScroll ? 1 : 0) +
          domResults.overflowingElements.length +
          domResults.overlappingElements.length +
          domResults.clippedTextElements.length +
          domResults.undersizedTouchTargets.length +
          domResults.staticInteractiveElements.length +
          contrastFailures.length;

        fullReport.summary.totalIssues += issueCount;

        fullReport.matrix[vp.name][theme] = {
          viewport: `${vp.width}x${vp.height}`,
          theme,
          issueCount,
          layoutAndPlacement: {
            pageHasHorizontalScroll: domResults.pageHasHorizontalScroll,
            overflowingElements: domResults.overflowingElements,
            overlappingElements: domResults.overlappingElements,
            clippedTextElements: domResults.clippedTextElements,
            undersizedTouchTargets: domResults.undersizedTouchTargets,
          },
          contrastViolations: contrastFailures,
          uiAliveness: {
            staticInteractiveElements: domResults.staticInteractiveElements,
          },
        };

        await context.close();
      }
    }

    fullReport.summary.totalIssues +=
      fullReport.runtimeErrors.consoleErrors.length +
      fullReport.runtimeErrors.failedRequests.length;
    fullReport.summary.passed = fullReport.summary.totalIssues === 0;

    console.log(JSON.stringify(fullReport, null, 2));
    process.exit(fullReport.summary.passed ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ fatalError: err.message, stack: err.stack }, null, 2));
    process.exit(2);
  } finally {
    await browser.close();
  }
}

runAudit(TARGET_URL);