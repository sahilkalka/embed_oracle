(() => {
  const field = document.getElementById('custom_faqs'), rows = document.getElementById('faqEditorRows');
  if (!field || !rows) return;
  const status = document.getElementById('faqEditorStatus');
  const form = field.closest('form');
  function parseItems(value) {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('[FAQ MANAGER] Could not parse saved FAQ entries.', error);
      return [];
    }
  }
  let items = parseItems(field.value);
  const sync = () => { field.value = JSON.stringify(items); };
  function render() {
    rows.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bg-white dark:bg-brand-surface rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-brand-border shadow-sm text-center';
      empty.innerHTML = '<span class="mx-auto w-10 h-10 rounded-xl bg-brand-500/10 dark:bg-accent/15 text-brand-600 dark:text-accent flex items-center justify-center"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 014.8.8c0 1.7-2.4 2.1-2.4 3.7m0 3h.01"/></svg></span><p class="mt-3 text-xs font-bold text-slate-900 dark:text-white">No additional FAQs yet</p><p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Add a question and answer to extend the homepage FAQ section.</p>';
      rows.append(empty);
      if (status) status.textContent = 'No additional FAQ entries yet.';
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'faq-editor-card bg-white dark:bg-brand-surface rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-brand-border shadow-sm space-y-4';
      const header = document.createElement('div');
      header.className = 'flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-brand-border';
      const indicator = document.createElement('span');
      indicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0';
      indicator.setAttribute('aria-hidden', 'true');
      const title = document.createElement('h4');
      title.className = 'text-xs font-bold text-slate-900 dark:text-white';
      title.textContent = 'FAQ entry ' + String(index + 1).padStart(2, '0');
      header.append(indicator, title);
      card.append(header);

      for (const [key, label, max] of [['question', 'Question', 300], ['answer', 'Answer', 5000]]) {
        const wrapper = document.createElement('label'); wrapper.className = 'block text-xs font-semibold text-slate-800 dark:text-slate-200'; wrapper.textContent = label;
        const input = document.createElement(key === 'answer' ? 'textarea' : 'input'); input.value = item[key] || ''; input.required = true; input.maxLength = max; input.className = 'block w-full mt-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-brand-dark border border-slate-300 dark:border-slate-700 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-brand-500';
        if (key === 'answer') input.rows = 4;
        input.addEventListener('input', () => { item[key] = input.value; sync(); }); wrapper.append(input); card.append(wrapper);
      }
      const actions = document.createElement('div'); actions.className = 'flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-brand-border';
      const iconMap = {
        'Move up': '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
        'Move down': '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        'Remove': '<svg class="w-3.5 h-3.5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
      };
      for (const [label, target] of [['Move up', index - 1], ['Move down', index + 1], ['Remove', -1]]) {
        const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `${iconMap[label] || ''}<span>${label}</span>`; button.setAttribute('aria-label', label + ' FAQ ' + (index + 1)); button.title = label + ' FAQ ' + (index + 1); button.className = 'inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg bg-white dark:bg-brand-surface text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition ' + (label === 'Remove' ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40' : 'border-slate-200 dark:border-brand-border text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-brand-dark'); button.disabled = label !== 'Remove' && (target < 0 || target >= items.length);
        button.addEventListener('click', () => { if (label === 'Remove') items.splice(index, 1); else [items[index], items[target]] = [items[target], items[index]]; sync(); render(); }); actions.append(button);
      }
      card.append(actions); rows.append(card);
    });
    if (status) status.textContent = items.length + (items.length === 1 ? ' additional FAQ entry.' : ' additional FAQ entries.');
  }
  const addButton = document.getElementById('addFaqRow');
  if (addButton) {
    addButton.addEventListener('click', () => {
      if (items.length >= 100) {
        if (status) status.textContent = 'You can add up to 100 FAQ entries.';
        return;
      }
      items.push({ question: '', answer: '' });
      sync();
      render();
      rows.lastElementChild.querySelector('input').focus();
    });
  }
  if (form) {
    form.addEventListener('reset', () => {
      window.setTimeout(() => {
        items = parseItems(field.value);
        render();
      }, 0);
    });
  }
  sync(); render();
})();
