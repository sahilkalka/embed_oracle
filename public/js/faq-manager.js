(() => {
  const field = document.getElementById('custom_faqs'), rows = document.getElementById('faqEditorRows');
  if (!field || !rows) return;
  let items; try { items = JSON.parse(field.value); if (!Array.isArray(items)) items = []; } catch { items = []; }
  const sync = () => { field.value = JSON.stringify(items); };
  function render() {
    rows.replaceChildren();
    items.forEach((item, index) => {
      const card = document.createElement('div'); card.className = 'settings-panel faq-editor-card p-5 rounded-2xl bg-slate-50 dark:bg-brand-dark border border-slate-200 dark:border-brand-border space-y-4';
      for (const [key, label, max] of [['question', 'Question', 300], ['answer', 'Answer', 5000]]) {
        const wrapper = document.createElement('label'); wrapper.className = 'block text-xs font-medium text-slate-800 dark:text-slate-200'; wrapper.textContent = label + ' ' + (index + 1);
        const input = document.createElement(key === 'answer' ? 'textarea' : 'input'); input.value = item[key] || ''; input.required = true; input.maxLength = max; input.className = 'block w-full mt-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-brand-surface border border-slate-300 dark:border-slate-700 text-sm font-normal';
        if (key === 'answer') input.rows = 4;
        input.addEventListener('input', () => { item[key] = input.value; sync(); }); wrapper.append(input); card.append(wrapper);
      }
      const actions = document.createElement('div'); actions.className = 'flex flex-wrap gap-2';
      for (const [label, target] of [['Move up', index - 1], ['Move down', index + 1], ['Remove', -1]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', label + ' FAQ ' + (index + 1)); button.className = 'px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-brand-surface text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed'; button.disabled = label !== 'Remove' && (target < 0 || target >= items.length);
        button.addEventListener('click', () => { if (label === 'Remove') items.splice(index, 1); else [items[index], items[target]] = [items[target], items[index]]; sync(); render(); }); actions.append(button);
      }
      card.append(actions); rows.append(card);
    });
    document.getElementById('faqEditorStatus').textContent = items.length ? items.length + ' additional FAQ entries.' : 'No additional FAQ entries yet.';
  }
  document.getElementById('addFaqRow').addEventListener('click', () => { if (items.length >= 100) return; items.push({ question: '', answer: '' }); sync(); render(); rows.lastElementChild.querySelector('input').focus(); });
  sync(); render();
})();
