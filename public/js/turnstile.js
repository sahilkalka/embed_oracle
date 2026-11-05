(function() {
  'use strict';

  function renderWidgets() {
    if (!window.turnstile) return;

    document.querySelectorAll('[data-turnstile-widget]').forEach(container => {
      if (container.dataset.turnstileWidgetId) return;
      if (!container.getClientRects().length) return;

      const form = container.closest('form');
      const tokenField = form && form.querySelector('[name="turnstileToken"]');
      const sitekey = container.dataset.sitekey;
      if (!form || !tokenField || !sitekey) return;

      try {
        const widgetId = window.turnstile.render(container, {
          sitekey,
          theme: 'auto',
          size: 'flexible',
          'response-field': false,
          callback: token => { tokenField.value = token; },
          'expired-callback': () => { tokenField.value = ''; },
          'error-callback': () => { tokenField.value = ''; }
        });
        container.dataset.turnstileWidgetId = widgetId;
      } catch (error) {
        console.error('[TURNSTILE] Widget could not be rendered:', error.message);
      }
    });
  }

  window.onTurnstileLoad = renderWidgets;
  new MutationObserver(renderWidgets).observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class']
  });

  window.resetTurnstileForForm = function(form) {
    if (!form || !window.turnstile) return;

    const container = form.querySelector('[data-turnstile-widget-id]');
    const tokenField = form.querySelector('[name="turnstileToken"]');
    if (tokenField) tokenField.value = '';
    if (container) window.turnstile.reset(container.dataset.turnstileWidgetId);
  };
})();