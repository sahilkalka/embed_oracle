// src/routes/adminEmail.js
// /admin/email: mail server administration (mailboxes, aliases, DNS health, queue,
// quarantine, security, logs). Mounted behind requireAuth + requireRole('admin').
// All mail server calls happen server-side through services/mailcowApi.

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mail = require('../services/mailcowApi');
const dnsCheck = require('../services/mailDnsCheck');
const audit = require('../services/mailAudit');
const mailer = require('../services/mailer');

const router = express.Router();
const WEBMAIL_URL = process.env.WEBMAIL_URL || 'https://mail.embeddedindia.in/';
const DOMAIN = dnsCheck.DOMAIN;

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many changes in a short time. Please wait a minute.' }
});

// ---------------------------------------------------------------- helpers
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;
const QID_RE = /^[A-Za-z0-9]{6,20}$/;
const SERVICES = { postfix: 'Mail transfer', dovecot: 'Mailbox access', 'rspamd-history': 'Spam filter', netfilter: 'Intrusion protection', watchdog: 'Health watchdog', acme: 'Certificates', api: 'Admin API', ratelimited: 'Rate limits', sogo: 'Calendar & contacts sync' };

class BadRequest extends Error { constructor(m) { super(m); this.status = 400; } }

function generatePassword() {
  // 20 chars, letters + digits + symbols, no look-alikes
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#%+-=?@'];
  const all = sets.join('');
  const pick = s => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick);
  while (chars.length < 20) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) throw new BadRequest('Password must be at least 12 characters.');
  if (pw.length > 128) throw new BadRequest('Password is too long.');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) throw new BadRequest('Password needs upper case, lower case and a number.');
  return pw;
}

function cleanEmail(value, field = 'Email address') {
  const v = String(value || '').trim().toLowerCase();
  if (!EMAIL_RE.test(v)) throw new BadRequest(`${field} is not valid.`);
  return v;
}

function ownMailbox(username) {
  const u = cleanEmail(username, 'Mailbox');
  if (!u.endsWith(`@${DOMAIN}`)) throw new BadRequest('Mailbox is outside the managed domain.');
  return u;
}

const asyncRoute = fn => (req, res) => fn(req, res).catch(err => {
  const status = err.status && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[ADMIN EMAIL]', err.message);
  res.status(status).json({ success: false, error: err.message || 'Request failed' });
});

const ok = (res, data = {}) => res.json({ success: true, ...data });

function mapMailbox(m) {
  const a = m.attributes || {};
  return {
    username: m.username,
    name: m.name || '',
    active: Number(m.active) === 1,
    quotaMb: Math.round((Number(m.quota) || 0) / mail.MB),
    usedBytes: Number(m.quota_used) || 0,
    percent: Number(m.percent_in_use) || 0,
    messages: Number(m.messages) || 0,
    created: m.created,
    lastLogin: Math.max(Number(m.last_imap_login) || 0, Number(m.last_smtp_login) || 0, Number(m.last_pop3_login) || 0, Number(m.last_sso_login) || 0) || null,
    forcePasswordChange: a.force_pw_update === '1',
    access: {
      imap: a.imap_access === '1', pop3: a.pop3_access === '1', smtp: a.smtp_access === '1',
      sieve: a.sieve_access === '1', eas: a.eas_access === '1', dav: a.dav_access === '1'
    }
  };
}

function mapAlias(a) {
  return {
    id: a.id, address: a.address, goto: String(a.goto || '').split(',').filter(Boolean),
    active: Number(a.active) === 1, internal: Number(a.internal) === 1, created: a.created
  };
}

// ---------------------------------------------------------------- page
router.get('/', (req, res) => {
  res.render('admin/email', {
    title: 'Email Administration - Embedded India',
    currentPath: '/admin/email',
    currentUser: req.user,
    mailDomain: DOMAIN,
    mailHost: dnsCheck.MAIL_HOST,
    webmailUrl: WEBMAIL_URL
  });
});

