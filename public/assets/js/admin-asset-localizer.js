// public/assets/js/admin-asset-localizer.js
(function () {
  const ASSET_INPUT_SELECTOR = [
    'input[name="coverImage"]',
    'input[name="seo_og_image"]',
    'input[name="sponsor_banner_img"]',
    'input[name="lead_magnet_file"]',
    'input[name$="_img"]',
    'input[name$="_image"]',
    'input[name$="_logo"]',
    'input[name$="_icon"]',
    'input[name$="_banner"]',
    'input[data-asset-url="true"]'
  ].join(', ');

  const MARKDOWN_SELECTOR = 'textarea[name="contentMarkdown"], textarea[name="descriptionMarkdown"]';

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    const input = document.querySelector('input[name="_csrf"]');
    return input ? input.value : '';
  }

  function isRemoteHttpUrl(val) {
    if (!val || typeof val !== 'string') return false;
    const trimmed = val.trim();
    return /^https?:\/\//i.test(trimmed);
  }

  function isImagePath(val) {
    if (!val || typeof val !== 'string') return false;
    return /\.(png|jpe?g|webp|gif|svg|avif|ico|bmp)(\?.*)?$/i.test(val.trim()) || val.trim().startsWith('/uploads/localized/');
  }

  function enhanceAssetInput(input) {
    if (input.dataset.localizerEnhanced === 'true') return;
    input.dataset.localizerEnhanced = 'true';

    // Create action bar below the input
    const bar = document.createElement('div');
    bar.className = 'mt-1.5 flex flex-wrap items-center justify-between gap-2';

    const statusEl = document.createElement('span');
    statusEl.className = 'text-[11px] font-mono text-slate-500 dark:text-slate-400';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-brand-50 dark:bg-slate-800 text-brand-700 dark:text-accent border border-brand-200 dark:border-slate-700 hover:bg-brand-100 dark:hover:bg-slate-700 transition flex items-center gap-1 shadow-sm';
    btn.innerHTML = '<span>⬇</span><span>Save Asset Locally</span>';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'mt-2 hidden items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80';

    const previewImg = document.createElement('img');
    previewImg.className = 'w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0';
    previewImg.alt = 'Asset preview';

    const previewMeta = document.createElement('div');
    previewMeta.className = 'text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate';

    previewWrap.appendChild(previewImg);
    previewWrap.appendChild(previewMeta);

    bar.appendChild(statusEl);
    bar.appendChild(btn);

    input.insertAdjacentElement('afterend', bar);
    bar.insertAdjacentElement('afterend', previewWrap);

    function refreshState() {
      const val = (input.value || '').trim();
      if (!val) {
        statusEl.textContent = 'Paste any external http(s) URL to auto-save locally on submit.';
        statusEl.className = 'text-[11px] text-slate-400 dark:text-slate-500';
        btn.style.display = 'none';
        previewWrap.classList.add('hidden');
        previewWrap.classList.remove('flex');
        return;
      }

      if (isRemoteHttpUrl(val)) {
        statusEl.textContent = '🌐 External URL detected — click to download now or save form to auto-localize.';
        statusEl.className = 'text-[11px] font-medium text-amber-600 dark:text-amber-400';
        btn.style.display = 'inline-flex';
      } else {
        statusEl.textContent = '✅ Stored locally (' + val + ')';
        statusEl.className = 'text-[11px] font-mono text-emerald-600 dark:text-emerald-400';
        btn.style.display = 'none';
      }

      if (isImagePath(val) && !val.toLowerCase().endsWith('.pdf')) {
        previewImg.src = val;
        previewMeta.textContent = val;
        previewWrap.classList.remove('hidden');
        previewWrap.classList.add('flex');
      } else {
        previewWrap.classList.add('hidden');
        previewWrap.classList.remove('flex');
      }
    }

    previewImg.addEventListener('error', function () {
      previewWrap.classList.add('hidden');
      previewWrap.classList.remove('flex');
    });

    async function localizeNow() {
      const rawUrl = (input.value || '').trim();
      if (!isRemoteHttpUrl(rawUrl)) return;

      btn.disabled = true;
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span><span>Downloading...</span>';
      statusEl.textContent = 'Downloading remote asset to server...';
      statusEl.className = 'text-[11px] font-mono text-brand-600 dark:text-accent';

      try {
        const res = await fetch('/admin/assets/localize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'CSRF-Token': getCsrfToken()
          },
          body: JSON.stringify({ url: rawUrl, _csrf: getCsrfToken() })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not download remote asset.');
        }

        input.value = data.localUrl;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        refreshState();
        statusEl.textContent = (data.cached ? '✅ Linked existing local copy: ' : '✅ Saved locally: ') + data.localUrl;
        statusEl.className = 'text-[11px] font-mono text-emerald-600 dark:text-emerald-400';
      } catch (err) {
        statusEl.textContent = '⚠️ ' + (err.message || 'Failed to localize URL.');
        statusEl.className = 'text-[11px] font-medium text-red-600 dark:text-red-400';
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }

    btn.addEventListener('click', localizeNow);
    input.addEventListener('input', refreshState);
    input.addEventListener('change', refreshState);
    refreshState();
  }

  function enhanceMarkdownTextarea(textarea) {
    if (textarea.dataset.localizerEnhanced === 'true') return;
    textarea.dataset.localizerEnhanced = 'true';

    const bar = document.createElement('div');
    bar.className = 'mt-1.5 flex flex-wrap items-center justify-between gap-2';

    const hint = document.createElement('span');
    hint.className = 'text-[11px] text-slate-400 dark:text-slate-500';
    hint.textContent = 'External Markdown/HTML images are automatically downloaded locally when saved.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-brand-50 dark:hover:bg-slate-700 transition flex items-center gap-1';
    btn.innerHTML = '<span>⬇</span><span>Localize External Images in Markdown</span>';

    bar.appendChild(hint);
    bar.appendChild(btn);
    textarea.insertAdjacentElement('afterend', bar);

    btn.addEventListener('click', async function () {
      const md = textarea.value || '';
      if (!/https?:\/\//i.test(md)) {
        hint.textContent = 'No external http(s) image URLs found in Markdown.';
        hint.className = 'text-[11px] font-mono text-slate-500';
        return;
      }

      btn.disabled = true;
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span><span>Localizing images...</span>';
      hint.textContent = 'Scanning and downloading external images...';
      hint.className = 'text-[11px] font-mono text-brand-600 dark:text-accent';

      try {
        const res = await fetch('/admin/assets/localize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'CSRF-Token': getCsrfToken()
          },
          body: JSON.stringify({ markdown: md, _csrf: getCsrfToken() })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to localize Markdown images.');
        }

        if (data.localizedCount > 0 && typeof data.markdown === 'string') {
          textarea.value = data.markdown;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          hint.textContent = `✅ Localized ${data.localizedCount} external image(s) to /uploads/localized/!`;
          hint.className = 'text-[11px] font-mono text-emerald-600 dark:text-emerald-400';
        } else {
          hint.textContent = 'No downloadable external image URLs found in Markdown.';
          hint.className = 'text-[11px] font-mono text-slate-500';
        }
      } catch (err) {
        hint.textContent = '⚠️ ' + (err.message || 'Error localizing Markdown images.');
        hint.className = 'text-[11px] font-medium text-red-600 dark:text-red-400';
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });
  }

  function initAdminAssetLocalizer() {
    document.querySelectorAll(ASSET_INPUT_SELECTOR).forEach(enhanceAssetInput);
    document.querySelectorAll(MARKDOWN_SELECTOR).forEach(enhanceMarkdownTextarea);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminAssetLocalizer);
  } else {
    initAdminAssetLocalizer();
  }
})();
