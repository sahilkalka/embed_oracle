(function () {
  'use strict';

  const PREFERENCES_KEY = 'cookie-preferences-v1';
  const banner = document.getElementById('cookie-banner');
  const dialog = document.getElementById('cookie-preferences-dialog');
  const advertisingToggle = document.getElementById('cookie-advertising-toggle');
  const bannerStatus = document.getElementById('cookie-banner-status');
  const preferencesStatus = document.getElementById('cookie-preferences-status');
  const configElement = document.getElementById('optional-tracking-config');
  let trackingConfig = {};
  let preferences = null;
  let trackingLoadStarted = false;

  if (configElement) {
    try {
      trackingConfig = JSON.parse(configElement.textContent || '{}');
    } catch (error) {
      console.error('[COOKIE CONSENT] Could not read tracking configuration.', error);
    }
  }

  function readPreferences() {
    let storage;
    try {
      storage = window.localStorage;
    } catch (error) {
      console.warn('[COOKIE CONSENT] Could not access saved preferences.', error);
      return null;
    }

    let saved = null;
    try {
      saved = JSON.parse(storage.getItem(PREFERENCES_KEY) || 'null');
    } catch (error) {
      console.warn('[COOKIE CONSENT] Could not parse saved preferences.', error);
    }
    if (saved && saved.necessary === true && typeof saved.advertising === 'boolean') {
      return { necessary: true, advertising: saved.advertising };
    }

    try {
      const legacyChoice = storage.getItem('cookie-choice');
      if (legacyChoice === 'accepted' || legacyChoice === 'declined') {
        return { necessary: true, advertising: legacyChoice === 'accepted' };
      }
    } catch (error) {
      console.warn('[COOKIE CONSENT] Could not read the previous consent choice.', error);
    }

    return null;
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('hidden');
  }

  function clearStatus(element) {
    if (!element) return;
    element.textContent = '';
    element.classList.add('hidden');
  }

  function savePreferences(nextPreferences) {
    const serialized = JSON.stringify(nextPreferences);
    try {
      const storage = window.localStorage;
      storage.setItem(PREFERENCES_KEY, serialized);
      try {
        storage.setItem('cookie-choice', nextPreferences.advertising ? 'accepted' : 'declined');
      } catch (error) {
        console.warn('[COOKIE CONSENT] Could not update the previous consent choice.', error);
      }
      return true;
    } catch (error) {
      console.error('[COOKIE CONSENT] Preferences were not saved.', error);
      setStatus(bannerStatus, 'We could not save your choice in this browser. Optional scripts remain off; check your storage settings and try again.');
      setStatus(preferencesStatus, 'We could not save your choice in this browser. Optional scripts remain off; check your storage settings and try again.');
      return false;
    }
  }

  function appendExternalScript(id, src, options) {
    if (document.getElementById(id)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = !options || options.async !== false;
      if (options && options.crossOrigin) script.crossOrigin = options.crossOrigin;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => {
        const error = new Error(`Failed to load optional script: ${src}`);
        console.error('[COOKIE CONSENT]', error);
        reject(error);
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function loadMetaPixel(pixelId) {
    if (!pixelId) return;

    if (typeof window.fbq !== 'function') {
      const fbq = function () {
        if (fbq.callMethod) {
          fbq.callMethod.apply(fbq, arguments);
        } else {
          fbq.queue.push(arguments);
        }
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      window.fbq = fbq;
      window._fbq = fbq;

      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.addEventListener('error', () => {
        console.error('[COOKIE CONSENT] Failed to load Meta Pixel.');
      }, { once: true });
      document.head.appendChild(script);
    }

    window.fbq('consent', 'grant');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  function loadOptionalTracking() {
    if (trackingLoadStarted) return;
    trackingLoadStarted = true;
    loadMetaPixel(trackingConfig.metaPixelId);

    if (!trackingConfig.adsensePubId) return;

    const adsenseUrl = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(trackingConfig.adsensePubId)}`;
    appendExternalScript('optional-adsense-script', adsenseUrl, { crossOrigin: 'anonymous' })
      .then(() => {
        if (trackingConfig.adsenseInitUrl) {
          return appendExternalScript('optional-adsense-init', trackingConfig.adsenseInitUrl);
        }
      })
      .catch((error) => {
        console.error('[COOKIE CONSENT] Failed to initialize AdSense.', error);
      });
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function openPreferences() {
    clearStatus(bannerStatus);
    clearStatus(preferencesStatus);
    if (advertisingToggle) advertisingToggle.checked = Boolean(preferences && preferences.advertising);
    if (!dialog) {
      console.error('[COOKIE CONSENT] Preferences dialog is unavailable.');
      return;
    }

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
      } catch (error) {
        console.error('[COOKIE CONSENT] Could not open preferences dialog.', error);
      }
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function applyPreferences(nextPreferences) {
    if (!savePreferences(nextPreferences)) return;

    preferences = nextPreferences;
    clearStatus(bannerStatus);
    clearStatus(preferencesStatus);
    if (banner) banner.classList.add('hidden');
    document.documentElement.removeAttribute('data-cookie-consent-pending');

    if (preferences.advertising) {
      if (typeof window.fbq === 'function') window.fbq('consent', 'grant');
      loadOptionalTracking();
    } else if (typeof window.fbq === 'function') {
      window.fbq('consent', 'revoke');
    }

    closeDialog();
    window.dispatchEvent(new CustomEvent('cookieconsentresolved', {
      detail: { necessary: true, advertising: preferences.advertising }
    }));
  }

  const cookieAccept = document.getElementById('cookie-accept');
  const cookieDecline = document.getElementById('cookie-decline');
  const cookieManage = document.getElementById('cookie-manage');
  const cookieSettings = document.getElementById('cookie-settings-open');
  const preferencesClose = document.getElementById('cookie-preferences-close');
  const preferencesSave = document.getElementById('cookie-preferences-save');
  const preferencesAcceptAll = document.getElementById('cookie-preferences-accept-all');

  if (cookieAccept) {
    cookieAccept.addEventListener('click', () => {
      applyPreferences({ necessary: true, advertising: true });
    });
  }
  if (cookieDecline) {
    cookieDecline.addEventListener('click', () => {
      applyPreferences({ necessary: true, advertising: false });
    });
  }
  if (cookieManage) cookieManage.addEventListener('click', openPreferences);
  if (cookieSettings) cookieSettings.addEventListener('click', openPreferences);
  if (preferencesClose) preferencesClose.addEventListener('click', closeDialog);
  if (preferencesSave) {
    preferencesSave.addEventListener('click', () => {
      applyPreferences({ necessary: true, advertising: Boolean(advertisingToggle && advertisingToggle.checked) });
    });
  }
  if (preferencesAcceptAll) {
    preferencesAcceptAll.addEventListener('click', () => {
      applyPreferences({ necessary: true, advertising: true });
    });
  }
  if (dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
  }

  preferences = readPreferences();
  if (preferences && preferences.advertising) {
    loadOptionalTracking();
  }

  if (!preferences && banner && !navigator.webdriver) {
    banner.classList.remove('hidden');
    document.documentElement.dataset.cookieConsentPending = 'true';
  } else {
    document.documentElement.removeAttribute('data-cookie-consent-pending');
  }
})();
