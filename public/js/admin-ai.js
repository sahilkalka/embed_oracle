// 1. Provider presets handler
  const providerRadios = document.querySelectorAll('input[name="ai_provider"]');
  const aiModelInput = document.getElementById('ai_model');
  const aiBaseUrlInput = document.getElementById('ai_base_url');

  const providerDefaults = {
    nvidia: { model: 'meta/llama-3.1-70b-instruct', url: 'https://' + ['i','n','t','e','g','r','a','t','e'].join('') + '.api.nvidia.com/v1' },
    openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
    gemini: { model: 'gemini-1.5-flash', url: '' },
    custom: { model: 'llama3:8b', url: 'http://localhost:11434/v1' }
  };

  providerRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('#providerCards label').forEach(l => {
        l.classList.remove('border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/30', 'ring-1', 'ring-brand-500');
        l.classList.add('border-slate-200', 'dark:border-brand-border');
      });
      const currentLabel = radio.closest('label');
      currentLabel.classList.add('border-brand-500', 'bg-brand-50', 'dark:bg-brand-900/30', 'ring-1', 'ring-brand-500');
      currentLabel.classList.remove('border-slate-200', 'dark:border-brand-border');

      const preset = providerDefaults[radio.value];
      if (preset) {
        aiModelInput.value = preset.model;
        aiBaseUrlInput.value = preset.url;
      }
    });
  });

  // 2. Test AI Model Connection
  const btnTestAi = document.getElementById('btnTestAi');
  const aiTestResult = document.getElementById('aiTestResult');

  btnTestAi.addEventListener('click', async () => {
    aiTestResult.className = 'mt-3 p-4 rounded-xl text-xs font-mono bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 block';
    aiTestResult.innerHTML = '<span class="animate-pulse">🔄 Testing AI model endpoint and validating response payload...</span>';
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
        aiTestResult.className = 'mt-3 p-4 rounded-xl text-xs font-mono bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 block space-y-1.5 shadow-sm';
        aiTestResult.innerHTML = `
          <div class="font-bold text-sm flex items-center space-x-2">
            <span>✅ Connection Verified Successfully!</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-200/50 dark:bg-emerald-900/50">${data.latencyMs}ms</span>
          </div>
          <div><strong>Provider:</strong> ${(data.provider || selectedProvider).toUpperCase()} | <strong>Model:</strong> ${data.model || payload.model}</div>
          <div class="mt-2 p-2.5 bg-white/60 dark:bg-black/30 rounded-lg border border-emerald-200 dark:border-emerald-800 text-[11px]">
            &ldquo;${data.response}&rdquo;
          </div>
        `;
      } else {
        const errorMsg = data.error || data.message || 'Connection test failed';
        aiTestResult.className = 'mt-3 p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block space-y-1';
        aiTestResult.innerHTML = `
          <div class="font-bold text-sm">❌ AI Connection Error</div>
          <div>${errorMsg}</div>
          <div class="text-[10px] text-slate-500 mt-1">Tip: Leave API key blank to test the built-in local simulation pipeline.</div>
        `;
      }
    } catch (err) {
      aiTestResult.className = 'mt-3 p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
      aiTestResult.innerHTML = `❌ <strong>Network Request Failed:</strong> ${err.message}`;
    } finally {
      btnTestAi.disabled = false;
    }
  });

  // 3. Topic suggestions via AI Agent / Curated Engine
  const btnRandomTopic = document.getElementById('btnRandomTopic');
  const aiTopicInput = document.getElementById('aiTopic');
  const aiTopicChips = document.getElementById('aiTopicChips');

  btnRandomTopic.addEventListener('click', async () => {
    const originalText = btnRandomTopic.innerHTML;
    btnRandomTopic.innerHTML = '<span class="animate-pulse">🔄 Suggesting...</span>';
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
          chip.className = 'text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-brand-border bg-slate-50 dark:bg-slate-900 hover:bg-brand-50 dark:hover:bg-brand-900/40 hover:border-brand-500 text-slate-700 dark:text-slate-300 font-medium transition text-left';
          chip.textContent = t;
          chip.addEventListener('click', () => {
            aiTopicInput.value = t;
            aiTopicChips.querySelectorAll('button').forEach(b => b.classList.remove('ring-1', 'ring-brand-500', 'border-brand-500'));
            chip.classList.add('ring-1', 'ring-brand-500', 'border-brand-500');
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

  // 4. Generate Article On-Demand
  const btnGenerateArticle = document.getElementById('btnGenerateArticle');
  const aiGenStatus = document.getElementById('aiGenStatus');

  btnGenerateArticle.addEventListener('click', async () => {
    let topic = aiTopicInput.value.trim();
    if (!topic) {
      topic = 'Optimizing Ultra-Low Power Sleep Modes on ESP32-S3 IoT Endpoints';
      aiTopicInput.value = topic;
    }

    aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 block animate-pulse';
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
        aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 block space-y-2 shadow-sm';
        aiGenStatus.innerHTML = `
          <div class="font-bold text-sm flex items-center space-x-2">
            <span>🎉 Article Drafted &amp; Saved Successfully!</span>
          </div>
          <div class="mt-1"><strong>Title:</strong> ${data.post.title}</div>
          <div class="mt-1"><strong>CMS Status:</strong> <span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 rounded text-[10px] font-bold uppercase">Saved to Drafts</span></div>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <a href="/admin/posts/${data.post.id}/edit" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs transition">Edit / Review in CMS &rarr;</a>
            <a href="/blogs/${data.post.slug}" target="_blank" class="px-4 py-2 bg-slate-100 dark:bg-brand-dark hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-white rounded-lg font-bold text-xs border border-slate-300 dark:border-slate-700 transition">Preview Live Layout &nearr;</a>
          </div>
        `;
      } else {
        aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
        aiGenStatus.innerHTML = `❌ <strong>Article Generation Failed:</strong><br>${data.error || data.message || 'Generation failed'}`;
      }
    } catch (err) {
      aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
      aiGenStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
    } finally {
      btnGenerateArticle.disabled = false;
    }
  });

  // 5. Generate Technical Outline On-Demand
  const btnGenerateOutline = document.getElementById('btnGenerateOutline');
  const aiOutlineBox = document.getElementById('aiOutlineBox');
  const aiOutlineSourceBadge = document.getElementById('aiOutlineSourceBadge');
  const aiOutlineTitle = document.getElementById('aiOutlineTitle');
  const aiOutlineSummary = document.getElementById('aiOutlineSummary');
  const aiOutlineContent = document.getElementById('aiOutlineContent');
  const btnCopyOutline = document.getElementById('btnCopyOutline');

  btnGenerateOutline.addEventListener('click', async () => {
    let topic = aiTopicInput.value.trim();
    if (!topic) {
      topic = 'Deterministic CAN-FD Bus Timing & Bit-Rate Switching in Automotive ECUs';
      aiTopicInput.value = topic;
    }

    aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 block animate-pulse';
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
        aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
        aiGenStatus.innerHTML = `❌ <strong>Outline Generation Failed:</strong><br>${data.error || data.message || 'Unknown error'}`;
      }
    } catch (err) {
      aiGenStatus.className = 'p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
      aiGenStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
    } finally {
      btnGenerateOutline.disabled = false;
    }
  });

  btnCopyOutline.addEventListener('click', () => {
    navigator.clipboard.writeText(aiOutlineContent.textContent).then(() => {
      const original = btnCopyOutline.textContent;
      btnCopyOutline.textContent = '✅ Copied!';
      setTimeout(() => { btnCopyOutline.textContent = original; }, 2000);
    });
  });

  // 6. Automated Scheduler Controls
  const btnRunSchedulerNow = document.getElementById('btnRunSchedulerNow');
  const schedulerRunStatus = document.getElementById('schedulerRunStatus');
  const btnPopulateDefaultTopics = document.getElementById('btnPopulateDefaultTopics');
  const aiSchedulerTopics = document.getElementById('aiSchedulerTopics');

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

  if (btnPopulateDefaultTopics) {
    btnPopulateDefaultTopics.addEventListener('click', () => {
      aiSchedulerTopics.value = defaultTopicsArray.join('\n');
    });
  }

  if (btnRunSchedulerNow) {
    btnRunSchedulerNow.addEventListener('click', async () => {
      schedulerRunStatus.className = 'mt-4 p-4 rounded-xl text-xs font-mono bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 block animate-pulse';
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
          schedulerRunStatus.className = 'mt-4 p-4 rounded-xl text-xs font-mono bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 block space-y-2 shadow-sm';
          schedulerRunStatus.innerHTML = `
            <div class="font-bold text-sm flex items-center space-x-2">
              <span>🎉 Article Successfully Auto-Generated &amp; Added to CMS!</span>
            </div>
            <div><strong>Title:</strong> ${data.post.title}</div>
            <div><strong>Status:</strong> <span class="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-emerald-200/50 dark:bg-emerald-950/50">${data.post.status}</span></div>
            <div class="mt-3 flex items-center gap-3">
              <a href="/admin/posts/${data.post.id}/edit" class="px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs transition">Edit in CMS &rarr;</a>
              <a href="/blogs/${data.post.slug}" target="_blank" class="px-3.5 py-1.5 bg-slate-100 dark:bg-brand-dark hover:bg-slate-200 text-slate-800 dark:text-white rounded-lg font-bold text-xs border border-slate-300 dark:border-slate-700 transition">View Live &nearr;</a>
            </div>
          `;
        } else {
          schedulerRunStatus.className = 'mt-4 p-4 rounded-xl text-xs font-mono bg-yellow-50 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800 block';
          schedulerRunStatus.innerHTML = `⚠️ <strong>Scheduler Notice:</strong> ${data.error || data.message || 'Operation skipped.'}`;
        }
      } catch (err) {
        schedulerRunStatus.className = 'mt-4 p-4 rounded-xl text-xs font-mono bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 block';
        schedulerRunStatus.innerHTML = `❌ <strong>Request Failed:</strong> ${err.message}`;
      } finally {
        btnRunSchedulerNow.disabled = false;
      }
    });
  }
