(function () {
  'use strict';

  window.HeaderSearch = {
    init() {
      const trigger = document.getElementById('header-search-btn');
      const modal = document.getElementById('header-search-modal');
      const input = document.getElementById('headerSearchInput');
      const results = document.getElementById('headerSearchResults');
      const closeButton = document.getElementById('header-search-close');
      const status = document.getElementById('header-search-status');
      if (!trigger || !modal || !input || !results || !closeButton || !status) {
        console.error('[HeaderSearch] Missing required search controls');
        return;
      }
      let returnFocus;
      let items = [];
      let loadPromise = null;
      let loadError = null;

      function render() {
        const query = input.value.trim().toLowerCase();
        results.replaceChildren();

        if (!query) {
          const message = document.createElement('p');
          message.className = 'p-4 text-slate-600 dark:text-slate-300';
          message.textContent = loadError
            ? 'Search is temporarily unavailable. Try loading the index again.'
            : items.length
              ? 'Type a service, tool, project, or article to search the catalog.'
              : 'Loading the search catalog…';
          results.append(message);
          if (loadError) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'mx-4 mb-4 min-h-[40px] px-3 py-2 inline-flex items-center gap-2 rounded-lg bg-brand-500 text-white text-xs font-bold hover:bg-brand-600';
            retry.innerHTML = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.64 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.36-3"/></svg><span>Retry</span>';
            retry.addEventListener('click', () => {
              loadError = null;
              loadPromise = null;
              render();
              loadIndex();
            });
            results.append(retry);
          }
          status.textContent = loadError ? 'Search index unavailable.' : items.length ? 'Search is ready.' : 'Loading search index.';
          return;
        }

        if (!items.length && !loadError) {
          const message = document.createElement('p');
          message.className = 'p-4 text-slate-600 dark:text-slate-300';
          message.textContent = 'Loading the search catalog…';
          results.append(message);
          status.textContent = 'Loading search index.';
          return;
        }

        const matches = items.filter(item =>
          `${item.title} ${item.desc} ${item.type}`.toLowerCase().includes(query));
        for (const item of matches) {
          const link = document.createElement('a');
          link.href = item.url;
          link.className = 'block p-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';
          const type = document.createElement('span');
          type.className = 'inline-block text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-accent mb-1';
          type.textContent = item.type;
          const title = document.createElement('span');
          title.className = 'block font-bold text-slate-900 dark:text-white';
          title.textContent = item.title;
          const description = document.createElement('span');
          description.className = 'block text-sm text-slate-600 dark:text-slate-300';
          description.textContent = item.desc;
          link.append(type, title, description);
          results.append(link);
        }
        if (!matches.length) {
          const message = document.createElement('p');
          message.className = 'p-4 text-slate-600 dark:text-slate-300';
          message.textContent = loadError && !items.length
            ? 'Search is temporarily unavailable. Try again later.'
            : `No results found for "${input.value.trim()}". Try a different page or topic.`;
          results.append(message);
        }
        status.textContent = loadError
          ? `${matches.length} results. The full search catalog could not be loaded.`
          : `${matches.length} results`;
      }

      function loadIndex() {
        if (loadPromise) return loadPromise;

        loadPromise = fetch('/api/search-index')
          .then(response => {
            if (!response.ok) throw new Error(`Search index request failed with status ${response.status}.`);
            return response.json();
          })
          .then(payload => {
            if (!payload || !Array.isArray(payload.items)) {
              throw new Error('Search index response did not contain an items array.');
            }
            items = payload.items.filter(item =>
              item &&
              typeof item.title === 'string' &&
              typeof item.type === 'string' &&
              typeof item.desc === 'string' &&
              typeof item.url === 'string' &&
              item.url.startsWith('/') &&
              !item.url.startsWith('//'));
            if (!items.length) throw new Error('Search index contained no usable entries.');
            loadError = null;
          })
          .catch(error => {
            loadError = error;
            console.error('[HeaderSearch] Could not load the search index.', error);
          })
          .finally(render);

        return loadPromise;
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
        loadIndex();
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
