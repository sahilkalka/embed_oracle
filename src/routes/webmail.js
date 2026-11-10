// src/routes/webmail.js
// Native Microsoft Outlook Web Webmail Client Routes with Live Dovecot IMAP/SMTP Integration
// Uses signed JWT HTTP-only cookies for cluster-resilient session authentication

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mailboxService = require('../services/mailboxService');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'embeddedindia_mailbox_jwt_secret_999';
const COOKIE_NAME = 'webmail_auth';

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Helper to extract authenticated mailbox user from JWT cookie
function getMailboxUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// GET /webmail - Main Webmail View or Outlook Login Page
router.get('/', (req, res) => {
  const user = getMailboxUser(req);
  if (user) {
    return res.render('webmail/index', { user });
  }
  return res.render('webmail/login', {
    error: req.query.error || null,
    registeredEmail: req.query.email || ''
  });
});

// POST /webmail/login - Authenticate with Live Mail Server
router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const isDemo = req.body.demo === 'true';

    if (isDemo) {
      const demoToken = jwt.sign(
        {
          email: 'sahil@embeddedindia.in',
          name: 'Sahil Kalka',
          avatar: 'SK',
          isDemo: true
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.cookie(COOKIE_NAME, demoToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true, redirect: '/webmail' });
      }
      return res.redirect('/webmail');
    }

    if (!email || !password) {
      const msg = 'Please enter both your email address and password.';
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({ success: false, error: msg });
      }
      return res.render('webmail/login', { error: msg, registeredEmail: email });
    }

    // Authenticate with live Dovecot IMAP
    const authResult = await mailboxService.authenticate(email, password);

    if (!authResult.success) {
      const errorMsg = 'That account or password is not correct. Verify your credentials or reset your password via the Email Admin console.';
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ success: false, error: errorMsg });
      }
      return res.render('webmail/login', { error: errorMsg, registeredEmail: email });
    }

    const usernamePart = email.split('@')[0];
    const displayName = usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1);
    const initials = (usernamePart.slice(0, 2)).toUpperCase();

    const authToken = jwt.sign(
      {
        email,
        password,
        name: displayName,
        avatar: initials,
        isDemo: false
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(COOKIE_NAME, authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, redirect: '/webmail' });
    }
    return res.redirect('/webmail');
  } catch (err) {
    console.error('[Webmail Login Error]', err);
    const msg = 'Unable to connect to the mail server. Please try again or contact your administrator.';
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(500).json({ success: false, error: msg });
    }
    return res.render('webmail/login', { error: msg, registeredEmail: req.body.email || '' });
  }
});

// GET & POST /webmail/logout
router.all('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
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

// GET /webmail/api/folders - List Folders
router.get('/api/folders', requireMailbox, async (req, res) => {
  const mb = req.mailbox;
  if (mb.isDemo) {
    return res.json([
      { name: 'Inbox', path: 'INBOX', unread: 3 },
      { name: 'Sent Items', path: 'Sent', unread: 0 },
      { name: 'Drafts', path: 'Drafts', unread: 1 },
      { name: 'Deleted Items', path: 'Trash', unread: 0 },
      { name: 'Junk Email', path: 'Junk', unread: 0 },
      { name: 'Archive', path: 'Archive', unread: 0 }
    ]);
  }

  try {
    const folders = await mailboxService.listFolders(mb.email, mb.password);
    res.json(folders);
  } catch (err) {
    console.error('[Webmail API] listFolders error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve folders from mail server' });
  }
});

// GET /webmail/api/messages - Fetch Messages
router.get('/api/messages', requireMailbox, async (req, res) => {
  const mb = req.mailbox;
  const folder = req.query.folder || 'INBOX';

  if (mb.isDemo) {
    return res.json([
      {
        uid: 0,
        sender: 'Rajesh Kumar • Tata Elxsi',
        senderEmail: 'rajesh.kumar@tataelxsi.com',
        subject: 'RFQ: STM32MP157 SOM Custom Board Design & BSP',
        snippet: 'Hi Sahil, we reviewed your Embedded India case studies on Yocto Linux BSP development...',
        date: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        unread: true
      },
      {
        uid: 1,
        sender: 'Ananya Sharma • IoT Edge Systems',
        senderEmail: 'ananya.sharma@iot-edge.io',
        subject: 'Consultation: Embedded Linux Qt6 HMI Gateway',
        snippet: 'Thanks for the quick response on our RFQ. Can we schedule a 30-minute technical review...',
        date: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        unread: true
      },
      {
        uid: 2,
        sender: 'Embedded India Postmaster',
        senderEmail: 'postmaster@embeddedindia.in',
        subject: 'DKIM & ARC Cryptographic Signing Verified',
        snippet: 'Automatic security alert: 2048-bit DKIM selector (dkim._domainkey.embeddedindia.in) is active...',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        unread: true
      },
      {
        uid: 3,
        sender: 'Vikram Mehta • BHEL Industrial',
        senderEmail: 'vikram.mehta@bhel.in',
        subject: 'PO Confirmation: Modbus RS-485 DAQ Modules',
        snippet: 'Please find the formal purchase order for the RS-485 DAQ controllers attached for dispatch...',
        date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        unread: false
      }
    ]);
  }

  try {
    const messages = await mailboxService.fetchMessages(mb.email, mb.password, { folder, limit: 30 });
    res.json(messages);
  } catch (err) {
    console.error('[Webmail API] fetchMessages error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve messages from folder ' + folder });
  }
});

