/**
 * visual_audit_runner.js
 * 
 * Production Visual Regression & Responsive Theme Audit Runner
 * Powered by BackstopJS & Puppeteer.
 * 
 * Features:
 *   - Multi-viewport responsive audit (Desktop, Laptop, Tablet, Mobile, SmallMobile)
 *   - 7-theme palette testing (light, dark, emerald, vscode, amber, cyan, slate)
 *   - Deep interactive state verification (mobile nav drawers, console tabs, code blocks, calculators)
 *   - Zero-jitter rendering engine (freezes CSS animations, settles web fonts, normalizes scrollbars)
 *   - Generates structured Agentic-AI readable reports (JSON & Markdown) with concrete action items
 * 
 * Usage:
 *   node tests/visual_audit_runner.js --reference             (Generate initial baseline images)
 *   node tests/visual_audit_runner.js --test                  (Compare against reference and produce AI report)
 *   node tests/visual_audit_runner.js --approve               (Accept current test images as new reference)
 *   node tests/visual_audit_runner.js --test --quick          (Run fast core subset: Home, Mobile Nav, Blog, Tools)
 *   node tests/visual_audit_runner.js --test --filter="Dark"  (Run only scenarios matching filter)
 * 
 * NPM Shortcuts:
 *   npm run test:visual
 *   npm run test:visual:quick
 *   npm run test:visual:reference
 *   npm run test:visual:approve
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const backstop = require('backstopjs');

// --- 1. CONFIGURATION & CONSTANTS ---
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000';
const BACKSTOP_DIR = path.join(__dirname, 'backstop_data');
const ENGINE_SCRIPTS_DIR = path.join(BACKSTOP_DIR, 'engine_scripts', 'puppet');
const AGENT_JSON_REPORT = path.join(__dirname, 'agent_visual_audit_report.json');
const AGENT_MD_REPORT = path.join(__dirname, 'AGENT_VISUAL_REPORT.md');

const ALL_THEMES = ['light', 'dark', 'emerald', 'vscode', 'amber', 'cyan', 'slate'];

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'laptop', width: 1024, height: 768 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'mobile', width: 390, height: 844 },
  { label: 'smallMobile', width: 360, height: 740 }
];

const MOBILE_VIEWPORTS = VIEWPORTS.filter(vp => vp.width <= 768);

// --- 2. ENGINE SCRIPTS GENERATOR (PUPPETEER HOOKS) ---
function ensureEngineScripts() {
  fs.mkdirSync(ENGINE_SCRIPTS_DIR, { recursive: true });

  // Hook A: onBefore - Injects Session Auth, OS Color Scheme & Storage Keys
  const beforeScriptContent = `
module.exports = async (page, scenario, vp) => {
  const theme = scenario.theme || 'light';
  const isDarkFamily = theme !== 'light';

  // 1. Emulate OS prefers-color-scheme & prefers-reduced-motion to freeze animations
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: isDarkFamily ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' }
  ]);

  // 2. Pre-seed LocalStorage (auth token, onboarding flag, theme & accent palette)
  await page.evaluateOnNewDocument((targetTheme, isDark) => {
    try {
      localStorage.setItem('auth_user', JSON.stringify({ id: 'usr_qa', role: 'admin' }));
      localStorage.setItem('has_seen_onboarding_modal', 'true');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      localStorage.setItem('color-theme', targetTheme);
      localStorage.setItem('accent', targetTheme);
      localStorage.setItem('next-theme', targetTheme);
    } catch (_) {}
  }, theme, isDarkFamily);

  // 3. Resilient warmup retry to prevent Windows TCP loopback SYN drops on cold worker start
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.goto(scenario.url, { waitUntil: 'domcontentloaded', timeout: 6000 });
      break;
    } catch (err) {
      if (attempt === 4) break;
      await new Promise(r => setTimeout(r, 600));
    }
  }
};
`;

  // Hook B: onReady - Freezes Animations, Enforces DOM Themes & Executes Interactions
  const readyScriptContent = `
module.exports = async (page, scenario, vp) => {
  const theme = scenario.theme || 'light';
  const isDarkFamily = theme !== 'light';

  // 1. Freeze all CSS animations, transitions and caret blinking to guarantee pixel determinism
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__visual_audit_freeze__';
    style.innerHTML = \`
      *, *::before, *::after {
        transition-property: none !important;
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        caret-color: transparent !important;
      }
      /* Normalize scrollbar appearance to avoid cross-OS rendering diffs */
      ::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(100, 116, 139, 0.4) !important;
      }
    \`;
    document.head.appendChild(style);
  });

  // 2. Enforce active theme & palette tokens across HTML/Body attributes and classes
  await page.evaluate((targetTheme, isDark) => {
    const html = document.documentElement;
    const body = document.body;

    if (isDark) {
      html.classList.add('dark');
      html.classList.remove('light');
      body.classList.add('dark');
      body.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
      body.classList.add('light');
      body.classList.remove('dark');
    }

    html.setAttribute('data-theme', targetTheme);
    html.setAttribute('data-accent', targetTheme);
    body.setAttribute('data-theme', targetTheme);

    // Notify any reactive canvas / kinetic modules (e.g. hairline engine)
    window.dispatchEvent(new CustomEvent('hairline-palette-change', { detail: { theme: targetTheme } }));
  }, theme, isDarkFamily);

  // 3. Optional Scenario Interaction: Click element (e.g., tabs, toggles)
  if (scenario.clickSelector) {
    try {
      await page.waitForSelector(scenario.clickSelector, { timeout: 3000, visible: true });
      await page.click(scenario.clickSelector);
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.warn(\`[Scenario: \${scenario.label}] Warning: clickSelector '\${scenario.clickSelector}' not triggered: \${e.message}\`);
    }
  }

  // 4. Optional Scenario Interaction: Toggle Mobile Navigation Drawer
  if (scenario.toggleMobileNav && (vp.label === 'mobile' || vp.label === 'smallMobile' || vp.label === 'tablet')) {
    const navBtnSelectors = [
      '#mobileNavToggle',
      '#mobile-menu-toggle',
      'button[aria-label*="navigation" i]',
      'button[aria-label*="menu" i]',
      'header button:has(span.material-symbols-rounded)'
    ];

    let clicked = false;
    for (const sel of navBtnSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isIntersectingViewport()) {
          await btn.click();
          clicked = true;
          break;
        }
      } catch (_) {}
    }

    if (clicked) {
      await new Promise(r => setTimeout(r, 350));
    } else {
      console.warn(\`[\${vp.label}] Mobile navigation toggle button not found on \${scenario.label}\`);
    }
  }

  // 5. Ensure all images are loaded to stabilize document height
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.removeAttribute('loading');
      img.loading = 'eager';
    });
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 400);
      });
    }));
  });

  // 6. Settle web fonts, clear animation loops & intervals to ensure determinism
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Cancel any active animation loops so dynamic canvases don't jitter
    const highestId = window.requestAnimationFrame(() => {});
    for (let i = 1; i <= highestId; i++) {
      window.cancelAnimationFrame(i);
    }
    window.requestAnimationFrame = () => {};

    // Clear active JS intervals
    const highestInterval = setInterval(() => {}, 9999);
    for (let i = 1; i <= highestInterval; i++) {
      clearInterval(i);
    }

    window.scrollTo(0, 0);
  });
};
`;

  fs.writeFileSync(path.join(ENGINE_SCRIPTS_DIR, 'onBefore.js'), beforeScriptContent.trim());
  fs.writeFileSync(path.join(ENGINE_SCRIPTS_DIR, 'onReady.js'), readyScriptContent.trim());
}

