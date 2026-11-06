(() => {
  'use strict';
  const data = document.getElementById('appearance-presets');
  if (!data) return;
  const presets = JSON.parse(data.textContent);
  const aliases = { emerald:'cyber-emerald', ocean:'vscode-theme', violet:'quantum-cyan', amber:'solar-amber', rose:'titanium-slate', cyan:'quantum-cyan', slate:'titanium-slate', 'clean-light':'vscode-theme' };
  const root = document.documentElement;
  const stored = localStorage.getItem('color-palette');
  const isPreset = key => presets.some(p => p.key === key);
  let active = aliases[stored] || stored;
  if (!isPreset(active)) active = isPreset(root.dataset.palette) ? root.dataset.palette : presets[0].key;
  function apply() {
    const preset = presets.find(p => p.key === active);
    const dark = root.classList.contains('dark');
    // Colors come from the server-generated token stylesheet keyed by data-palette + .dark.
    root.dataset.palette = active;
    document.querySelectorAll('.appearance-trigger').forEach(button => {
      button.title = preset.name + ' \u00b7 ' + (dark ? 'Night mode' : 'Light mode');
      button.setAttribute('aria-description', button.title);
      button.querySelector('.appearance-mode-sun').toggleAttribute('hidden', dark);
      button.querySelector('.appearance-mode-moon').toggleAttribute('hidden', !dark);
    });
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
    const opensAbove = Boolean(control.closest('.admin-settings-mobile-bottom'));
    panel.style.maxHeight = Math.max(100, opensAbove ? rect.top - 20 : innerHeight - rect.bottom - 20) + 'px';
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
    control.querySelectorAll('.appearance-palette').forEach(button => button.addEventListener('click', () => { active = button.dataset.scheme; localStorage.setItem('color-palette', active); apply(); }));
  }
  document.addEventListener('click', event => controls.forEach(control => { if (!control.contains(event.target) && control.querySelector('.appearance-trigger').getAttribute('aria-expanded') === 'true') setOpen(control, false); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') controls.forEach(control => { if (control.querySelector('.appearance-trigger').getAttribute('aria-expanded') === 'true') setOpen(control, false, true); }); });
  window.addEventListener('resize', () => controls.forEach(position));
  apply();
})();