// GET /webmail/api/message/:uid - Full Message Body
router.get('/api/message/:uid', requireMailbox, async (req, res) => {
  const mb = req.mailbox;
  const folder = req.query.folder || 'INBOX';
  const uid = req.params.uid;

  if (mb.isDemo) {
    const dummyBodies = {
      '0': {
        subject: 'RFQ: STM32MP157 SOM Custom Board Design & BSP',
        from: 'Rajesh Kumar <rajesh.kumar@tataelxsi.com>',
        to: 'sahil@embeddedindia.in',
        date: new Date().toISOString(),
        html: `<p>Hi Sahil,</p>
               <p>We reviewed your recent Embedded India case studies on high-reliability <strong>STM32MP157</strong> hardware development and Linux Board Support Package (BSP) bring-up.</p>
               <p>Our engineering division is building an industrial edge telematics controller requiring:</p>
               <ul style="margin: 0 0 16px 24px; list-style-type: disc;">
                 <li>Custom 6-layer impedance-controlled carrier board for STM32MP157C dual Cortex-A7 + Cortex-M4.</li>
                 <li>Dual Gigabit Ethernet with IEEE 1588 PTP, CAN FD, and isolated RS-485 interfaces.</li>
                 <li>Custom Yocto Scarthgap Linux BSP with hardware-accelerated TouchGFX / Qt6 framebuffers.</li>
               </ul>
               <p>We would like to request an engineering proposal and timeline for Phase 1. Please find our initial pin-mapping requirements attached.</p>`
      },
      '1': {
        subject: 'Consultation: Embedded Linux Qt6 HMI Gateway',
        from: 'Ananya Sharma <ananya.sharma@iot-edge.io>',
        to: 'sahil@embeddedindia.in',
        date: new Date().toISOString(),
        html: `<p>Dear Sahil,</p>
               <p>Thanks for the quick response on our RFQ. Can we schedule a 30-minute technical review call tomorrow at 3:00 PM IST?</p>
               <p>We want to align on our hardware requirements for the NXP i.MX8M Plus application processor, specifically relating to secure boot authentication and high-refresh touchscreen display drivers.</p>`
      },
      '2': {
        subject: 'DKIM & ARC Cryptographic Signing Verified',
        from: 'Embedded India Postmaster <postmaster@embeddedindia.in>',
        to: 'admin@embeddedindia.in',
        date: new Date().toISOString(),
        html: `<p>Hello Administrator,</p>
               <p>The automated cryptographic signing check for domain <strong>embeddedindia.in</strong> has passed all security validations:</p>
               <ul style="margin: 0 0 16px 24px; list-style-type: disc;">
                 <li><strong>DKIM:</strong> 2048-bit RSA key valid on selector <code>dkim._domainkey.embeddedindia.in</code></li>
                 <li><strong>SPF:</strong> <code>v=spf1 mx a:mail.embeddedindia.in ~all</code> validated</li>
                 <li><strong>DMARC:</strong> Alignment status PASS with policy <code>p=quarantine</code></li>
               </ul>`
      },
      '3': {
        subject: 'PO Confirmation: Modbus RS-485 DAQ Modules',
        from: 'Vikram Mehta <vikram.mehta@bhel.in>',
        to: 'sahil@embeddedindia.in',
        date: new Date().toISOString(),
        html: `<p>Dear Sahil,</p>
               <p>Please find attached our formal Purchase Order <strong>#PO-49201</strong> for the 25 units of industrial isolated RS-485 DAQ interface controllers.</p>
               <p>Kindly verify the delivery schedule against our purchase agreement and send across the dispatch tracking once shipped.</p>`
      }
    };
    return res.json(dummyBodies[uid] || dummyBodies['0']);
  }

  try {
    const message = await mailboxService.getMessage(mb.email, mb.password, { folder, uid });
    res.json(message);
  } catch (err) {
    console.error('[Webmail API] getMessage error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve message ' + uid });
  }
});

// POST /webmail/api/send - Send Email via SMTP
router.post('/api/send', requireMailbox, async (req, res) => {
  const mb = req.mailbox;
  const { to, subject, html, text } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'Recipient address and subject are required.' });
  }

  if (mb.isDemo) {
    return res.json({ success: true, messageId: 'demo-' + Date.now() });
  }

  try {
    const info = await mailboxService.sendMail(mb.email, mb.password, { to, subject, html, text });
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[Webmail API] sendMail error:', err.message);
    res.status(500).json({ error: 'Failed to send email: ' + (err.message || 'SMTP delivery error') });
  }
});

// POST /webmail/api/delete - Delete or Move to Trash
router.post('/api/delete', requireMailbox, async (req, res) => {
  const mb = req.mailbox;
  const { folder = 'INBOX', uid } = req.body;

  if (mb.isDemo) {
    return res.json({ success: true });
  }

  try {
    await mailboxService.deleteMessage(mb.email, mb.password, { folder, uid });
    res.json({ success: true });
  } catch (err) {
    console.error('[Webmail API] deleteMessage error:', err.message);
    res.status(500).json({ error: 'Failed to delete message: ' + err.message });
  }
});

module.exports = router;
