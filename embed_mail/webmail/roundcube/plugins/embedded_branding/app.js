/**
 * Embedded India Mail — accessible password visibility toggles across webmail
 * (login page, change-password settings, and any framed dialogs).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function makeEyeIcon(showSlash) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ei-pass-icon');

    if (showSlash) {
      var p1 = document.createElementNS(SVG_NS, 'path');
      p1.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24');
      var line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '1');
      line.setAttribute('y1', '1');
      line.setAttribute('x2', '23');
      line.setAttribute('y2', '23');
      svg.appendChild(p1);
      svg.appendChild(line);
    } else {
      var p2 = document.createElementNS(SVG_NS, 'path');
      p2.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
      var circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '3');
      svg.appendChild(p2);
      svg.appendChild(circle);
    }
    return svg;
  }

  function syncButton(btn, input) {
    var visible = input.type === 'text';
    var label = visible ? 'Hide password' : 'Show password';
    btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = '';
    btn.appendChild(makeEyeIcon(visible));
  }

  function attachToggle(input) {
    if (!input || input.dataset.eiPassInit === '1') return;
    if (input.type !== 'password') return;

    // Wait for Elastic skin UI to transform #login-form table cells into .input-group first
    var parent = input.parentElement;
    if (input.closest('#login-form') && (!parent || !parent.classList.contains('input-group'))) {
      return;
    }

    input.dataset.eiPassInit = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'input-group-text ei-pass-toggle';
    syncButton(btn, input);

    btn.addEventListener('click', function () {
      var start = null;
      var end = null;
      try {
        start = input.selectionStart;
        end = input.selectionEnd;
      } catch (_) {}

      input.type = input.type === 'password' ? 'text' : 'password';
      syncButton(btn, input);

      try {
        input.focus({ preventScroll: true });
        if (typeof start === 'number' && typeof end === 'number') {
          input.setSelectionRange(start, end);
        }
      } catch (_) {}
    });

    var appendWrap = document.createElement('span');
    appendWrap.className = 'input-group-append';
    appendWrap.appendChild(btn);

    if (parent && parent.classList.contains('input-group')) {
      if (input.nextSibling) {
        parent.insertBefore(appendWrap, input.nextSibling);
      } else {
        parent.appendChild(appendWrap);
      }
      return;
    }

    if (parent) {
      var group = document.createElement('div');
      group.className = 'input-group ei-pass-wrap';
      parent.insertBefore(group, input);
      group.appendChild(input);
      group.appendChild(appendWrap);
    }
  }

  function scanPasswordFields() {
    var inputs = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i += 1) {
      attachToggle(inputs[i]);
    }
  }

  function isDarkActive() {
    if (document.documentElement.classList.contains('dark-mode')) return true;
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        return window.parent.document.documentElement.classList.contains('dark-mode');
      }
    } catch (_) {}
    return false;
  }

  function applyTinyMceDark(iframe, dark) {
    try {
      var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!doc || !doc.head) return;
      var styleId = 'ei-dark-editor-style';
      var existing = doc.getElementById(styleId);
      if (!dark) {
        if (existing) existing.remove();
        return;
      }
      var isOutlook = document.documentElement.classList.contains('ei-skin-outlook');
      var bg = isOutlook ? '#1f1f1f' : '#111b18';
      var fg = '#e8e6e3';
      var link = isOutlook ? '#7cc4fa' : '#34d399';
      var css =
        'html, body, body.mce-content-body {' +
        '  background-color: ' + bg + ' !important;' +
        '  color: ' + fg + ' !important;' +
        '  caret-color: #ffffff;' +
        '}' +
        'body.mce-content-body a { color: ' + link + ' !important; }' +
        'body.mce-content-body blockquote {' +
        '  border-left: 2px solid ' + link + ' !important;' +
        '  color: #cbd5e1 !important;' +
        '  padding-left: 8px;' +
        '}';
      if (!existing) {
        existing = doc.createElement('style');
        existing.id = styleId;
        existing.textContent = css;
        doc.head.appendChild(existing);
      } else if (existing.textContent !== css) {
        existing.textContent = css;
      }
    } catch (_) {}
  }

  function parseRgb(str) {
    if (!str) return null;
    var m = str.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      a: m[4] === undefined ? 1 : parseFloat(m[4])
    };
  }

  function relLum(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function isNeutralColor(c) {
    var mx = Math.max(c.r, c.g, c.b);
    var mn = Math.min(c.r, c.g, c.b);
    return (mx - mn) < 28;
  }

  function adaptHtmlMessageParts(dark) {
    var parts = document.querySelectorAll('.message-htmlpart');
    for (var i = 0; i < parts.length; i += 1) {
      var nodes = parts[i].querySelectorAll('*');
      for (var j = 0; j < nodes.length; j += 1) {
        var el = nodes[j];
        if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'VIDEO') continue;
        if (dark) {
          if (!el.hasAttribute('data-ei-orig-color')) {
            el.setAttribute('data-ei-orig-color', el.style.color || '');
            el.setAttribute('data-ei-orig-bg', el.style.backgroundColor || '');
          }
          var cs = window.getComputedStyle(el);
          var bg = parseRgb(cs.backgroundColor);
          if (bg && bg.a > 0.15 && relLum(bg) > 0.72 && isNeutralColor(bg)) {
            el.style.setProperty('background-color', '#1f1f1f', 'important');
          }
          var fg = parseRgb(cs.color);
          if (fg && fg.a > 0.15 && relLum(fg) < 0.35) {
            if (el.tagName === 'A') {
              el.style.setProperty('color', '#7cc4fa', 'important');
            } else {
              el.style.setProperty('color', '#e8e6e3', 'important');
            }
          }
        } else if (el.hasAttribute('data-ei-orig-color')) {
          var origC = el.getAttribute('data-ei-orig-color');
          var origB = el.getAttribute('data-ei-orig-bg');
          if (origC) el.style.color = origC;
          else el.style.removeProperty('color');
          if (origB) el.style.backgroundColor = origB;
          else el.style.removeProperty('background-color');
          el.removeAttribute('data-ei-orig-color');
          el.removeAttribute('data-ei-orig-bg');
        }
      }
    }
  }

  function syncDarkBodies() {
    var dark = isDarkActive();
    var editors = document.querySelectorAll('#composebody_ifr, iframe.tox-edit-area__iframe');
    for (var i = 0; i < editors.length; i += 1) {
      var ifr = editors[i];
      if (!ifr.dataset.eiDarkHooked) {
        ifr.dataset.eiDarkHooked = '1';
        ifr.addEventListener('load', function () {
          applyTinyMceDark(this, isDarkActive());
        });
      }
      applyTinyMceDark(ifr, dark);
    }
    adaptHtmlMessageParts(dark);
  }

  function init() {
    scanPasswordFields();
    syncDarkBodies();
    setTimeout(function () {
      scanPasswordFields();
      syncDarkBodies();
    }, 0);
    setTimeout(syncDarkBodies, 250);

    if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
      window.rcmail.addEventListener('init', function () {
        setTimeout(function () {
          scanPasswordFields();
          syncDarkBodies();
        }, 0);
      });
    }

    if (typeof MutationObserver === 'function' && document.documentElement) {
      var htmlObs = new MutationObserver(function () {
        syncDarkBodies();
      });
      htmlObs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    if (typeof MutationObserver === 'function' && document.body) {
      var observer = new MutationObserver(function () {
        scanPasswordFields();
        syncDarkBodies();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
