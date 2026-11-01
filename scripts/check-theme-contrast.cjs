/*
 * Validates every design-token pairing in src/data/colorThemes.js against WCAG AA.
 * Text pairs need 4.5:1, UI components / large text need 3:1.
 * Usage: node scripts/check-theme-contrast.cjs   (exit code 1 on failure)
 */
const themes = require('../src/data/colorThemes');

const hex = value => {
  let h = value.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const luminance = value => {
  const [r, g, b] = hex(value).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// [foreground token, background token, minimum ratio]
const RULES = [
  ['--text-primary', '--bg-primary', 4.5], ['--text-primary', '--bg-surface', 4.5],
  ['--text-muted', '--bg-primary', 4.5], ['--text-muted', '--bg-surface', 4.5],
  ['--readable-primary', '--bg-primary', 4.5], ['--readable-primary', '--bg-surface', 4.5],
  ['--secondary-color', '--bg-primary', 4.5], ['--secondary-color', '--bg-surface', 4.5],
  ['--on-primary', '--primary-color', 4.5], ['--on-primary', '--primary-hover', 4.5], ['--on-primary', '--primary-active', 4.5],
  ['--on-primary', '--action-color', 4.5],
  ['--border-strong', '--bg-primary', 3], ['--border-strong', '--bg-surface', 3],
  ['--focus-ring', '--bg-primary', 3], ['--focus-ring', '--bg-surface', 3],
  ...['--success-text', '--warning-text', '--danger-text', '--info-text', '--violet-text', '--cyan-text'].flatMap(token => [[token, '--bg-primary', 4.5], [token, '--bg-surface', 4.5]])
];

let failures = 0;
for (const theme of themes) {
  for (const mode of ['light', 'dark']) {
    const tokens = theme[mode];
    for (const [fg, bg, min] of RULES) {
      if (!tokens[fg] || !tokens[bg]) { failures++; console.log(`MISSING ${theme.key}/${mode}: ${!tokens[fg] ? fg : bg}`); continue; }
      const r = ratio(tokens[fg], tokens[bg]);
      if (r < min) { failures++; console.log(`FAIL ${theme.key}/${mode}: ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} = ${r.toFixed(2)} (< ${min})`); }
    }
  }
}
console.log(failures ? `${failures} token pairing(s) fail WCAG AA.` : `All ${themes.length * 2 * RULES.length} token pairings pass WCAG AA.`);
process.exitCode = failures ? 1 : 0;
