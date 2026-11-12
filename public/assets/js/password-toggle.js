/**
 * Shared accessible password visibility toggle for Embedded India Admin views.
 * Binds declaratively via [data-password-toggle="<inputId>"].
 */
(function () {
  'use strict';

  function syncButtonState(btn, input) {
    if (!btn || !input) return;
    var isVisible = input.type === 'text';
    var showIcon = btn.querySelector('[data-password-icon="show"]');
    var hideIcon = btn.querySelector('[data-password-icon="hide"]');
    var labelEl = btn.querySelector('[data-password-label]');
    var text = isVisible ? 'Hide password' : 'Show password';

    btn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    if (labelEl) labelEl.textContent = text;
    if (showIcon) showIcon.classList.toggle('hidden', isVisible);
    if (hideIcon) hideIcon.classList.toggle('hidden', !isVisible);
  }

  function syncAll() {
    var buttons = document.querySelectorAll('[data-password-toggle]');
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      var targetId = btn.getAttribute('data-password-toggle');
      var input = targetId ? document.getElementById(targetId) : null;
      if (input) syncButtonState(btn, input);
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-password-toggle]') : null;
    if (!btn) return;
    var targetId = btn.getAttribute('data-password-toggle');
    var input = targetId ? document.getElementById(targetId) : null;
    if (!input) return;

    var start = null;
    var end = null;
    try {
      start = input.selectionStart;
      end = input.selectionEnd;
    } catch (_) {
      // Ignore selection error on unsupported input states
    }

    input.type = input.type === 'password' ? 'text' : 'password';
    syncButtonState(btn, input);

    try {
      input.focus({ preventScroll: true });
      if (typeof start === 'number' && typeof end === 'number') {
        input.setSelectionRange(start, end);
      }
    } catch (_) {
      // Ignore focus/selection restoration failure
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAll);
  } else {
    syncAll();
  }
})();