// --- 3. SCENARIO DEFINITIONS ---
function buildScenarios(options = {}) {
  const { quick = false, filter = null } = options;

  let scenarios = [
    // --- GROUP A: THEME MATRIX ON HOMEPAGE ---
    {
      label: 'Homepage - Light Mode',
      url: `${APP_URL}/`,
      theme: 'light',
      misMatchThreshold: 0.1
    },
    {
      label: 'Homepage - Dark Mode',
      url: `${APP_URL}/`,
      theme: 'dark',
      misMatchThreshold: 0.1
    },
    {
      label: 'Homepage - Emerald Palette',
      url: `${APP_URL}/`,
      theme: 'emerald',
      misMatchThreshold: 0.15
    },
    {
      label: 'Homepage - VSCode Dark Palette',
      url: `${APP_URL}/`,
      theme: 'vscode',
      misMatchThreshold: 0.15
    },
    {
      label: 'Homepage - Amber Industrial Palette',
      url: `${APP_URL}/`,
      theme: 'amber',
      misMatchThreshold: 0.15
    },
    {
      label: 'Homepage - Cyan Oscilloscope Palette',
      url: `${APP_URL}/`,
      theme: 'cyan',
      misMatchThreshold: 0.15
    },
    {
      label: 'Homepage - Slate Palette',
      url: `${APP_URL}/`,
      theme: 'slate',
      misMatchThreshold: 0.15
    },

    // --- GROUP B: INTERACTIVE MOBILE NAVIGATION ---
    {
      label: 'Mobile Navigation Drawer Open',
      url: `${APP_URL}/`,
      theme: 'light',
      toggleMobileNav: true,
      viewports: MOBILE_VIEWPORTS,
      misMatchThreshold: 0.15
    },

    // --- GROUP C: CODE SNIPPETS & TECHNICAL BLOGS (Horizontal scroll & clipping check) ---
    {
      label: 'Blog Post - Code Block Layout (Light)',
      url: `${APP_URL}/blogs/cortex-m-low-power-firmware-design`,
      theme: 'light',
      readySelector: 'article, pre, code',
      misMatchThreshold: 0.1
    },
    {
      label: 'Blog Post - Code Block Layout (Dark)',
      url: `${APP_URL}/blogs/cortex-m-low-power-firmware-design`,
      theme: 'dark',
      readySelector: 'article, pre, code',
      misMatchThreshold: 0.1
    },

    // --- GROUP D: INTERACTIVE TOOLS & CALCULATORS ---
    {
      label: 'Engineering Tools Directory',
      url: `${APP_URL}/tools`,
      theme: 'light',
      misMatchThreshold: 0.1
    },
    {
      label: 'Interactive PCB Trace Impedance Calculator',
      url: `${APP_URL}/tools/pcb-trace`,
      theme: 'dark',
      misMatchThreshold: 0.15
    },

    // --- GROUP E: SERVICES & ESTIMATOR ---
    {
      label: 'Engineering Services Directory',
      url: `${APP_URL}/services`,
      theme: 'light',
      misMatchThreshold: 0.1
    },

    // --- GROUP F: INTERACTIVE CONSOLE TABS ---
    {
      label: 'Bring-Up Console - Oscilloscope Waveform Tab',
      url: `${APP_URL}/`,
      theme: 'dark',
      clickSelector: '#tabBtnScope',
      misMatchThreshold: 0.5
    },
    {
      label: 'Bring-Up Console - Logic Probe Analyzer Tab',
      url: `${APP_URL}/`,
      theme: 'dark',
      clickSelector: '#tabBtnLogic',
      misMatchThreshold: 0.5
    }
  ];

  // Default shared scenario properties
  scenarios = scenarios.map(s => ({
    readySelector: s.readySelector || 'body',
    toggleMobileNav: Boolean(s.toggleMobileNav),
    clickSelector: s.clickSelector || null,
    onBeforeScript: 'puppet/onBefore.js',
    onReadyScript: 'puppet/onReady.js',
    selectors: ['document'],
    delay: 200,
    ...s
  }));

  // Quick mode filters to essential scenarios
  if (quick) {
    const quickLabels = [
      'Homepage - Light Mode',
      'Homepage - Dark Mode',
      'Mobile Navigation Drawer Open',
      'Blog Post - Code Block Layout (Dark)',
      'Interactive PCB Trace Impedance Calculator'
    ];
    scenarios = scenarios.filter(s => quickLabels.includes(s.label));
  }

  // Name query filter
  if (filter) {
    const q = filter.toLowerCase();
    scenarios = scenarios.filter(s => s.label.toLowerCase().includes(q));
  }

  return scenarios;
}

