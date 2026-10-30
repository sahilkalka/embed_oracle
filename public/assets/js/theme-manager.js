(() => {
  'use strict';
  const data = document.getElementById('appearance-presets');
  if (!data) return;
  const presets = JSON.parse(data.textContent);
  const aliases = { emerald:'cyber-emerald', ocean:'vscode-theme', violet:'quantum-cyan', amber:'solar-amber', rose:'titanium-slate', cyan:'quantum-cyan', slate:'titanium-slate', 'clean-light':'vscode-theme' };
  let active = aliases[localStorage.getItem('color-palette')] || localStorage.getItem('color-palette') || 'cyber-emerald';
  if (!presets.some(p => p.key === active)) active = 'cyber-emerald';
  function apply() {
    const preset = presets.find(p => p.key === active);
    const dark = document.documentElement.classList.contains('dark');
    const variant = dark ? preset.dark : preset.light;
    const accent = variant['--primary-color'];
    const vars = {
      '--primary-color': accent, '--primary-hover': preset.accent, '--primary-active': preset.accent, '--accent-primary': accent,
      '--secondary-color': preset.secondary, '--accent-secondary': preset.secondary, '--accent-light': preset.bright, '--accent-dark': preset.accent,
      '--bg-primary': dark ? preset.background : '#ffffff', '--bg-dark': preset.background,
      '--bg-surface': dark ? preset.surface : '#f8fafc', '--surface-color': dark ? preset.surface : '#f8fafc',
      '--text-primary': dark ? '#f1f5f9' : '#0f172a', '--text-muted': dark ? '#cbd5e1' : '#475569', '--border-color': dark ? '#334155' : '#e2e8f0',
      '--action-color': preset.accent, '--readable-primary': dark ? preset.bright : preset.accent,
      '--glow-color': accent + '44'
    };
    Object.assign(vars, variant, {
      '--accent-primary': accent, '--accent-secondary': variant['--secondary-color'],
      '--bg-dark': preset.background, '--surface-color': variant['--bg-surface'],
      '--action-color': variant['--primary-active'] || accent,
      '--readable-primary': dark ? variant['--accent-light'] : variant['--primary-active']
    });
    document.querySelectorAll('.appearance-trigger').forEach(button => {
      button.style.setProperty('--appearance-accent', accent);
      button.title = preset.name + ' · ' + (dark ? 'Night mode' : 'Light mode');
      button.setAttribute('aria-description', button.title);
      button.querySelector('.appearance-mode-sun').toggleAttribute('hidden', dark);
      button.querySelector('.appearance-mode-moon').toggleAttribute('hidden', !dark);
    });
    for (const [key, value] of Object.entries(vars)) document.documentElement.style.setProperty(key, value);
    document.documentElement.dataset.palette = active;
    localStorage.setItem('color-palette', active);
    document.querySelectorAll('.appearance-palette').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scheme === active)));
    document.querySelectorAll('.appearance-mode input').forEach(input => { input.checked = dark; });
    window.dispatchEvent(new CustomEvent('appearancechange', { detail: { palette: active, dark } }));
  }
  const controls = Array.from(document.querySelectorAll('.appearance-control'));
  function position(control) {
    const panel = control.querySelector('.appearance-panel');
    const rect = control.getBoundingClientRect();
    const width = Math.min(264, innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.maxHeight = Math.max(100, innerHeight - rect.bottom - 20) + 'px';
    panel.style.left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) - rect.left + 'px';
  }
  function setOpen(control, open, restoreFocus = false) {
    const panel = control.querySelector('.appearance-panel');
    const trigger = control.querySelector('.appearance-trigger');
    const wasHidden = panel.hidden;
    const style = getComputedStyle(panel);
    const from = { opacity: wasHidden ? 0 : style.opacity, transform: wasHidden ? 'translateY(-10px) scale(0.98)' : style.transform };
    panel.getAnimations().forEach(animation => animation.cancel());
    trigger.setAttribute('aria-expanded', String(open));
    panel.hidden = false; panel.inert = !open;
    position(control);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = panel.animate([from, { opacity: open ? 1 : 0, transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)' }], { duration: reduced ? 1 : open ? 260 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    animation.onfinish = () => { if (!open) panel.hidden = true; };
    if (restoreFocus) trigger.focus();
  }
  for (const control of controls) {
    const trigger = control.querySelector('.appearance-trigger');
    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      controls.filter(other => other !== control).forEach(other => setOpen(other, false));
      setOpen(control, open);
    });
    control.querySelector('.appearance-mode input').addEventListener('change', event => {
      document.documentElement.classList.toggle('dark', event.target.checked);
      localStorage.setItem('color-theme', event.target.checked ? 'dark' : 'light'); apply();
    });
    control.querySelectorAll('.appearance-palette').forEach(button => button.addEventListener('click', () => { active = button.dataset.scheme; apply(); }));
  }
  document.addEventListener('click', event => controls.forEach(control => { if (!control.contains(event.target) && control.querySelector('.appearance-trigger').getAttribute('aria-expanded') === 'true') setOpen(control, false); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') controls.forEach(control => { if (control.querySelector('.appearance-trigger').getAttribute('aria-expanded') === 'true') setOpen(control, false, true); }); });
  window.addEventListener('resize', () => controls.forEach(position));
  apply();
})();
