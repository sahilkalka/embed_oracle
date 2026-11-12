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

  // 4. Inject password visibility toggle on login / password fields
  function injectPasswordToggles() {
    var inputs = document.querySelectorAll('input[type="password"]');
    inputs.forEach(function(input) {
      if (input.dataset.eiPassToggle === '1') return;
      input.dataset.eiPassToggle = '1';
      var parent = input.parentElement;
      if (!parent) return;

      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      input.style.paddingRight = '40px';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Show password';
      btn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:#605E5C;cursor:pointer;padding:6px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;z-index:2;';
      var eyeOpen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      var eyeClosed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      btn.innerHTML = eyeOpen;

      btn.addEventListener('click', function() {
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        var nowVisible = !visible;
        btn.setAttribute('aria-pressed', nowVisible ? 'true' : 'false');
        btn.setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
        btn.title = nowVisible ? 'Hide password' : 'Show password';
        btn.innerHTML = nowVisible ? eyeClosed : eyeOpen;
      });
      parent.appendChild(btn);
    });
  }

  // Run on load and periodically observe mutations
  function runAll() {
    enforceOutlookTitle();
    cleanSogoArtifacts();
    injectOutlookHeaderRibbon();
    injectPasswordToggles();
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
