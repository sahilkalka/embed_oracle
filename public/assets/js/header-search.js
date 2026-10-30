(function () {
  'use strict';

  window.HeaderSearch = {
    init(items) {
      const trigger = document.getElementById('header-search-btn');
      const modal = document.getElementById('header-search-modal');
      const input = document.getElementById('headerSearchInput');
      const results = document.getElementById('headerSearchResults');
      const closeButton = document.getElementById('header-search-close');
      if (!trigger || !modal || !input || !results || !closeButton) {
        console.error('[HeaderSearch] Missing required search controls');
        return;
      }
      let returnFocus;

      function render() {
        const query = input.value.trim().toLowerCase();
        const matches = items.filter(item =>
          `${item.title} ${item.desc} ${item.type}`.toLowerCase().includes(query));
        results.replaceChildren();
        for (const item of matches) {
          const link = document.createElement('a');
          link.href = item.url;
          link.className = 'block p-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800';
          const title = document.createElement('span');
          title.className = 'block font-bold text-slate-900 dark:text-white';
          title.textContent = item.title;
          const description = document.createElement('span');
          description.className = 'block text-sm text-slate-600 dark:text-slate-300';
          description.textContent = item.desc;
          link.append(title, description);
          results.append(link);
        }
        if (!matches.length) {
          const message = document.createElement('p');
          message.className = 'p-4 text-slate-600 dark:text-slate-300';
          message.textContent = `No results found for "${input.value.trim()}". Try a different page or topic.`;
          results.append(message);
        }
        document.getElementById('header-search-status').textContent =
          `${matches.length} results`;
      }

      function getRestoreTarget() {
        if (returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus !== document.body) {
          return returnFocus;
        }
        return trigger;
      }

      function restoreFocus() {
        const target = getRestoreTarget();
        if (target && typeof target.focus === 'function') {
          target.focus();
        }
      }

      function open() {
        returnFocus = (document.activeElement && document.activeElement !== document.body)
          ? document.activeElement
          : trigger;
        modal.showModal();
        trigger.setAttribute('aria-expanded', 'true');
        render();
        input.focus();
      }

      modal.addEventListener('close', () => {
        trigger.setAttribute('aria-expanded', 'false');
        input.value = '';
        restoreFocus();
      });
      modal.addEventListener('cancel', () => {
        restoreFocus();
      });
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          const box = modal.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right ||
              event.clientY < box.top || event.clientY > box.bottom) modal.close();
        }
      });
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', modal.id);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', () => {
        trigger.focus();
        open();
      });
      closeButton.addEventListener('click', () => modal.close());
      input.addEventListener('input', render);
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          modal.close();
        }
      });
      results.addEventListener('click', event => {
        if (event.target.closest('a')) modal.close();
      });
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          if (!modal.open) open();
          else input.focus();
        }
      });
    }
  };
})();
