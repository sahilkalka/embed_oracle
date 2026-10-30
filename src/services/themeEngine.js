// Fixed appearance presets. Palette editing is no longer part of Settings.
const colorThemes = require('../data/colorThemes');
const PREDEFINED_PALETTES = Object.fromEntries(colorThemes.map(preset => [preset.key, {
  id: preset.key, name: preset.name, bgPrimary: preset.background, bgSurface: preset.surface,
  textPrimary: '#f1f5f9', textMuted: '#94a3b8', accentPrimary: preset.accent,
  accentSecondary: preset.secondary, borderColor: '#334155', swatchHex: preset.accent
}]));
const PALETTE_ALIASES = { emerald:'cyber-emerald', ocean:'vscode-theme', violet:'quantum-cyan', amber:'solar-amber', rose:'titanium-slate', cyan:'quantum-cyan', slate:'titanium-slate', 'clean-light':'vscode-theme' };

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
  const preset = themes[0];
  const activeKey = preset.key;
  const palette = { id: activeKey, name: preset.name, bgPrimary: preset.background, bgSurface: preset.surface, textPrimary: '#f1f5f9', textMuted: '#94a3b8', accentPrimary: preset.accent, accentSecondary: preset.secondary, borderColor: '#334155', swatchHex: preset.accent };

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
    :root {
      --bg-primary: ${palette.bgPrimary};
      --bg-dark: ${palette.bgPrimary};
      --bg-surface: ${palette.bgSurface};
      --surface-color: ${palette.bgSurface};
      --text-primary: ${palette.textPrimary};
      --text-muted: ${palette.textMuted};
      --accent-primary: ${palette.accentPrimary};
      --primary-color: ${palette.accentPrimary};
      --accent-secondary: ${palette.accentSecondary};
      --secondary-color: ${palette.accentSecondary};
      --border-color: ${palette.borderColor};
      --font-heading: '${headingFont}', system-ui, sans-serif;
      --font-body: '${bodyFont}', system-ui, sans-serif;
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
  resolveTheme
};