// ---------------------------------------------------------------- overview
router.get('/api/overview', asyncRoute(async (req, res) => {
  const [status, domains, mailboxes, aliases, queue] = await Promise.all([
    mail.status(), mail.listDomains(), mail.listMailboxes(), mail.listAliases(),
    mail.listQueue().catch(() => [])
  ]);
  const containers = Object.values(status.containers || {});
  const down = containers.filter(c => c.state !== 'running').map(c => c.container);
  const d = (domains || []).find(x => x.domain_name === DOMAIN) || {};
  ok(res, {
    version: status.version,
    services: { total: containers.length, running: containers.length - down.length, down },
    storage: status.vmail || {},
    domain: {
      name: DOMAIN,
      mailboxes: Number(d.mboxes_in_domain) || (mailboxes || []).length,
      maxMailboxes: Number(d.max_num_mboxes_for_domain) || null,
      aliases: Number(d.aliases_in_domain) || 0,
      bytesUsed: Number(d.bytes_total) || 0,
      maxQuotaMb: Math.round((Number(d.max_quota_for_mbox) || 0) / mail.MB),
      defaultQuotaMb: Math.round((Number(d.def_quota_for_mbox) || 0) / mail.MB),
      relayhost: d.relayhost
    },
    counts: {
      mailboxes: (mailboxes || []).length,
      aliases: (aliases || []).filter(a => a.address !== a.goto).length,
      queued: Array.isArray(queue) ? queue.length : 0
    },
    recent: audit.recent(8)
  });
}));

router.get('/api/dns', asyncRoute(async (req, res) => {
  const dkim = await mail.getDkim(DOMAIN).catch(() => ({}));
  ok(res, await dnsCheck.check({ dkimExpected: dkim && dkim.dkim_txt, fresh: req.query.fresh === '1' }));
}));

// ---------------------------------------------------------------- mailboxes
router.get('/api/mailboxes', asyncRoute(async (req, res) => {
  ok(res, { mailboxes: (await mail.listMailboxes() || []).map(mapMailbox) });
}));

router.post('/api/mailboxes', writeLimiter, asyncRoute(async (req, res) => {
  const localPart = String(req.body.localPart || '').trim().toLowerCase();
  if (!LOCAL_RE.test(localPart)) throw new BadRequest('Use letters, numbers, dots, dashes or underscores for the address.');
  const name = String(req.body.name || '').trim().slice(0, 100);
  const quotaMb = Math.round(Number(req.body.quotaMb));
  if (!Number.isFinite(quotaMb) || quotaMb < 50 || quotaMb > 1024 * 100) throw new BadRequest('Quota must be between 50 MB and 100 GB.');
  const generated = !req.body.password;
  const password = generated ? generatePassword() : checkPassword(req.body.password);
  const forcePasswordChange = req.body.forcePasswordChange !== false;
  const username = `${localPart}@${DOMAIN}`;
  try {
    await mail.addMailbox({ localPart, domain: DOMAIN, name, quotaMb, password, forcePasswordChange });
  } catch (err) {
    audit.record(req, 'mailbox.create', username, { error: err.message }, false);
    throw err;
  }
  audit.record(req, 'mailbox.create', username, { name, quotaMb, forcePasswordChange });
  // The password is returned once so the admin can hand it over; it is never stored here.
  ok(res, { username, password, generated, relayNote: 'Add this address to Oracle Email Delivery approved senders so it can send outside the domain.' });
}));

router.patch('/api/mailboxes/:username', writeLimiter, asyncRoute(async (req, res) => {
  const username = ownMailbox(req.params.username);
  const attr = {};
  const changes = {};
  if (req.body.name !== undefined) { attr.name = String(req.body.name).trim().slice(0, 100); changes.name = attr.name; }
  if (req.body.quotaMb !== undefined) {
    const q = Math.round(Number(req.body.quotaMb));
    if (!Number.isFinite(q) || q < 50 || q > 1024 * 100) throw new BadRequest('Quota must be between 50 MB and 100 GB.');
    attr.quota = String(q); changes.quotaMb = q;
  }
  if (req.body.active !== undefined) { attr.active = req.body.active ? '1' : '0'; changes.active = !!req.body.active; }
  if (req.body.access && typeof req.body.access === 'object') {
    const map = { imap: 'imap_access', pop3: 'pop3_access', smtp: 'smtp_access', sieve: 'sieve_access', eas: 'eas_access', dav: 'dav_access' };
    const protocols = [];
    for (const [k, field] of Object.entries(map)) {
      if (req.body.access[k]) protocols.push(field.replace('_access', ''));
    }
    // mailcow expects the list of enabled protocols
    attr.protocol_access = protocols;
    changes.access = protocols;
  }
  if (!Object.keys(attr).length) throw new BadRequest('Nothing to change.');
  await mail.editMailbox(username, attr);
  audit.record(req, 'mailbox.update', username, changes);
  ok(res);
}));

