// src/services/mailcowApi.js
// Server-side client for the mail server's REST API (mailcow), used by /admin/email.
// The API is only reachable on the server itself (127.0.0.1:8088); the key never reaches the browser.

const API_URL = (process.env.MAILCOW_API_URL || 'http://127.0.0.1:8088/api/v1').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;

class MailApiError extends Error {
  constructor(message, status = 502, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function apiKey() {
  const key = process.env.MAILCOW_API_KEY;
  if (!key) throw new MailApiError('Mail server API is not configured (MAILCOW_API_KEY missing).', 503);
  return key;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}/${path}`, {
      method,
      headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    if (err instanceof MailApiError) throw err;
    throw new MailApiError(err.name === 'TimeoutError' ? 'Mail server did not respond in time.' : 'Mail server is unreachable.', 504);
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = (data && data.msg) ? String(data.msg) : `Mail server returned HTTP ${res.status}`;
    throw new MailApiError(msg, res.status === 401 || res.status === 403 ? 502 : res.status, data);
  }
  // Write calls answer with [{type:'success'|'danger'|'error', msg:...}, ...]
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object' && 'type' in data[0] && 'msg' in data[0]) {
    const failed = data.find(r => r.type === 'danger' || r.type === 'error');
    if (failed) throw new MailApiError(humanMessage(failed.msg), 400, data);
  }
  return data;
}

// mailcow returns message keys (sometimes as arrays with parameters); make them readable.
function humanMessage(msg) {
  const parts = Array.isArray(msg) ? msg : [msg];
  const key = String(parts[0] || 'Request failed');
  const known = {
    object_exists: 'That address already exists.',
    is_alias: 'That address is already used by an alias.',
    is_mailbox: 'That address is already a mailbox.',
    password_complexity: 'The password does not meet the complexity rules.',
    password_mismatch: 'Passwords do not match.',
    mailbox_quota_exceeded: 'Quota is larger than the domain allows.',
    mailbox_quota_left_exceeded: 'Not enough quota left in the domain.',
    max_mailbox_exceeded: 'The domain has reached its maximum number of mailboxes.',
    goto_invalid: 'One of the destination addresses is invalid.',
    alias_invalid: 'The alias address is invalid.',
    access_denied: 'The mail server refused this action.'
  };
  return known[key] || key.replace(/_/g, ' ');
}

const get = (path) => request('GET', `get/${path}`);
const post = (path, body) => request('POST', path, body);
const enc = encodeURIComponent;

const MB = 1024 * 1024;

module.exports = {
  MailApiError,

  // --- Status -------------------------------------------------------------------
  async status() {
    const [version, containers, vmail] = await Promise.all([
      get('status/version').catch(() => ({})),
      get('status/containers').catch(() => ({})),
      get('status/vmail').catch(() => ({}))
    ]);
    return { version: version.version || null, containers, vmail };
  },

  // --- Domains ------------------------------------------------------------------
  listDomains: () => get('domain/all'),
  getDkim: (domain) => get(`dkim/${enc(domain)}`),

  // --- Mailboxes ----------------------------------------------------------------
  listMailboxes: () => get('mailbox/all'),
  addMailbox({ localPart, domain, name, quotaMb, password, forcePasswordChange }) {
    return post('add/mailbox', {
      local_part: localPart, domain, name, quota: String(quotaMb),
      password, password2: password, active: '1',
      force_pw_update: forcePasswordChange ? '1' : '0',
      tls_enforce_in: '0', tls_enforce_out: '0'
    });
  },
  editMailbox(username, attr) {
    return post('edit/mailbox', { items: [username], attr });
  },
  setMailboxPassword(username, password, forceChange) {
    return post('edit/mailbox', {
      items: [username],
      attr: { password, password2: password, force_pw_update: forceChange ? '1' : '0' }
    });
  },
  deleteMailbox: (username) => post('delete/mailbox', [username]),

  // --- Aliases ------------------------------------------------------------------
  listAliases: () => get('alias/all'),
  addAlias: ({ address, goto }) => post('add/alias', { address, goto, active: '1' }),
  editAlias: (id, attr) => post('edit/alias', { items: [String(id)], attr }),
  deleteAlias: (id) => post('delete/alias', [String(id)]),

  // --- Mail queue ---------------------------------------------------------------
  listQueue: () => get('mailq/all'),
  flushQueue: () => post('edit/mailq', { items: ['ALL'], attr: { action: 'flush' } }),
  queueAction: (qid, action) => post('edit/mailq', { items: [qid], attr: { action } }),
  deleteQueued: (qid) => post('delete/mailq', [qid]),

  // --- Quarantine ---------------------------------------------------------------
  listQuarantine: () => get('quarantine/all'),
  releaseQuarantined: (id) => post('edit/qitem', { items: [String(id)], attr: { action: 'release' } }),
  deleteQuarantined: (id) => post('delete/qitem', [String(id)]),

  // --- Security -----------------------------------------------------------------
  getFail2ban: () => get('fail2ban'),
  unban: (network) => post('edit/fail2ban', { items: [network], attr: { action: 'unban' } }),

  // --- Logs ---------------------------------------------------------------------
  logs: (service, count) => get(`logs/${enc(service)}/${Number(count) || 100}`),

  MB
};
