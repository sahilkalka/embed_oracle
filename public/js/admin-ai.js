// 1. Provider presets & visual card selection handler
  const providerRadios = document.querySelectorAll('input[name="ai_provider"]');
  const aiModelInput = document.getElementById('ai_model');
  const aiBaseUrlInput = document.getElementById('ai_base_url');
  const aiConfigForm = document.getElementById('aiConfigForm');

  const providerDefaults = {
    nvidia: { model: 'meta/llama-3.1-70b-instruct', url: 'https://' + ['i','n','t','e','g','r','a','t','e'].join('') + '.api.nvidia.com/v1' },
    openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
    gemini: { model: 'gemini-1.5-flash', url: '' },
    custom: { model: 'llama3:8b', url: 'http://localhost:11434/v1' }
  };

  function syncProviderCardStyles() {
    document.querySelectorAll('#providerCards label').forEach(l => {
      const radio = l.querySelector('input[name="ai_provider"]');
      const dot = l.querySelector('.provider-dot');
      const check = l.querySelector('.provider-check');
      const isChecked = Boolean(radio && radio.checked);
      l.classList.remove(
        'border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/30', 'ring-brand-500',
        'border-slate-200', 'dark:border-brand-border',
        'border-emerald-500', 'bg-emerald-50/70', 'bg-emerald-500/10', 'dark:bg-emerald-500/10', 'ring-1', 'ring-emerald-500',
        'border-[#1c2e38]', 'dark:border-[#1c2e38]', 'bg-white', 'bg-[#0c161c]', 'dark:bg-[#0c161c]', 'hover:border-slate-300', 'hover:border-slate-600', 'dark:hover:border-slate-600'
      );
      if (isChecked) {
        l.classList.add('border-emerald-500', 'bg-emerald-50/70', 'dark:bg-emerald-500/10', 'ring-1', 'ring-emerald-500');
        if (dot) {
          dot.classList.remove('bg-slate-300', 'dark:bg-slate-600', 'bg-slate-600');
          dot.classList.add('bg-emerald-500', 'dark:bg-emerald-400');
        }
        if (check) check.classList.remove('hidden');
      } else {
        l.classList.add('border-slate-200', 'dark:border-[#1c2e38]', 'bg-white', 'dark:bg-[#0c161c]', 'hover:border-slate-300', 'dark:hover:border-slate-600');
        if (dot) {
          dot.classList.remove('bg-emerald-500', 'dark:bg-emerald-400', 'bg-emerald-400');
          dot.classList.add('bg-slate-300', 'dark:bg-slate-600');
        }
        if (check) check.classList.add('hidden');
      }
    });
  }

  providerRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      syncProviderCardStyles();
      const preset = providerDefaults[radio.value];
      if (preset) {
        if (aiModelInput) aiModelInput.value = preset.model;
        if (aiBaseUrlInput) aiBaseUrlInput.value = preset.url;
      }
    });
  });

  // 1b. API Key Show/Hide Password Toggle
  const btnToggleApiKey = document.getElementById('btnToggleApiKey');
  const aiApiKeyInput = document.getElementById('ai_api_key');
  const iconApiKeyShow = document.getElementById('iconApiKeyShow');
  const iconApiKeyHide = document.getElementById('iconApiKeyHide');
  const labelApiKeyToggle = document.getElementById('labelApiKeyToggle');

  if (btnToggleApiKey && aiApiKeyInput) {
    btnToggleApiKey.addEventListener('click', () => {
      const isPassword = aiApiKeyInput.type === 'password';
      aiApiKeyInput.type = isPassword ? 'text' : 'password';
      if (iconApiKeyShow && iconApiKeyHide) {
        iconApiKeyShow.classList.toggle('hidden', isPassword);
        iconApiKeyHide.classList.toggle('hidden', !isPassword);
      }
      if (labelApiKeyToggle) {
        labelApiKeyToggle.textContent = isPassword ? 'Hide' : 'Show';
      }
    });
  }

  // 1c. Temperature Slider Dynamic Label Display
  const aiTemperatureInput = document.getElementById('ai-temperature');
  const aiTemperatureDisplay = document.getElementById('aiTemperatureDisplay');

  function updateTemperatureLabel() {
    if (!aiTemperatureInput || !aiTemperatureDisplay) return;
    const val = parseFloat(aiTemperatureInput.value);
    const formatted = Number.isFinite(val) ? val.toFixed(1) : '0.7';
    aiTemperatureDisplay.textContent = formatted;
  }

  if (aiTemperatureInput) {
    aiTemperatureInput.addEventListener('input', updateTemperatureLabel);
    aiTemperatureInput.addEventListener('change', updateTemperatureLabel);
  }

  // 2. Test AI Model Connection
  const btnTestAi = document.getElementById('btnTestAi');
  const aiTestResult = document.getElementById('aiTestResult');

  function renderAiConnectionResult(state, title, { message, latency, provider, model, response, tip } = {}) {
    if (!aiTestResult) return;
    aiTestResult.className = 'ai-connection-result';
    aiTestResult.dataset.state = state;
    aiTestResult.setAttribute('aria-busy', String(state === 'loading'));
    const iconPath = state === 'success'
      ? '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
      : state === 'error'
        ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>'
        : '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>';
    aiTestResult.innerHTML = `
      <div class="ai-connection-heading">
        <svg class="ai-connection-icon${state === 'loading' ? ' animate-spin' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath}</svg>
        <strong>${escapeHtml(title)}</strong>
      </div>
      ${latency != null ? `<span class="ai-connection-latency">${escapeHtml(latency)}ms</span>` : ''}
      ${provider || model ? `<dl class="ai-connection-details">
        <div><dt>Provider</dt><dd>${escapeHtml(provider || '')}</dd></div>
        <div><dt>Model</dt><dd>${escapeHtml(model || '')}</dd></div>
      </dl>` : ''}
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
      ${response != null ? `<blockquote class="ai-connection-response">${escapeHtml(response)}</blockquote>` : ''}
      ${tip ? `<p class="ai-connection-tip">${escapeHtml(tip)}</p>` : ''}
    `;
  }

  if (btnTestAi && aiTestResult) {
    btnTestAi.addEventListener('click', async () => {
      renderAiConnectionResult('loading', 'Testing AI connection', {
        message: 'Testing AI model endpoint and validating response payload…'
      });
      btnTestAi.disabled = true;

      const selectedProvider = document.querySelector('input[name="ai_provider"]:checked')?.value || 'nvidia';
      const csrfToken = (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '') ||
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
        document.querySelector('input[name="_csrf"]')?.value ||
        window.csrfToken || '';

      const payload = {
        provider: selectedProvider,
        apiKey: document.getElementById('ai_api_key')?.value || '',
        model: document.getElementById('ai_model')?.value || '',
        baseUrl: document.getElementById('ai_base_url')?.value || '',
        _csrf: csrfToken
      };

      try {
        const res = await fetch('/admin/ai/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          renderAiConnectionResult('success', 'Connection verified successfully', {
            latency: data.latencyMs,
            provider: String(data.provider || selectedProvider).toUpperCase(),
            model: data.model || payload.model,
            response: data.response
          });
        } else {
          renderAiConnectionResult('error', 'AI connection error', {
            message: data.error || data.message || 'Connection test failed',
            tip: 'Tip: Leave API key blank to test the built-in local simulation pipeline.'
          });
        }
      } catch (err) {
        renderAiConnectionResult('error', 'Network request failed', { message: err.message });
      } finally {
        btnTestAi.disabled = false;
      }
    });
  }

  // 3. Topic suggestions via AI Agent / Curated Engine
  const btnRandomTopic = document.getElementById('btnRandomTopic');
  const aiTopicInput = document.getElementById('aiTopic');
  const aiTopicChips = document.getElementById('aiTopicChips');

  if (btnRandomTopic) {
    btnRandomTopic.addEventListener('click', async () => {
      const originalText = btnRandomTopic.innerHTML;
      btnRandomTopic.innerHTML = '<svg class="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Suggesting...</span>';
      btnRandomTopic.disabled = true;

      try {
        const csrfToken = (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '') ||
          document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
          document.querySelector('input[name="_csrf"]')?.value ||
          window.csrfToken || '';
        const res = await fetch('/admin/ai/suggest-topics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ category: document.getElementById('aiCategory').value, _csrf: csrfToken })
        });
        const data = await res.json();
        if (data.success && data.topics && data.topics.length > 0) {
          aiTopicInput.value = data.topics[0];
          aiTopicChips.innerHTML = '';
          aiTopicChips.classList.remove('hidden');

          data.topics.forEach((t) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'text-[11px] px-2.5 py-1 rounded-lg border border-[#1c2e38] bg-[#0c161c] hover:bg-emerald-500/10 hover:border-emerald-500/40 text-slate-300 font-medium transition text-left inline-flex items-center gap-1.5';
            chip.innerHTML = `<svg class="w-3 h-3 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg><span></span>`;
            chip.querySelector('span').textContent = t;
            chip.addEventListener('click', () => {
              aiTopicInput.value = t;
              aiTopicChips.querySelectorAll('button').forEach(b => b.classList.remove('ring-1', 'ring-emerald-500', 'border-emerald-500'));
              chip.classList.add('ring-1', 'ring-emerald-500', 'border-emerald-500');
            });
            aiTopicChips.appendChild(chip);
          });
        }
      } catch (err) {
        console.warn('Suggest topics failed:', err);
      } finally {
        btnRandomTopic.innerHTML = originalText;
        btnRandomTopic.disabled = false;
      }
    });
  }

  // 4. Generate Article On-Demand
  const btnGenerateArticle = document.getElementById('btnGenerateArticle');
  const aiGenStatus = document.getElementById('aiGenStatus');

  if (btnGenerateArticle) {
    btnGenerateArticle.addEventListener('click', async () => {
      let topic = aiTopicInput.value.trim();
      if (!topic) {
        topic = 'Optimizing Ultra-Low Power Sleep Modes on ESP32-S3 IoT Endpoints';
        aiTopicInput.value = topic;
      }

      aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-[#0c161c] text-emerald-300 border border-[#1c2e38] block animate-pulse';
      aiGenStatus.innerHTML = `⚙️ <strong>Drafting in Progress:</strong> Engineering engine is generating schematics, register configurations, and C firmware code for "<em>${topic}</em>"...`;
      btnGenerateArticle.disabled = true;

      try {
        const csrfToken = (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '') ||
          document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
          document.querySelector('input[name="_csrf"]')?.value ||
          window.csrfToken || '';
        const res = await fetch('/admin/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({
            topic,
            category: document.getElementById('aiCategory').value,
            targetAudience: document.getElementById('aiAudience').value,
            _csrf: csrfToken
          })
        });
        const data = await res.json();
        if (data.success) {
          aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 block space-y-2 shadow-sm';
          aiGenStatus.innerHTML = `
            <div class="font-bold text-xs flex items-center space-x-2">
              <span>🎉 Article Drafted &amp; Saved Successfully!</span>
            </div>
            <div class="mt-1"><strong>Title:</strong> ${data.post.title}</div>
            <div class="mt-1"><strong>CMS Status:</strong> <span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold uppercase">Saved to Drafts</span></div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <a href="/admin/posts/${data.post.id}/edit" class="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg font-bold text-xs transition">Edit / Review in CMS &rarr;</a>
              <a href="/blogs/${data.post.slug}" target="_blank" class="px-3.5 py-1.5 bg-[#0c161c] hover:bg-slate-800 text-slate-200 rounded-lg font-bold text-xs border border-[#1c2e38] transition">Preview Live Layout &nearr;</a>
            </div>
          `;
        } else {
          aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-red-950/50 text-red-300 border border-red-500/30 block';
          aiGenStatus.innerHTML = `❌ <strong>Article Generation Failed:</strong><br>${data.error || data.message || 'Generation failed'}`;
        }
      } catch (err) {
        aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-red-950/50 text-red-300 border border-red-500/30 block';
        aiGenStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
      } finally {
        btnGenerateArticle.disabled = false;
      }
    });
  }

  // 5. Generate Technical Outline On-Demand
  const btnGenerateOutline = document.getElementById('btnGenerateOutline');
  const aiOutlineBox = document.getElementById('aiOutlineBox');
  const aiOutlineSourceBadge = document.getElementById('aiOutlineSourceBadge');
  const aiOutlineTitle = document.getElementById('aiOutlineTitle');
  const aiOutlineSummary = document.getElementById('aiOutlineSummary');
  const aiOutlineContent = document.getElementById('aiOutlineContent');
  const btnCopyOutline = document.getElementById('btnCopyOutline');

  if (btnGenerateOutline) {
    btnGenerateOutline.addEventListener('click', async () => {
      let topic = aiTopicInput.value.trim();
      if (!topic) {
        topic = 'Deterministic CAN-FD Bus Timing & Bit-Rate Switching in Automotive ECUs';
        aiTopicInput.value = topic;
      }

      aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-[#0c161c] text-emerald-300 border border-[#1c2e38] block animate-pulse';
      aiGenStatus.innerHTML = `⚙️ <strong>Synthesizing Outline:</strong> Engineering engine is generating technical structure and C code skeleton...`;
      btnGenerateOutline.disabled = true;

      try {
        const csrfToken = (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '') ||
          document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
          document.querySelector('input[name="_csrf"]')?.value ||
          window.csrfToken || '';
        const res = await fetch('/admin/ai/generate-outline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({
            topic,
            category: document.getElementById('aiCategory').value,
            targetAudience: document.getElementById('aiAudience').value,
            _csrf: csrfToken
          })
        });
        const data = await res.json();
        if (data.success && data.outline) {
          aiGenStatus.classList.add('hidden');
          aiOutlineBox.classList.remove('hidden');
          aiOutlineSourceBadge.textContent = data.source === 'ai_agent' ? `AI Agent (${data.provider})` : 'Curated Template';
          aiOutlineTitle.textContent = data.outline.title || topic;
          aiOutlineSummary.textContent = data.outline.summary || '';
          aiOutlineContent.textContent = data.outline.contentMarkdown || '';
        } else {
          aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-red-950/50 text-red-300 border border-red-500/30 block';
          aiGenStatus.innerHTML = `❌ <strong>Outline Generation Failed:</strong><br>${data.error || data.message || 'Unknown error'}`;
        }
      } catch (err) {
        aiGenStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-red-950/50 text-red-300 border border-red-500/30 block';
        aiGenStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
      } finally {
        btnGenerateOutline.disabled = false;
      }
    });
  }

  if (btnCopyOutline) {
    btnCopyOutline.addEventListener('click', () => {
      navigator.clipboard.writeText(aiOutlineContent.textContent).then(() => {
        const span = btnCopyOutline.querySelector('span');
        if (span) {
          const original = span.textContent;
          span.textContent = 'Copied!';
          setTimeout(() => { span.textContent = original; }, 2000);
        }
      });
    });
  }

  // 6. Automated Scheduler Controls & Structured Topic Queue Table
  const btnRunSchedulerNow = document.getElementById('btnRunSchedulerNow');
  const schedulerRunStatus = document.getElementById('schedulerRunStatus');
  const btnPopulateDefaultTopics = document.getElementById('btnPopulateDefaultTopics');
  const aiSchedulerTopics = document.getElementById('aiSchedulerTopics');
  const topicQueueTableBody = document.getElementById('topicQueueTableBody');
  const topicQueueCountBadge = document.getElementById('topicQueueCountBadge');
  const newQueueTopicInput = document.getElementById('newQueueTopicInput');
  const btnAddQueueTopic = document.getElementById('btnAddQueueTopic');

  const defaultTopicsArray = [
    "High-Density Interconnect (HDI) Microvias & Differential Pair Skew Matching in 8-Layer PCBs",
    "Hardware Design Strategies for Minimizing EMI and ESD on Industrial CAN-FD Nodes",
    "Designing Ultra-Low-Noise Switched Mode Power Supplies for 24-Bit ADC Frontends",
    "Implementing Hard Real-Time Mutexes and DMA Streams in FreeRTOS on STM32G4",
    "Battery Life Optimization for LoRaWAN Class A Nodes Operating in Deep Freeze Environments",
    "Hardware-in-the-Loop (HIL) Automated Fault Injection for Automotive ECUs using Python",
    "Designing Fail-Safe Dual-Bank FOTA Firmware Bootloaders for ESP32-S3 over BLE",
    "Eliminating Ground Bounce & Clock Jitter in 100MHz+ SPI Bus Architectures",
    "Thermal Modeling & Copper Pour Heat Sinking for High-Power GaN Transistors in Motor Inverters",
    "Deterministic FreeRTOS Queue Management and Interrupt Latency Benchmarking on Cortex-M7",
    "Precision Low-Side vs High-Side Current Sensing Circuit Topology in Battery Management Systems",
    "Configuring Zero-Wait-State Flash Cache & TCM Memory for STM32H7 DSP Audio Filters"
  ];

  let editingTopicIndex = null;

  function parseQueueTopics() {
    if (!aiSchedulerTopics) return [];
    return (aiSchedulerTopics.value || '')
      .split('\n')
      .map(t => t.trim())
      .filter(Boolean);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncQueueTopics(topicsList) {
    if (!aiSchedulerTopics) return;
    aiSchedulerTopics.value = topicsList.join('\n');
    renderTopicQueueTable();
  }

  function renderTopicQueueTable() {
    if (!topicQueueTableBody) return;
    const topics = parseQueueTopics();
    if (topicQueueCountBadge) {
      topicQueueCountBadge.textContent = `${topics.length} queued`;
    }

    if (topics.length === 0) {
      topicQueueTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="py-6 px-4 text-center text-slate-400 text-xs">
            No topics currently in queue. Click <strong>Add Topic</strong> or <strong>Reset Curated Engineering Topics</strong>.
          </td>
        </tr>
      `;
      return;
    }

    topicQueueTableBody.innerHTML = topics.map((topicItem, idx) => {
      const isNext = idx === 0;
      const badgeHtml = isNext
           ? `<span class="inline-flex max-w-full items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] text-center leading-tight font-bold whitespace-normal bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
             <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
             Next in Cycle
           </span>`
        : `<span class="inline-flex max-w-full items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] text-center leading-tight font-semibold whitespace-normal bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#1c2e38]">
             Queued
           </span>`;

      if (editingTopicIndex === idx) {
        return `
          <tr class="bg-slate-50 dark:bg-[#111e26] transition" data-topic-index="${idx}">
            <td class="py-2 px-2 sm:px-3.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">${idx + 1}</td>
            <td class="py-2 px-2 sm:px-3.5 min-w-0" colspan="2">
              <input
                type="text"
                id="inlineEditTopicInput-${idx}"
                value="${escapeHtml(topicItem)}"
                class="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0c161c] border border-emerald-500 text-xs text-slate-900 dark:text-white focus:outline-none"
              >
            </td>
            <td class="py-2 px-1.5 sm:px-3.5 text-center sm:text-right">
              <div class="flex items-center justify-center sm:justify-end gap-1">
                <button type="button" title="Save topic" aria-label="Save topic" data-queue-action="save" data-index="${idx}" class="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:px-2.5 sm:py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold inline-flex items-center justify-center gap-1 transition">
                  <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span class="hidden sm:inline">Save</span>
                </button>
                <button type="button" title="Cancel editing" aria-label="Cancel editing" data-queue-action="cancel" data-index="${idx}" class="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:px-2 sm:py-1 rounded-lg bg-white dark:bg-[#0c161c] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#1c2e38] text-[10px] font-semibold inline-flex items-center justify-center gap-1 transition">
                  <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <span class="hidden sm:inline">Cancel</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-[#111e26]/60 transition group" data-topic-index="${idx}">
          <td class="py-2.5 px-2 sm:px-3.5 font-mono text-[11px] text-slate-400">${idx + 1}</td>
          <td class="py-2.5 px-2 sm:px-3.5 min-w-0 text-slate-800 dark:text-slate-100 font-medium leading-snug break-words [overflow-wrap:anywhere]">${escapeHtml(topicItem)}</td>
          <td class="py-2.5 px-2 sm:px-3.5 min-w-0">${badgeHtml}</td>
          <td class="py-2.5 px-1.5 sm:px-3.5 text-center sm:text-right">
            <div class="flex items-center justify-center sm:justify-end gap-1">
              <button type="button" title="Edit topic" aria-label="Edit topic" data-queue-action="edit" data-index="${idx}" class="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:px-2 sm:py-1 rounded-lg bg-white dark:bg-[#111e26] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#1c2e38] text-[10px] font-semibold inline-flex items-center justify-center gap-1 transition">
                <svg class="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span class="hidden sm:inline">Edit</span>
              </button>
              <button type="button" title="Remove topic" aria-label="Remove topic" data-queue-action="remove" data-index="${idx}" class="w-8 h-8 sm:w-auto sm:h-auto p-0 sm:px-2 sm:py-1 rounded-lg bg-white dark:bg-[#111e26] hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-300 border border-slate-200 dark:border-[#1c2e38] text-[10px] font-semibold inline-flex items-center justify-center gap-1 transition">
                <svg class="w-3 h-3 text-red-500 dark:text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span class="hidden sm:inline">Remove</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (topicQueueTableBody) {
    topicQueueTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-queue-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-queue-action');
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      const topics = parseQueueTopics();
      if (!Number.isFinite(idx) || idx < 0 || idx >= topics.length) return;

      if (action === 'edit') {
        editingTopicIndex = idx;
        renderTopicQueueTable();
        const inputEl = document.getElementById(`inlineEditTopicInput-${idx}`);
        if (inputEl) inputEl.focus();
      } else if (action === 'cancel') {
        editingTopicIndex = null;
        renderTopicQueueTable();
      } else if (action === 'save') {
        const inputEl = document.getElementById(`inlineEditTopicInput-${idx}`);
        const updatedVal = inputEl ? inputEl.value.trim() : '';
        if (updatedVal) {
          topics[idx] = updatedVal;
        }
        editingTopicIndex = null;
        syncQueueTopics(topics);
      } else if (action === 'remove') {
        topics.splice(idx, 1);
        editingTopicIndex = null;
        syncQueueTopics(topics);
      }
    });
  }

  function handleAddQueueTopic() {
    if (!newQueueTopicInput) return;
    const newTopic = newQueueTopicInput.value.trim();
    if (!newTopic) return;
    const topics = parseQueueTopics();
    topics.push(newTopic);
    newQueueTopicInput.value = '';
    editingTopicIndex = null;
    syncQueueTopics(topics);
  }

  if (btnAddQueueTopic) {
    btnAddQueueTopic.addEventListener('click', handleAddQueueTopic);
  }
  if (newQueueTopicInput) {
    newQueueTopicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddQueueTopic();
      }
    });
  }

  if (btnPopulateDefaultTopics) {
    btnPopulateDefaultTopics.addEventListener('click', () => {
      editingTopicIndex = null;
      syncQueueTopics(defaultTopicsArray.slice());
    });
  }

  if (aiConfigForm) {
    aiConfigForm.addEventListener('reset', () => {
      setTimeout(() => {
        editingTopicIndex = null;
        syncProviderCardStyles();
        updateTemperatureLabel();
        renderTopicQueueTable();
      }, 0);
    });
  }

  if (btnRunSchedulerNow) {
    btnRunSchedulerNow.addEventListener('click', async () => {
      schedulerRunStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-[#0c161c] text-emerald-300 border border-[#1c2e38] block animate-pulse';
      schedulerRunStatus.innerHTML = `⚙️ <strong>Triggering Scheduled Blog Engine:</strong> Selecting next queued topic, checking database post limits, and generating engineering article...`;
      btnRunSchedulerNow.disabled = true;

      try {
        const csrfToken = (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '') ||
          document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
          document.querySelector('input[name="_csrf"]')?.value ||
          window.csrfToken || '';
        const res = await fetch('/admin/ai/auto-gen/run-now', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ _csrf: csrfToken })
        });
        const data = await res.json();
        if (data.success && data.post) {
          schedulerRunStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 block space-y-2 shadow-sm';
          schedulerRunStatus.innerHTML = `
            <div class="font-bold text-xs flex items-center space-x-2">
              <span>🎉 Article Successfully Auto-Generated &amp; Added to CMS!</span>
            </div>
            <div><strong>Title:</strong> ${data.post.title}</div>
            <div><strong>Status:</strong> <span class="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-emerald-500/20 text-emerald-300">${data.post.status}</span></div>
            <div class="mt-3 flex items-center gap-3">
              <a href="/admin/posts/${data.post.id}/edit" class="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg font-bold text-xs transition">Edit in CMS &rarr;</a>
              <a href="/blogs/${data.post.slug}" target="_blank" class="px-3.5 py-1.5 bg-[#0c161c] hover:bg-slate-800 text-slate-200 rounded-lg font-bold text-xs border border-[#1c2e38] transition">View Live &nearr;</a>
            </div>
          `;
        } else {
          schedulerRunStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-amber-950/50 text-amber-300 border border-amber-500/30 block';
          schedulerRunStatus.innerHTML = `⚠️ <strong>Scheduler Notice:</strong> ${data.error || data.message || 'Operation skipped.'}`;
        }
      } catch (err) {
        schedulerRunStatus.className = 'p-3.5 rounded-xl text-xs font-mono bg-red-950/50 text-red-300 border border-red-500/30 block';
        schedulerRunStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
      } finally {
        btnRunSchedulerNow.disabled = false;
      }
    });
  }