router.post('/api/mailboxes/:username/password', writeLimiter, asyncRoute(async (req, res) => {
  const username = ownMailbox(req.params.username);
  const generated = !req.body.password;
  const password = generated ? generatePassword() : checkPassword(req.body.password);
  const forceChange = req.body.forcePasswordChange !== false;
  await mail.setMailboxPassword(username, password, forceChange);
  audit.record(req, 'mailbox.password_reset', username, { forceChange, generated });
  ok(res, { username, password, generated });
}));

router.delete('/api/mailboxes/:username', writeLimiter, asyncRoute(async (req, res) => {
  const username = ownMailbox(req.params.username);
  if (String(req.body.confirm || '').toLowerCase() !== username) throw new BadRequest('Type the full address to confirm deletion.');
  await mail.deleteMailbox(username);
  audit.record(req, 'mailbox.delete', username);
  ok(res);
}));

// ---------------------------------------------------------------- aliases
router.get('/api/aliases', asyncRoute(async (req, res) => {
  const aliases = (await mail.listAliases() || []).filter(a => a.address !== a.goto).map(mapAlias);
  ok(res, { aliases });
}));

function cleanGoto(value) {
  const list = (Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/)).map(v => v.trim()).filter(Boolean);
  if (!list.length) throw new BadRequest('Add at least one destination address.');
  if (list.length > 20) throw new BadRequest('At most 20 destinations.');
  return list.map(v => cleanEmail(v, 'Destination')).join(',');
}

router.post('/api/aliases', writeLimiter, asyncRoute(async (req, res) => {
  const local = String(req.body.localPart || '').trim().toLowerCase();
  if (!LOCAL_RE.test(local)) throw new BadRequest('Alias address is not valid.');
  const address = `${local}@${DOMAIN}`;
  const goto = cleanGoto(req.body.goto);
  await mail.addAlias({ address, goto });
  audit.record(req, 'alias.create', address, { goto });
  ok(res, { address });
}));

router.patch('/api/aliases/:id', writeLimiter, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest('Invalid alias.');
  const attr = {};
  if (req.body.goto !== undefined) attr.goto = cleanGoto(req.body.goto);
  if (req.body.active !== undefined) attr.active = req.body.active ? '1' : '0';
  if (!Object.keys(attr).length) throw new BadRequest('Nothing to change.');
  await mail.editAlias(id, attr);
  audit.record(req, 'alias.update', String(req.body.address || id), attr);
  ok(res);
}));

router.delete('/api/aliases/:id', writeLimiter, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest('Invalid alias.');
  await mail.deleteAlias(id);
  audit.record(req, 'alias.delete', String(req.body.address || id));
  ok(res);
}));

// ---------------------------------------------------------------- queue
router.get('/api/queue', asyncRoute(async (req, res) => {
  const q = await mail.listQueue();
  const items = (Array.isArray(q) ? q : []).map(m => ({
    qid: m.queue_id, sender: m.sender, recipients: (m.recipients || []).map(r => r.address || r).slice(0, 10),
    reason: (m.recipients || []).map(r => r.delay_reason).filter(Boolean)[0] || '',
    size: m.message_size, arrival: m.arrival_time ? new Date(m.arrival_time * 1000).toISOString() : null,
    queue: m.queue_name
  }));
  ok(res, { items });
}));

router.post('/api/queue/flush', writeLimiter, asyncRoute(async (req, res) => {
  await mail.flushQueue();
  audit.record(req, 'queue.flush', 'all');
  ok(res);
}));

router.post('/api/queue/:qid/:action', writeLimiter, asyncRoute(async (req, res) => {
  const { qid, action } = req.params;
  if (!QID_RE.test(qid)) throw new BadRequest('Invalid queue id.');
  if (action === 'delete') await mail.deleteQueued(qid);
  else if (['deliver', 'hold', 'unhold'].includes(action)) await mail.queueAction(qid, action);
  else throw new BadRequest('Unknown action.');
  audit.record(req, `queue.${action}`, qid);
  ok(res);
}));

