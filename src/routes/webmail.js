// src/routes/webmail.js
// Interim webmail client routes (live Dovecot IMAP/SMTP).
// NOTE: This is a stop-gap. Production webmail moves to https://mail.embeddedindia.in/
// and this router will be replaced by redirects.
//
// Session model: a JWT in an HttpOnly cookie, signed with a webmail-only key (never the
// admin key), carrying the mailbox password AES-256-GCM encrypted (never plaintext).

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const mailboxService = require('../services/mailboxService');

const COOKIE_NAME = 'webmail_auth';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

const purify = createDOMPurify(new JSDOM('').window);

// Derive independent signing and encryption keys so a webmail token can never be
// accepted anywhere else (and vice versa).
function deriveKeys() {
  let base = process.env.WEBMAIL_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!base || base.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[WEBMAIL] WEBMAIL_JWT_SECRET (or ADMIN_JWT_SECRET) must be at least 32 characters in production.');
    }
    base = crypto.randomBytes(48).toString('hex');
  }
  const hkdf = (label) => Buffer.from(crypto.hkdfSync('sha256', base, 'embeddedindia-webmail', label, 32));
  return { signKey: hkdf('jwt-sign'), encKey: hkdf('password-enc') };
}
const { signKey, encKey } = deriveKeys();

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function decryptSecret(blob) {
  const buf = Buffer.from(String(blob), 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  };
}

function wantsJson(req) {
  return req.xhr || req.headers.accept?.includes('json');
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Returns { email, password, name, avatar } or null.
function getMailboxUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, signKey, { algorithms: ['HS256'], audience: 'webmail' });
    if (!claims.email || !claims.pw) return null;
    return { email: claims.email, password: decryptSecret(claims.pw), name: claims.name, avatar: claims.avatar };
  } catch (err) {
    return null;
  }
}

// GET /webmail - Main Webmail View or Login Page
router.get('/', (req, res) => {
  const user = getMailboxUser(req);
  if (user) {
    // Never expose the password to the template.
    return res.render('webmail/index', { user: { email: user.email, name: user.name, avatar: user.avatar } });
  }
  return res.render('webmail/login', {
    error: req.query.error ? 'Please sign in again.' : null,
    registeredEmail: typeof req.query.email === 'string' ? req.query.email : ''
  });
});

// POST /webmail/login - Authenticate with Live Mail Server
router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fail = (status, msg) => {
    if (wantsJson(req)) return res.status(status).json({ success: false, error: msg });
    return res.status(status).render('webmail/login', { error: msg, registeredEmail: email });
  };

  try {
    if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(400, 'Please enter your full email address and password.');
    }

    const authResult = await mailboxService.authenticate(email, password);
    if (!authResult.success) {
      return fail(401, 'That account or password is not correct.');
    }

    const usernamePart = email.split('@')[0];
    const token = jwt.sign(
      {
        email,
        pw: encryptSecret(password),
        name: usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1),
        avatar: usernamePart.slice(0, 2).toUpperCase()
      },
      signKey,
      { algorithm: 'HS256', audience: 'webmail', expiresIn: SESSION_TTL_SECONDS }
    );
    res.cookie(COOKIE_NAME, token, cookieOptions());

    if (wantsJson(req)) return res.json({ success: true, redirect: '/webmail' });
    return res.redirect('/webmail');
  } catch (err) {
    console.error('[Webmail Login Error]', err.message);
    return fail(500, 'Unable to connect to the mail server. Please try again or contact your administrator.');
  }
});

// POST /webmail/logout (CSRF-protected)
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/webmail');
});

// Middleware to protect API routes
function requireMailbox(req, res, next) {
  const user = getMailboxUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Mailbox session required' });
  }
  req.mailbox = user;
  next();
}

function cleanFolder(value) {
  const folder = typeof value === 'string' && value.trim() ? value.trim() : 'INBOX';
  if (folder.length > 200 || /[\r\n\0]/.test(folder)) return 'INBOX';
  return folder;
}

function cleanUid(value) {
  const uid = String(value || '');
  return /^\d{1,12}$/.test(uid) ? uid : null;
}

// Strip header-injection characters from any user value placed into a mail header.
function headerSafe(value, max = 998) {
  return String(value || '').replace(/[\r\n\0]/g, ' ').trim().slice(0, max);
}

// Sanitize untrusted message HTML: no scripts, handlers, forms, frames or remote-loaded objects.
function sanitizeEmailHtml(html) {
  return purify.sanitize(String(html), {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'formaction', 'action', 'ping'],
    ALLOW_DATA_ATTR: false
  });
}

// GET /webmail/api/folders - List Folders
router.get('/api/folders', requireMailbox, async (req, res) => {
  try {
    const folders = await mailboxService.listFolders(req.mailbox.email, req.mailbox.password);
    res.json(folders);
  } catch (err) {
    console.error('[Webmail API] listFolders error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve folders from mail server' });
  }
});

// GET /webmail/api/messages - Fetch Messages
router.get('/api/messages', requireMailbox, async (req, res) => {
  const folder = cleanFolder(req.query.folder);
  try {
    const messages = await mailboxService.fetchMessages(req.mailbox.email, req.mailbox.password, { folder, limit: 30 });
    res.json(messages);
  } catch (err) {
    console.error('[Webmail API] fetchMessages error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve messages from this folder' });
  }
});

// GET /webmail/api/message/:uid - Full Message Body (HTML sanitized server-side)
router.get('/api/message/:uid', requireMailbox, async (req, res) => {
  const folder = cleanFolder(req.query.folder);
  const uid = cleanUid(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'Invalid message id' });

  try {
    const message = await mailboxService.getMessage(req.mailbox.email, req.mailbox.password, { folder, uid });
    if (message && message.html) message.html = sanitizeEmailHtml(message.html);
    res.json(message);
  } catch (err) {
    console.error('[Webmail API] getMessage error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve message' });
  }
});

// POST /webmail/api/send - Send Email via SMTP
router.post('/api/send', requireMailbox, async (req, res) => {
  const to = headerSafe(req.body.to);
  const subject = headerSafe(req.body.subject);
  const text = typeof req.body.text === 'string' ? req.body.text : '';
  const html = typeof req.body.html === 'string' ? sanitizeEmailHtml(req.body.html) : '';

  if (!to || !subject) {
    return res.status(400).json({ error: 'Recipient address and subject are required.' });
  }

  try {
    const info = await mailboxService.sendMail(req.mailbox.email, req.mailbox.password, { to, subject, html, text });
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[Webmail API] sendMail error:', err.message);
    res.status(500).json({ error: 'Failed to send email. Please check the recipient address and try again.' });
  }
});

// POST /webmail/api/delete - Delete or Move to Trash
router.post('/api/delete', requireMailbox, async (req, res) => {
  const folder = cleanFolder(req.body.folder);
  const uid = cleanUid(req.body.uid);
  if (!uid) return res.status(400).json({ error: 'Invalid message id' });

  try {
    await mailboxService.deleteMessage(req.mailbox.email, req.mailbox.password, { folder, uid });
    res.json({ success: true });
  } catch (err) {
    console.error('[Webmail API] deleteMessage error:', err.message);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

module.exports = router;
