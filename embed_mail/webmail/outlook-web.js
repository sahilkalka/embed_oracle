/**
 * Embedded India - Outlook Web Client Customizer
 * Injected into Webmail runtime to provide Microsoft Outlook Web styling
 * and completely remove all SOGo instances, logos, text, and dialogs.
 */
(function() {
  'use strict';

  // 1. Enforce Outlook Title
  function enforceOutlookTitle() {
    var title = document.title || '';
    if (title.indexOf('SOGo') !== -1 || title.indexOf('Webmail') !== -1 || !title) {
      document.title = 'Outlook - Embedded India Mail';
    }
  }

  // 2. Eradicate SOGo DOM Elements & Modals
  function cleanSogoArtifacts() {
    // Suppress SOGo images
    var images = document.querySelectorAll('img[src*="sogo"], img[src*="logo"]');
    images.forEach(function(img) {
      if (!img.dataset.replaced) {
        img.style.display = 'none';
        img.setAttribute('aria-hidden', 'true');
      }
    });

    // Suppress About dialogs or Inverse links
    var badLinks = document.querySelectorAll('a[href*="sogo.nu"], a[href*="inverse.ca"], #aboutDialog');
    badLinks.forEach(function(el) {
      el.remove();
    });

    // Replace login screen branding if on login page
    var loginForm = document.querySelector('form[name="loginForm"], .sg-login-card, #loginWrapper');
    if (loginForm && !document.getElementById('outlook-login-banner')) {
      var banner = document.createElement('div');
      banner.id = 'outlook-login-banner';
      banner.style.cssText = 'margin-bottom: 24px; text-align: left;';
      banner.innerHTML = [
        '<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">',
        '  <svg width="36" height="36" viewBox="0 0 64 64" fill="none">',
        '    <rect width="64" height="64" rx="14" fill="#0078D4"/>',
        '    <rect x="10" y="18" width="44" height="30" rx="4" fill="#28A8EA" fill-opacity="0.95"/>',
        '    <path d="M10 22 L32 38 L54 22" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        '    <path d="M10 48 L27 34" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.75"/>',
        '    <path d="M54 48 L37 34" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.75"/>',
        '    <circle cx="52" cy="18" r="7" fill="#10B981" stroke="#0078D4" stroke-width="2"/>',
        '  </svg>',
        '  <div>',
        '    <span style="font-size:20px; font-weight:700; color:#0078D4; letter-spacing:-0.02em;">Outlook</span>',
        '    <span style="font-size:14px; font-weight:600; color:#605E5C; margin-left:6px;">Embedded India</span>',
        '  </div>',
        '</div>',
        '<h2 style="font-size:22px; font-weight:600; color:#201F1E; margin:0 0 4px 0;">Sign in</h2>',
        '<p style="font-size:13px; color:#605E5C; margin:0 0 16px 0;">to continue to Embedded India Webmail</p>'
      ].join('');

      var firstInput = loginForm.querySelector('md-input-container, input, .md-block');
      if (firstInput && firstInput.parentNode) {
        firstInput.parentNode.insertBefore(banner, firstInput);
      }
    }
  }

  // 3. Inject Outlook App Launcher (Waffle) Icon Button
  function injectOutlookHeaderRibbon() {
    var toolbar = document.querySelector('md-toolbar.sg-toolbar, .sg-toolbar, header.sg-header');
    if (toolbar && !document.getElementById('outlook-waffle-btn')) {
      var waffleBtn = document.createElement('button');
      waffleBtn.id = 'outlook-waffle-btn';
      waffleBtn.className = 'sg-waffle-btn';
      waffleBtn.title = 'App launcher';
      waffleBtn.setAttribute('aria-label', 'App launcher');
      waffleBtn.innerHTML = [
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">',
        '  <circle cx="5" cy="5" r="2.2"/>',
        '  <circle cx="12" cy="5" r="2.2"/>',
        '  <circle cx="19" cy="5" r="2.2"/>',
        '  <circle cx="5" cy="12" r="2.2"/>',
        '  <circle cx="12" cy="12" r="2.2"/>',
        '  <circle cx="19" cy="12" r="2.2"/>',
        '  <circle cx="5" cy="19" r="2.2"/>',
        '  <circle cx="12" cy="19" r="2.2"/>',
        '  <circle cx="19" cy="19" r="2.2"/>',
        '</svg>'
      ].join('');

      if (toolbar.firstChild) {
        toolbar.insertBefore(waffleBtn, toolbar.firstChild);
      } else {
        toolbar.appendChild(waffleBtn);
      }
    }
  }

  // Run on load and periodically observe mutations
  function runAll() {
    enforceOutlookTitle();
    cleanSogoArtifacts();
    injectOutlookHeaderRibbon();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }

  // MutationObserver for SPA changes
  var observer = new MutationObserver(function() {
    runAll();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(enforceOutlookTitle, 2000);
})();