// ---------------------------------------------------------------- quarantine
router.get('/api/quarantine', asyncRoute(async (req, res) => {
  const q = await mail.listQuarantine();
  const items = (Array.isArray(q) ? q : []).map(m => ({
    id: m.id, sender: m.sender, rcpt: m.rcpt, subject: m.subject, score: m.score,
    action: m.action, virus: m.virus_flag === 1 || m.virus_flag === '1', created: m.created ? new Date(m.created * 1000).toISOString() : null
  }));
  ok(res, { items });
}));

router.post('/api/quarantine/:id/:action', writeLimiter, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest('Invalid item.');
  if (req.params.action === 'release') await mail.releaseQuarantined(id);
  else if (req.params.action === 'delete') await mail.deleteQuarantined(id);
  else throw new BadRequest('Unknown action.');
  audit.record(req, `quarantine.${req.params.action}`, String(id));
  ok(res);
}));

// ---------------------------------------------------------------- security
router.get('/api/security', asyncRoute(async (req, res) => {
  const f = await mail.getFail2ban();
  const bans = Array.isArray(f.active_bans) ? f.active_bans : [];
  ok(res, {
    banTime: f.ban_time, maxAttempts: f.max_attempts, retryWindow: f.retry_window,
    bans: bans.map(b => ({ network: b.network || b.ip, bannedUntil: b.banned_until, queued: !!b.queued_for_unban })),
    allowlist: String(f.whitelist || '').split(/\s+/).filter(Boolean)
  });
}));

router.post('/api/security/unban', writeLimiter, asyncRoute(async (req, res) => {
  const network = String(req.body.network || '').trim();
  if (!/^[0-9a-f.:]{3,45}(\/\d{1,3})?$/i.test(network)) throw new BadRequest('Invalid IP address or network.');
  await mail.unban(network);
  audit.record(req, 'security.unban', network);
  ok(res);
}));

// ---------------------------------------------------------------- logs & activity
router.get('/api/logs', asyncRoute(async (req, res) => {
  const service = String(req.query.service || 'postfix');
  if (!SERVICES[service]) throw new BadRequest('Unknown log.');
  const n = Math.min(Math.max(Number(req.query.n) || 100, 10), 500);
  const rows = await mail.logs(service, n);
  const lines = (Array.isArray(rows) ? rows : []).map(r => service === 'rspamd-history'
    ? { time: r.unix_time ? new Date(r.unix_time * 1000).toISOString() : null, level: r.action, text: `${r.action} score ${Number(r.score).toFixed(1)}/${r.required_score} · ${r.sender_smtp || '?'} → ${(r.rcpt_smtp || []).join(', ')} · ${r.subject || ''}` }
    : { time: r.time ? new Date(Number(r.time) * 1000).toISOString() : null, level: r.priority, text: `${r.program ? r.program + ': ' : ''}${r.message || ''}` });
  ok(res, { service, label: SERVICES[service], services: SERVICES, lines });
}));

router.get('/api/activity', asyncRoute(async (req, res) => {
  ok(res, { entries: audit.recent(req.query.limit || 100) });
}));

// ---------------------------------------------------------------- share setup guide
router.post('/api/share-setup', writeLimiter, asyncRoute(async (req, res) => {
  const recipientEmail = cleanEmail(req.body.recipientEmail, 'Recipient');
  const mailboxEmail = ownMailbox(req.body.mailboxEmail);
  const password = req.body.password ? String(req.body.password).slice(0, 128) : null;
  const result = await mailer.sendMailboxCredentials({
    recipientEmail, mailboxEmail, password,
    displayName: String(req.body.displayName || mailboxEmail.split('@')[0]).slice(0, 100),
    webmailUrl: WEBMAIL_URL,
    activeSyncUrl: `https://${dnsCheck.MAIL_HOST}/Microsoft-Server-ActiveSync`,
    imapHost: `${dnsCheck.MAIL_HOST}:993 (SSL/TLS)`,
    smtpHost: `${dnsCheck.MAIL_HOST}:465 (SSL/TLS) or 587 (STARTTLS)`
  });
  audit.record(req, 'mailbox.share_setup', mailboxEmail, { recipientEmail, includedPassword: !!password }, !!result.success);
  if (!result.success) throw Object.assign(new Error(result.error || 'Could not send the email.'), { status: 502 });
  ok(res, { message: `Setup guide sent to ${recipientEmail}.` });
}));

module.exports = router;