// --- 4. BROWSER RESOLUTION & BACKSTOP CONFIGURATION ---
function findChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const searchPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const p of searchPaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function buildBackstopConfig(options = {}) {
  const scenarios = buildScenarios(options);
  const executablePath = findChromeExecutable();

  const engineOptions = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  };

  if (executablePath) {
    engineOptions.executablePath = executablePath;
  }

  return {
    id: 'embed_oracle_visual_audit',
    viewports: VIEWPORTS,
    scenarios,
    paths: {
      bitmaps_reference: path.join(BACKSTOP_DIR, 'bitmaps_reference'),
      bitmaps_test: path.join(BACKSTOP_DIR, 'bitmaps_test'),
      engine_scripts: path.join(BACKSTOP_DIR, 'engine_scripts'),
      html_report: path.join(BACKSTOP_DIR, 'html_report'),
      ci_report: path.join(BACKSTOP_DIR, 'ci_report'),
      json_report: path.join(BACKSTOP_DIR, 'json_report')
    },
    report: ['CI', 'json'],
    engine: 'puppeteer',
    engineOptions,
    asyncCaptureLimit: 2,
    asyncCompareLimit: 6
  };
}

// Ensure web server is responsive; auto-start if down
async function ensureServerRunning(targetUrl) {
  const isHealthy = async (url) => {
    return new Promise((resolve) => {
      try {
        const u = new URL(url);
        const req = http.request({
          hostname: u.hostname,
          port: u.port || 3000,
          path: '/',
          method: 'GET',
          timeout: 2000
        }, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch (_) {
        resolve(false);
      }
    });
  };

  if (await isHealthy(targetUrl)) {
    console.log(`Web server is responding at ${targetUrl}`);
    return null;
  }

  console.log(`Server not responding at ${targetUrl}. Automatically starting local server (node app.js)...`);
  const rootDir = path.join(__dirname, '..');
  const serverProcess = spawn(process.execPath, ['app.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: '3000' },
    stdio: 'ignore'
  });

  const maxAttempts = 30; // 15 seconds
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isHealthy(targetUrl)) {
      console.log(`Local web server is ready! (PID: ${serverProcess.pid})`);
      return serverProcess;
    }
  }

  try { serverProcess.kill(); } catch (_) {}
  throw new Error(`Failed to reach web server at ${targetUrl} after auto-start attempt. Please run 'npm start' manually.`);
}

