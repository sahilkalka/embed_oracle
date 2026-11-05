const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function getCredentials() {
  return {
    siteKey: String(process.env.TURNSTILE_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || '').trim(),
    secretKey: String(process.env.TURNSTILE_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY || '').trim()
  };
}

function getSiteKey() {
  const { siteKey, secretKey } = getCredentials();
  return siteKey && secretKey ? siteKey : '';
}

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function isAllowedHostname(hostname) {
  const actual = normalizeHostname(hostname);
  if (!actual) return false;

  const configuredHosts = process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  let allowedHosts = configuredHosts
    ? configuredHosts.split(',').map(normalizeHostname).filter(Boolean)
    : [];

  if (!allowedHosts.length && process.env.APP_URL) {
    try {
      allowedHosts = [normalizeHostname(new URL(process.env.APP_URL).hostname)].filter(Boolean);
    } catch (_) {}
  }

  if (!allowedHosts.length) return true;

  const withoutWww = value => value.startsWith('www.') ? value.slice(4) : value;
  return allowedHosts.some(expected => withoutWww(expected) === withoutWww(actual));
}

async function verifyTurnstile(req) {
  const { siteKey, secretKey } = getCredentials();
  const configured = Boolean(siteKey && secretKey);

  if (!configured) {
    const developmentBypass = process.env.NODE_ENV !== 'production';
    return { ok: developmentBypass, configured: false, unavailable: !developmentBypass };
  }

  const token = req.body && (req.body.turnstileToken || req.body['cf-turnstile-response']);
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return { ok: false, configured: true, unavailable: false };
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: token.trim() }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { ok: false, configured: true, unavailable: true };
    }

    const result = await response.json();
    const ok = result.success === true && isAllowedHostname(result.hostname);
    return { ok, configured: true, unavailable: false };
  } catch (error) {
    console.error('[TURNSTILE] Verification request failed:', error.message);
    return { ok: false, configured: true, unavailable: true };
  }
}

module.exports = { getSiteKey, verifyTurnstile };