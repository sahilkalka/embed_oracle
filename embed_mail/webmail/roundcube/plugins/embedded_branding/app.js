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

  function init() {
    scanPasswordFields();
    setTimeout(scanPasswordFields, 0);

    if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
      window.rcmail.addEventListener('init', function () {
        setTimeout(scanPasswordFields, 0);
      });
    }

    if (typeof MutationObserver === 'function' && document.body) {
      var observer = new MutationObserver(function () {
        scanPasswordFields();
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