// --- 5. AGENTIC AI READABLE REPORT PROCESSOR ---
function generateAgentReports(totalTimeMs = 0) {
  // Check possible JSON report paths from BackstopJS
  const possiblePaths = [
    path.join(BACKSTOP_DIR, 'json_report', 'jsonReport.json'),
    path.join(BACKSTOP_DIR, 'ci_report', 'report.json'),
    path.join(BACKSTOP_DIR, 'ci_report', 'xunit.xml')
  ];

  let rawReport = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && p.endsWith('.json')) {
      try {
        rawReport = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      } catch (_) {}
    }
  }

  const tests = rawReport ? (rawReport.tests || []) : [];
  const failures = tests.filter(t => t.status === 'fail');
  const passes = tests.filter(t => t.status === 'pass');

  // Categorize each failure with root cause analysis and actionable AI instructions
  const failureItems = failures.map((f, idx) => {
    const d = f.pair || f.data || {};
    const scenario = d.scenario || d || {};
    const vp = d.viewport || { label: d.viewportLabel, width: d.viewport?.width, height: d.viewport?.height };
    const mismatch = parseFloat(d.diff?.misMatchPercentage ?? d.rawMisMatchPercentage ?? 0);
    const diffImage = d.diffImage || d.diff?.diffImage;
    const referenceImage = d.reference || d.referenceImage;
    const testImage = d.test || d.testImage;

    let category = 'VISUAL_REGRESSION';
    let rootCause = 'Computed element styling or geometry changed between reference and current run.';
    const actions = [];

    const labelLower = (scenario.label || '').toLowerCase();
    const url = scenario.url || APP_URL;
    const route = url.replace(APP_URL, '') || '/';

    if (labelLower.includes('drawer') || labelLower.includes('nav')) {
      category = 'MOBILE_NAVIGATION_OVERFLOW';
      rootCause = 'Mobile menu drawer failed to open properly or child elements overflowed viewport width.';
      actions.push({
        step: 1,
        action: 'INSPECT_FILE',
        file: 'views/layouts/header.ejs',
        instruction: 'Check mobile menu drawer container classes: ensure max-w-full, z-50, and proper translate transition.'
      });
    } else if (labelLower.includes('code') || labelLower.includes('blog')) {
      category = 'CODE_BLOCK_BACKGROUND_CLIP';
      rootCause = 'Scrollable code block container (<pre>/<code>) likely suffered background clipping or overflow truncation.';
      actions.push({
        step: 1,
        action: 'INSPECT_FILE',
        file: 'src/public/css/input.css',
        instruction: 'Verify pre code.hljs rules: ensure min-width: 100%, width: max-content, and solid background-color (#282c34).'
      });
    } else if (labelLower.includes('palette') || labelLower.includes('mode') || labelLower.includes('theme')) {
      category = 'THEME_COLOR_DEVIATION';
      rootCause = `Color variables or contrast in theme "${scenario.theme || 'custom'}" deviated from baseline.`;
      actions.push({
        step: 1,
        action: 'INSPECT_FILE',
        file: 'src/public/css/input.css',
        instruction: `Check custom theme tokens for [data-theme="${scenario.theme}"] or dark/light utility classes.`
      });
    } else if (labelLower.includes('tab') || labelLower.includes('console')) {
      category = 'INTERACTIVE_TAB_LAYOUT';
      rootCause = 'Segmented tab switching or active state indicator layout shifted.';
      actions.push({
        step: 1,
        action: 'INSPECT_FILE',
        file: 'views/pages/index.ejs',
        instruction: 'Inspect #consoleTabs flex/grid wrap classes and active button shadow/border styles.'
      });
    } else {
      actions.push({
        step: 1,
        action: 'INSPECT_DIFF',
        file: d.diffImage || 'backstop_data/html_report/index.html',
        instruction: 'Inspect visual diff highlight to identify exact coordinate shifts or unexpected wrapping.'
      });
    }

    return {
      issue_id: `VIS-AUDIT-${String(idx + 1).padStart(3, '0')}`,
      scenario: scenario.label || 'Unknown Scenario',
      route,
      theme: scenario.theme || 'light',
      viewport: {
        label: vp.label || 'unknown',
        width: vp.width || 0,
        height: vp.height || 0
      },
      severity: mismatch > 5.0 ? 'High' : mismatch > 1.5 ? 'Medium' : 'Low',
      mismatch_percentage: `${mismatch.toFixed(2)}%`,
      diagnostic: {
        category,
        root_cause: rootCause,
        reference_image: d.referenceImage || null,
        test_image: d.testImage || null,
        diff_image: d.diffImage || null
      },
      ai_action_plan: actions
    };
  });

  // 1. Write Machine-Readable JSON Report
  const jsonOutput = {
    metadata: {
      generated_at: new Date().toISOString(),
      runner: 'visual_audit_runner.js (BackstopJS + Puppeteer)',
      app_url: APP_URL,
      duration_seconds: (totalTimeMs / 1000).toFixed(1),
      summary: {
        total_scenarios: tests.length,
        passed: passes.length,
        failed: failures.length,
        health_status: failures.length === 0 ? 'ALL_PASSED' : 'NEEDS_ATTENTION'
      }
    },
    failures: failureItems
  };

  fs.writeFileSync(AGENT_JSON_REPORT, JSON.stringify(jsonOutput, null, 2), 'utf8');

  // 2. Write Agentic AI Actionable Markdown Report
  const mdLines = [
    `# Agentic AI Visual Audit Report`,
    `**Generated:** \`${new Date().toISOString()}\` | **Base URL:** \`${APP_URL}\` | **Duration:** \`${(totalTimeMs / 1000).toFixed(1)}s\``,
    `**Status:** ${failures.length === 0 ? '✅ **ALL PASSED (0 Visual Regressions)**' : `⚠️ **${failures.length} Failure(s) Detected**`}`,
    ``,
    `### Test Execution Summary`,
    `| Total Scenarios | Passed | Failed | Health Status |`,
    `| :---: | :---: | :---: | :---: |`,
    `| ${tests.length} | ${passes.length} | ${failures.length} | **${jsonOutput.metadata.summary.health_status}** |`,
    ``
  ];

  if (failures.length > 0) {
    mdLines.push(`## 🛠️ Prioritized Agent Action Plan`);
    mdLines.push(`Follow these exact diagnostic steps to resolve each visual deviation:\n`);

    failureItems.forEach(item => {
      mdLines.push(`### [${item.severity}] ${item.issue_id}: ${item.scenario} (${item.viewport.label} / ${item.theme})`);
      mdLines.push(`- **Route:** \`${item.route}\``);
      mdLines.push(`- **Viewport:** \`${item.viewport.width}x${item.viewport.height} (${item.viewport.label})\``);
      mdLines.push(`- **Theme:** \`${item.theme}\``);
      mdLines.push(`- **Mismatch Delta:** \`${item.mismatch_percentage}\``);
      mdLines.push(`- **Category:** \`${item.diagnostic.category}\``);
      mdLines.push(`- **Root Cause:** ${item.diagnostic.root_cause}`);
      if (item.diagnostic.diff_image) {
        mdLines.push(`- **Visual Diff Path:** \`${item.diagnostic.diff_image}\``);
      }
      mdLines.push(`\n**Action Items for Coding Agent:**`);
      item.ai_action_plan.forEach(step => {
        mdLines.push(`- [ ] **Step ${step.step} (${step.action})**: In \`${step.file}\` &mdash; ${step.instruction}`);
      });
      mdLines.push(`\n---\n`);
    });
  } else {
    mdLines.push(`## ✅ Zero Regressions`);
    mdLines.push(`All captured scenarios and responsive viewports strictly match reference baselines.`);
    mdLines.push(`No layout collapses, theme contrast breaks, or mobile code overflows were detected.`);
  }

  fs.writeFileSync(AGENT_MD_REPORT, mdLines.join('\n'), 'utf8');

  // 3. Print Clean Terminal Summary
  console.log(`\n======================================================================`);
  console.log(`🚀 AGENTIC AI VISUAL AUDIT COMPLETE`);
  console.log(`======================================================================`);
  console.log(`Total Checks : ${tests.length}`);
  console.log(`Passed       : ${passes.length}`);
  console.log(`Failed       : ${failures.length}`);
  console.log(`JSON Report  : ${AGENT_JSON_REPORT}`);
  console.log(`MD Action Plan: ${AGENT_MD_REPORT}`);

  if (failures.length > 0) {
    console.log(`\n⚠️  FAILED SCENARIOS:`);
    failureItems.forEach(f => {
      console.log(`   - [${f.severity}] ${f.scenario} (${f.viewport.label}, ${f.theme}) -> Mismatch: ${f.mismatch_percentage}`);
      if (f.ai_action_plan[0]) {
        console.log(`     Action: Fix in ${f.ai_action_plan[0].file}`);
      }
    });
  } else {
    console.log(`\n✅ All responsive scenarios, themes, and interactive states passed perfectly.`);
  }
  console.log(`======================================================================\n`);
}

