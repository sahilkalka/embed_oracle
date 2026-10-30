/**
 * Embedded India - AI Engineering Copilot Client Widget
 * Interactive, bouncy, floating hardware and firmware advisory assistant.
 */
(function() {
  const triggerBtn = document.getElementById('copilot-trigger-btn');
  const drawer = document.getElementById('copilot-drawer');
  const closeBtn = document.getElementById('copilot-close-btn');
  const messagesContainer = document.getElementById('copilot-messages');
  const form = document.getElementById('copilot-form');
  const input = document.getElementById('copilot-input');
  const promptChips = document.querySelectorAll('.copilot-chip');

  if (!triggerBtn || !drawer || !form) return;

  let conversationHistory = [];
  let isOpen = false;
  let isSending = false;

  let drawerAnimation;
  function toggleCopilot(open) {
    isOpen = typeof open === 'boolean' ? open : !isOpen;
    const wasHidden = drawer.classList.contains('hidden');
    const current = getComputedStyle(drawer);
    const from = { opacity: wasHidden ? 0 : current.opacity, transform: wasHidden ? 'translateY(28px) scale(0.92)' : current.transform };
    if (drawerAnimation) drawerAnimation.cancel();
    drawer.classList.remove('hidden', 'translate-y-8', 'opacity-0', 'pointer-events-none');
    drawer.style.transformOrigin = 'bottom right';
    drawer.style.transition = 'none';
    drawer.style.pointerEvents = isOpen ? 'auto' : 'none';
    drawer.inert = !isOpen;
    drawer.setAttribute('aria-hidden', String(!isOpen));
    triggerBtn.setAttribute('aria-expanded', String(isOpen));
    triggerBtn.setAttribute('aria-controls', 'copilot-drawer');
    triggerBtn.classList.toggle('scale-90', isOpen);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames = isOpen ? [from, { opacity: 1, transform: 'translateY(-7px) scale(1.015)', offset: 0.7 }, { opacity: 1, transform: 'translateY(0) scale(1)' }] : [from, { opacity: 1, transform: 'translateY(-4px) scale(1.01)', offset: 0.2 }, { opacity: 0, transform: 'translateY(24px) scale(0.94)' }];
    drawerAnimation = drawer.animate(frames, { duration: reducedMotion ? 1 : isOpen ? 480 : 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    drawerAnimation.onfinish = () => {
      if (isOpen) { if (input) input.focus({ preventScroll: true }); }
      else { drawer.classList.add('hidden'); triggerBtn.focus({ preventScroll: true }); }
    };
  }
  triggerBtn.addEventListener('click', () => toggleCopilot(!isOpen));
  if (closeBtn) closeBtn.addEventListener('click', () => toggleCopilot(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && isOpen) toggleCopilot(false); });

  const promptBar = document.getElementById('copilot-prompts');
  const previousPrompt = document.getElementById('copilot-prompts-prev');
  const nextPrompt = document.getElementById('copilot-prompts-next');
  if (promptBar && previousPrompt && nextPrompt) {
    const updatePromptArrows = () => {
      previousPrompt.disabled = promptBar.scrollLeft < 2;
      nextPrompt.disabled = promptBar.scrollLeft + promptBar.clientWidth >= promptBar.scrollWidth - 2;
    };
    previousPrompt.addEventListener('click', () => promptBar.scrollBy({ left: -promptBar.clientWidth * 0.8, behavior: 'smooth' }));
    nextPrompt.addEventListener('click', () => promptBar.scrollBy({ left: promptBar.clientWidth * 0.8, behavior: 'smooth' }));
    promptBar.addEventListener('scroll', updatePromptArrows);
    new ResizeObserver(updatePromptArrows).observe(promptBar);
    updatePromptArrows();
  }

  // Quick Prompt Chips
  promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.getAttribute('data-prompt') || chip.textContent.trim();
      if (input) {
        input.value = promptText;
        submitMessage(promptText);
      }
    });
  });

  // Markdown formatter (safe light parser for bold, headers, code, lists)
  function formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre class="bg-slate-900 text-emerald-400 p-2.5 rounded-lg my-2 text-[11px] font-mono overflow-x-auto border border-slate-700"><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-accent rounded font-mono text-[11px] font-bold">$1</code>');
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4 class="font-extrabold text-xs text-slate-900 dark:text-white mt-2 mb-1">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="font-black text-sm text-slate-900 dark:text-white mt-2.5 mb-1">$1</h3>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-black text-slate-900 dark:text-white">$1</strong>');
    // Unordered lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-3 list-disc text-slate-600 dark:text-slate-300 text-xs my-0.5">$1</li>');
    // Paragraphs
    html = html.replace(/\n\n/g, '<div class="h-2"></div>');

    return html;
  }

  function appendUserMessage(text) {
    const wrap = document.createElement('div');
    wrap.className = 'flex justify-end mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200';
    wrap.innerHTML = `
      <div class="max-w-[85%] bg-gradient-to-r from-brand-600 to-brand-500 text-white p-3 rounded-2xl rounded-br-xs shadow-md text-xs font-medium leading-relaxed">
        ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    `;
    messagesContainer.appendChild(wrap);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendBotMessage(replyHtml, suggestedActions = []) {
    const wrap = document.createElement('div');
    wrap.className = 'flex justify-start mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200';

    let actionButtonsHtml = '';
    if (suggestedActions && suggestedActions.length > 0) {
      actionButtonsHtml = `
        <div class="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap gap-1.5">
          ${suggestedActions.map(a => `
            <a href="${a.url}" class="inline-flex items-center space-x-1 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-[10px] font-bold text-slate-800 dark:text-slate-200 transition shadow-xs">
              <span>${a.text}</span>
              <span class="text-brand-500 dark:text-accent">&rarr;</span>
            </a>
          `).join('')}
        </div>
      `;
    }

    wrap.innerHTML = `
      <div class="flex items-start space-x-2 max-w-[90%]">
        <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-accent flex-shrink-0 flex items-center justify-center text-white text-[10px] font-black shadow-xs mt-0.5">
          EI
        </div>
        <div class="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-3.5 rounded-2xl rounded-tl-xs shadow-md text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
          ${replyHtml}
          ${actionButtonsHtml}
        </div>
      </div>
    `;
    messagesContainer.appendChild(wrap);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function appendLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'copilot-typing-indicator';
    loadingDiv.className = 'flex items-center space-x-2 mb-3';
    loadingDiv.innerHTML = `
      <div class="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-600 dark:text-accent flex items-center justify-center text-[10px] font-black">EI</div>
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-400 flex items-center space-x-1 shadow-xs">
        <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style="animation-delay: 0.15s"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style="animation-delay: 0.3s"></span>
        <span class="ml-1 text-[11px]">Engineering response...</span>
      </div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function removeLoading() {
    const indicator = document.getElementById('copilot-typing-indicator');
    if (indicator) indicator.remove();
  }

  async function submitMessage(userText) {
    if (isSending || !userText || !userText.trim()) return;
    isSending = true;
    const clean = userText.trim();

    appendUserMessage(clean);
    if (input) input.value = '';

    conversationHistory.push({ role: 'user', content: clean });
    appendLoading();

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: clean,
          conversationHistory: conversationHistory.slice(-6)
        })
      });

      const data = await res.json();
      removeLoading();

      if (data.success && data.reply) {
        conversationHistory.push({ role: 'assistant', content: data.reply });
        appendBotMessage(formatMarkdown(data.reply), data.suggestedActions);
      } else {
        appendBotMessage("Our engineering copilot experienced a brief interruption. Please submit your inquiry at our <a href='/contact' class='text-brand-500 underline font-bold'>Contact Page</a>.");
      }
    } catch (err) {
      removeLoading();
      appendBotMessage("Connection to engineering server interrupted. Please check your internet connection or email info@embeddedindia.in directly.");
    } finally {
      isSending = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input) submitMessage(input.value);
  });
})();

