// Fixed appearance presets. Palette editing is no longer part of Settings.
const colorThemes = require('../data/colorThemes');
const PREDEFINED_PALETTES = Object.fromEntries(colorThemes.map(preset => [preset.key, {
  id: preset.key, name: preset.name, bgPrimary: preset.background, bgSurface: preset.surface,
  textPrimary: (preset.dark && preset.dark['--text-primary']) || '#f1f5f9',
  textMuted: (preset.dark && preset.dark['--text-muted']) || '#94a3b8',
  accentPrimary: preset.accent,
  accentSecondary: preset.secondary,
  borderColor: (preset.dark && preset.dark['--border-color']) || '#1e3831',
  swatchHex: preset.accent
}]));
const PALETTE_ALIASES = { emerald:'cyber-emerald', ocean:'vscode-theme', violet:'quantum-cyan', amber:'solar-amber', rose:'titanium-slate', cyan:'quantum-cyan', slate:'titanium-slate', 'clean-light':'vscode-theme' };
const FONT_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK = "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

// Universal design tokens shared by the public site and the admin dashboard.
function paletteTokens(preset, mode) {
  const t = preset[mode];
  const dark = mode === 'dark';
  const mix = (pct, base) => `color-mix(in srgb, ${t['--primary-color']} ${pct}%, ${base})`;
  return {
    ...t,
    '--accent-primary': t['--primary-color'],
    '--accent-secondary': t['--secondary-color'],
    '--surface-color': t['--bg-surface'],
    '--bg-dark': preset.background,
    '--glow-accent': `color-mix(in srgb, ${t['--secondary-color']} 20%, transparent)`,
    '--brand-50': dark ? mix(14, 'transparent') : mix(10, '#ffffff'),
    '--brand-100': dark ? mix(22, 'transparent') : mix(18, '#ffffff'),
    '--brand-200': dark ? mix(32, 'transparent') : mix(28, '#ffffff'),
    '--brand-300': dark ? mix(48, 'transparent') : mix(45, '#ffffff'),
    '--brand-400': dark ? mix(68, 'transparent') : mix(65, '#ffffff'),
    '--brand-800': dark ? preset.surface : mix(75, '#0f172a'),
    '--brand-900': dark ? preset.background : mix(45, '#0f172a')
  };
}

const declarations = tokens => Object.entries(tokens).map(([key, value]) => `${key}: ${value};`).join(' ');

function buildPaletteCss(activeKey) {
  const active = colorThemes.find(preset => preset.key === activeKey) || colorThemes[0];
  const rules = [
    `:root { color-scheme: light; ${declarations(paletteTokens(active, 'light'))} }`,
    `:root.dark { color-scheme: dark; ${declarations(paletteTokens(active, 'dark'))} }`
  ];
  for (const preset of colorThemes) {
    rules.push(`:root[data-palette="${preset.key}"] { ${declarations(paletteTokens(preset, 'light'))} }`);
    rules.push(`:root.dark[data-palette="${preset.key}"] { ${declarations(paletteTokens(preset, 'dark'))} }`);
  }
  return rules.join('\n');
}

function getAvailablePaletteKey(settings = {}, preferredKey = 'cyber-emerald', excludedKey = null) {
  const preferred = PALETTE_ALIASES[preferredKey] || preferredKey;
  const isAvailable = key =>
    key !== excludedKey &&
    Object.prototype.hasOwnProperty.call(PREDEFINED_PALETTES, key) &&
    settings[`palette_deleted_${key}`] !== 'true';

  if (isAvailable(preferred)) return preferred;
  return Object.keys(PREDEFINED_PALETTES).find(isAvailable) || null;
}

function resolveTheme(settings = {}) {
  const themes = require('../data/colorThemes');
  const activeKey = getAvailablePaletteKey(settings, settings.active_theme_palette || 'cyber-emerald') || themes[0].key;
  const preset = themes.find(t => t.key === activeKey) || themes[0];
  const palette = {
    id: preset.key,
    name: preset.name,
    bgPrimary: preset.background,
    bgSurface: preset.surface,
    textPrimary: (preset.dark && preset.dark['--text-primary']) || '#f1f5f9',
    textMuted: (preset.dark && preset.dark['--text-muted']) || '#94a3b8',
    accentPrimary: preset.accent,
    accentSecondary: preset.secondary,
    borderColor: (preset.dark && preset.dark['--border-color']) || '#1e3831',
    swatchHex: preset.accent
  };

  const headingFont = settings.heading_font || 'Inter';
  const bodyFont = settings.body_font || 'Inter';
  const baseFontSize = settings.base_font_size || '16px';
  const borderRadiusScale = settings.border_radius_scale || '1rem';
  const containerMaxWidth = settings.container_max_width || '80rem';
  const cardShadowIntensity = settings.card_shadow_intensity || 'medium';
  const glassmorphism = settings.enable_glassmorphism !== 'false';
  const bounceIntensity = settings.theme_bounce_intensity || 'bouncy';

  let shadowValue = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
  if (cardShadowIntensity === 'none') shadowValue = 'none';
  if (cardShadowIntensity === 'subtle') shadowValue = '0 1px 3px 0 rgba(0, 0, 0, 0.08)';
  if (cardShadowIntensity === 'high') shadowValue = '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)';

  let springCurve = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  if (bounceIntensity === 'subtle') springCurve = 'cubic-bezier(0.25, 1, 0.5, 1)';
  if (bounceIntensity === 'none') springCurve = 'ease';

  const cssString = `
    ${buildPaletteCss(activeKey)}
    :root {
      --font-heading: '${headingFont}', ${FONT_FALLBACK};
      --font-body: '${bodyFont}', ${FONT_FALLBACK};
      --font-mono: ${MONO_STACK};
      --base-font-size: ${baseFontSize};
      --border-radius-scale: ${borderRadiusScale};
      --container-max-width: ${containerMaxWidth};
      --header-opacity: ${Number(settings.header_opacity || settings.header_transparency) > 1 ? (Number(settings.header_opacity || settings.header_transparency)/100).toFixed(2) : (settings.header_opacity || settings.header_transparency || '0.95')};
      --card-shadow: ${shadowValue};
      --spring-curve: ${springCurve};
      --glass-backdrop: ${glassmorphism ? 'blur(12px)' : 'none'};
      --glass-bg: ${glassmorphism ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-surface)'};
    }
  `;

  return {
    palette,
    paletteKey: activeKey,
    paletteAliases: PALETTE_ALIASES,
    predefinedPalettes: PREDEFINED_PALETTES,
    cssString,
    headingFont,
    bodyFont,
    baseFontSize,
    borderRadiusScale,
    containerMaxWidth,
    cardShadowIntensity,
    glassmorphism,
    bounceIntensity,
    springCurve
  };
}

module.exports = {
  PREDEFINED_PALETTES,
  PALETTE_ALIASES,
  getAvailablePaletteKey,
  buildPaletteCss,
  resolveTheme
};