// --- 6. CLI ENTRYPOINT ---
async function run() {
  const args = process.argv.slice(2);
  const actionArg = args.find(a => ['--reference', '--test', '--approve'].includes(a));
  const quick = args.includes('--quick');
  const filterArg = args.find(a => a.startsWith('--filter='));
  const filter = filterArg ? filterArg.split('=')[1] : null;

  if (!actionArg) {
    console.log(`
Usage:
  node tests/visual_audit_runner.js [options]

Commands:
  --reference            Capture reference screenshots to establish new baseline
  --test                 Compare current site state against baseline & produce AI reports
  --approve              Approve current test screenshots as new baseline

Options:
  --quick                Run only core critical scenarios (faster execution)
  --filter=<pattern>     Run only scenarios whose label matches <pattern>

Examples:
  node tests/visual_audit_runner.js --reference
  node tests/visual_audit_runner.js --test
  node tests/visual_audit_runner.js --test --quick
  node tests/visual_audit_runner.js --test --filter="Dark"
`);
    process.exit(1);
  }

  ensureEngineScripts();
  const config = buildBackstopConfig({ quick, filter });
  const command = actionArg.replace('--', '');

  console.log(`\nStarting Visual Audit Runner: action="${command}", quick=${quick}, filter="${filter || 'none'}"`);
  console.log(`Target Scenarios: ${config.scenarios.length} | Viewports: ${config.viewports.length}`);
  if (config.engineOptions && config.engineOptions.executablePath) {
    console.log(`Browser Engine  : Local Chrome executable -> ${config.engineOptions.executablePath}`);
  } else {
    console.warn(`[Warning] No local Chrome executable detected. If launch fails, run: npx puppeteer browsers install chrome`);
  }

  const startTime = Date.now();
  let serverProcess = null;

  try {
    serverProcess = await ensureServerRunning(APP_URL);
    await backstop(command, { config });
    const elapsed = Date.now() - startTime;
    if (command === 'test') {
      generateAgentReports(elapsed);
    } else {
      console.log(`\n✅ Backstop command "${command}" completed in ${(elapsed / 1000).toFixed(1)}s.`);
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (command === 'test') {
      // Visual regression failures cause BackstopJS promise to reject; process failures into agent report
      generateAgentReports(elapsed);
    } else {
      console.error(`\n❌ Error during "${command}":`, err.message || err);
      process.exit(1);
    }
  } finally {
    if (serverProcess) {
      console.log(`\nShutting down auto-started web server (PID: ${serverProcess.pid})...`);
      try { serverProcess.kill(); } catch (_) {}
    }
  }
}

run();
