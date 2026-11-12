/**
 * Embedded India Mail — Outlook Web (Fluent UI) skin enhancements.
 * Loaded only when active webmail skin === 'outlook'.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c) node.appendChild(c);
      });
    }
    return node;
  }

  function svgIcon(paths, size) {
    var s = size || 18;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (p) {
      var node = document.createElementNS(SVG_NS, p.tag || 'path');
      Object.keys(p).forEach(function (k) {
        if (k !== 'tag') node.setAttribute(k, p[k]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  function makeWaffleSvg() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    [5, 12, 19].forEach(function (cy) {
      [5, 12, 19].forEach(function (cx) {
        var c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', String(cx));
        c.setAttribute('cy', String(cy));
        c.setAttribute('r', '2.1');
        svg.appendChild(c);
      });
    });
    return svg;
  }

  function syncThemeIcon(btn) {
    var isDark = document.documentElement.classList.contains('dark-mode');
    btn.innerHTML = '';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.appendChild(svgIcon(isDark ? [
      { tag: 'circle', cx: '12', cy: '12', r: '4' },
      { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }
    ] : [
      { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }
    ], 18));
  }

  function toggleThemeMode(btn) {
    var nativeToggle = document.querySelector('#layout-menu a.theme-toggle, a.button.dark-mode, [data-action="dark-mode"]');
    if (nativeToggle) {
      nativeToggle.click();
    } else {
      var html = document.documentElement;
      var nextDark = !html.classList.contains('dark-mode');
      html.classList.toggle('dark-mode', nextDark);
      try {
        document.cookie = 'colorMode=' + (nextDark ? 'dark' : 'light') + '; path=/; max-age=31536000; SameSite=Lax';
      } catch (_) {}
    }
    setTimeout(function () { syncThemeIcon(btn); }, 40);
  }

  function mountTopbar() {
    if (!document.body || document.body.classList.contains('task-login')) return;
    if (!document.getElementById('layout')) return;
    if (document.getElementById('ei-outlook-topbar')) return;

    var waffleBtn = el('button', {
      type: 'button',
      id: 'ei-ol-waffle-btn',
      className: 'ei-ol-icon-btn',
      'aria-label': 'App launcher',
      'aria-expanded': 'false',
      title: 'App launcher'
    }, [makeWaffleSvg()]);

    var brandLink = el('a', {
      href: '?_task=mail',
      className: 'ei-ol-brand',
      title: 'Embedded India Mail'
    }, [
      el('img', { src: 'plugins/embedded_branding/assets/outlook-logo.svg', alt: '' }),
      el('span', { className: 'ei-ol-brand-title', textContent: 'Embedded India Mail' }),
      el('span', { className: 'ei-ol-pill-badge', textContent: 'Outlook' })
    ]);

    var themeBtn = el('button', {
      type: 'button',
      id: 'ei-ol-theme-btn',
      className: 'ei-ol-icon-btn'
    });
    syncThemeIcon(themeBtn);
    themeBtn.addEventListener('click', function () { toggleThemeMode(themeBtn); });
    if (window.MutationObserver) {
      new MutationObserver(function () { syncThemeIcon(themeBtn); }).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['class'] }
      );
    }

    var settingsLink = el('a', {
      href: '?_task=settings',
      className: 'ei-ol-icon-btn',
      'aria-label': 'Mail settings',
      title: 'Mail settings'
    }, [svgIcon([
      { tag: 'circle', cx: '12', cy: '12', r: '3' },
      { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
    ], 18)]);

    var topbar = el('header', { id: 'ei-outlook-topbar', role: 'banner' }, [
      el('div', { className: 'ei-ol-left' }, [waffleBtn, brandLink]),
      el('div', { className: 'ei-ol-right' }, [themeBtn, settingsLink])
    ]);

    var menu = el('div', { id: 'ei-ol-waffle-menu', role: 'menu', 'aria-label': 'Apps' }, [
      el('div', { className: 'ei-ol-waffle-hdr', textContent: 'Embedded India Apps' }),
      el('div', { className: 'ei-ol-waffle-grid' }, [
        el('a', { href: '?_task=mail', className: 'ei-ol-waffle-item', role: 'menuitem' }, [
          el('span', { className: 'ei-ol-waffle-dot' }, [svgIcon([{ tag: 'rect', x: '3', y: '5', width: '18', height: '14', rx: '2' }, { d: 'M3 7l9 6 9-6' }], 16)]),
          el('span', { textContent: 'Mail' })
        ]),
        el('a', { href: '?_task=addressbook', className: 'ei-ol-waffle-item', role: 'menuitem' }, [
          el('span', { className: 'ei-ol-waffle-dot' }, [svgIcon([{ d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }, { tag: 'circle', cx: '9', cy: '7', r: '4' }], 16)]),
          el('span', { textContent: 'Contacts' })
        ]),
        el('a', { href: '?_task=settings', className: 'ei-ol-waffle-item', role: 'menuitem' }, [
          el('span', { className: 'ei-ol-waffle-dot' }, [svgIcon([{ tag: 'circle', cx: '12', cy: '12', r: '3' }, { d: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' }], 16)]),
          el('span', { textContent: 'Settings' })
        ]),
        el('a', { href: 'https://embeddedindia.in/', target: '_blank', rel: 'noopener', className: 'ei-ol-waffle-item', role: 'menuitem' }, [
          el('span', { className: 'ei-ol-waffle-dot' }, [svgIcon([{ d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }, { d: 'M15 3h6v6M10 14L21 3' }], 16)]),
          el('span', { textContent: 'Website' })
        ])
      ])
    ]);

    waffleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      waffleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (menu.classList.contains('open') && !menu.contains(e.target) && e.target !== waffleBtn) {
        menu.classList.remove('open');
        waffleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        waffleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.body.insertBefore(topbar, document.body.firstChild);
    document.body.appendChild(menu);
    document.body.classList.add('ei-has-topbar');
  }

  function enhanceLogin() {
    if (!document.body || !document.body.classList.contains('task-login')) return;
    var form = document.getElementById('login-form');
    if (!form || document.getElementById('ei-ol-login-hdr')) return;
    var hdr = el('div', { id: 'ei-ol-login-hdr' }, [
      el('h1', { textContent: 'Sign in' }),
      el('p', { textContent: 'to continue to Embedded India Mail' })
    ]);
    form.insertBefore(hdr, form.firstChild);
  }

  function init() {
    mountTopbar();
    enhanceLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
