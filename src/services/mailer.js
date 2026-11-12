// src/services/mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const prisma = require('./db');

let transporter = null;
let lastSmtpConfigHash = '';

const EMAIL_SIMPLE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isEmailAddress(value) {
  return EMAIL_SIMPLE_RE.test(String(value || '').trim());
}

function parseFromEmail(rawFrom) {
  const s = String(rawFrom || '').trim();
  const match = s.match(/<([^>]+)>/);
  const candidate = match ? match[1].trim() : s;
  return isEmailAddress(candidate) ? candidate : '';
}

async function loadSettingsMap() {
  try {
    const settings = await prisma.setting.findMany();
    return settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  } catch (e) {
    return {};
  }
}

async function resolveMailConfig(overrides = {}) {
  const map = await loadSettingsMap();
  const host = String(overrides.host || map.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(overrides.port || map.smtp_port || process.env.SMTP_PORT || 587);
  const user = String(overrides.user !== undefined ? overrides.user : (map.smtp_user || process.env.SMTP_USER || '')).trim();
  const pass = String(overrides.pass !== undefined ? overrides.pass : (map.smtp_pass || process.env.SMTP_PASS || ''));

  const isPort465 = port === 465;
  const explicitSecure = overrides.secure !== undefined
    ? (overrides.secure === true || overrides.secure === 'true')
    : (map.smtp_secure !== undefined
      ? map.smtp_secure === 'true'
      : process.env.SMTP_SECURE === 'true');
  const secure = isPort465 || (explicitSecure && port !== 587);
  const requireTLS = port === 587;

  const envFromEmail = parseFromEmail(process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM);
  const fromEmail = String(
    overrides.fromEmail ||
    map.smtp_from_email ||
    envFromEmail ||
    (isEmailAddress(user) ? user : '') ||
    'info@embeddedindia.in'
  ).trim();

  const fromName = String(
    overrides.fromName ||
    map.smtp_from_name ||
    map.site_name ||
    'Embedded India'
  ).trim();

  return { map, host, port, secure, requireTLS, user, pass, fromEmail, fromName };
}

function isPlaceholderCredentials(user, pass) {
  return !user || !pass ||
    pass === 'your-smtp-app-password' ||
    user === 'test@ethereal.email' ||
    user === 'mock';
}

function buildSmtpTransport({ host, port, secure, requireTLS, user, pass, timeouts = {} }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: host === '127.0.0.1' || host === 'localhost' ? false : true
    },
    connectionTimeout: timeouts.connection || 15000,
    greetingTimeout: timeouts.greeting || 10000,
    socketTimeout: timeouts.socket || 15000
  });
}

/**
 * Build or retrieve the Nodemailer transporter instance
 */
async function getTransporter() {
  try {
    const cfg = await resolveMailConfig();
    const { host, port, secure, requireTLS, user, pass } = cfg;
    const currentHash = `${host}:${port}:${secure}:${requireTLS}:${user}:${pass}:${cfg.fromEmail}:${cfg.fromName}`;

    if (!transporter || currentHash !== lastSmtpConfigHash) {
      lastSmtpConfigHash = currentHash;

      if (!isPlaceholderCredentials(user, pass)) {
        transporter = buildSmtpTransport({ host, port, secure, requireTLS, user, pass });
        transporter.isMock = false;
      } else {
        transporter = {
          isMock: true,
          verify: async () => true,
          sendMail: async (mailOptions) => {
            console.log('\n================== [LOCAL EMAIL DISPATCH] ==================');
            console.log(`From:    ${mailOptions.from}`);
            console.log(`To:      ${mailOptions.to}`);
            console.log(`Reply-To:${mailOptions.replyTo}`);
            console.log(`Subject: ${mailOptions.subject}`);
            console.log(`Envelope:${JSON.stringify(mailOptions.envelope)}`);
            console.log(`Preview: ${mailOptions.text ? mailOptions.text.slice(0, 200) : 'HTML Email'}`);
            console.log('============================================================\n');
            return {
              messageId: 'simulated-msg-' + Date.now() + '@embeddedindia.in',
              accepted: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
              rejected: [],
              response: '250 2.0.0 OK: Simulated dev email accepted'
            };
          }
        };
      }
    }
    transporter._mailConfig = cfg;
  } catch (err) {
    console.error('[MAILER] Error creating SMTP transport:', err.message);
  }

  return transporter;
}

async function getReadyTransporter({ allowMockInDev = true } = {}) {
  const t = await getTransporter();
  if (!t) return { error: 'No transporter configured' };
  if (t.isMock && (!allowMockInDev || process.env.NODE_ENV === 'production')) {
    return { error: 'SMTP is not configured. Save valid SMTP credentials in Admin Settings or .env.' };
  }
  return { transporter: t, config: t._mailConfig || await resolveMailConfig() };
}

function recipientSetting(map, key, fallback) {
  const val = map && map[key];
  return (val && String(val).trim()) ? String(val).trim() : fallback;
}

/**
 * Verify live SMTP credentials and connection status
 */
async function verifySmtp() {
  const adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';
  try {
    const t = await getTransporter();
    if (!t) {
      console.warn(`[SMTP ERROR] No transporter configured for ${adminEmail}`);
      return { success: false, error: 'No transporter configured' };
    }

    if (t.isMock) {
      console.log(`[SMTP DEV MODE] Mock transporter active (Enter SMTP credentials in .env or Admin Settings to send live emails).`);
      return { success: true, mock: true, message: 'Mock transporter active' };
    }

    await t.verify();
    console.log(`[SMTP] Ready to send emails from ${(t._mailConfig && t._mailConfig.fromEmail) || adminEmail}`);
    return { success: true, message: `[SMTP] Ready to send emails` };
  } catch (err) {
    const code = err.code || (err.responseCode ? `E${err.responseCode}` : 'EUNKNOWN');
    console.error(`[SMTP ERROR] [${code}] Connection verification failed for ${adminEmail}: ${err.message}`);
    return { success: false, code, error: err.message };
  }
}

/**
 * Test live SMTP server connection and send a test message (Admin UI or CLI)
 */
async function testSmtpConnection(options = {}) {
  const cfg = await resolveMailConfig({
    host: options.host || undefined,
    port: options.port || undefined,
    secure: options.secure !== undefined ? options.secure : undefined,
    user: options.user || undefined,
    pass: options.pass || undefined,
    fromEmail: options.fromEmail || undefined,
    fromName: options.fromName || undefined
  });

  const { host, port, secure, requireTLS, user, pass, fromEmail, fromName } = cfg;
  const toEmail = String(options.toEmail || process.env.ADMIN_EMAIL || 'info@embeddedindia.in').trim();

  if (isPlaceholderCredentials(user, pass)) {
    await new Promise(r => setTimeout(r, 200));
    console.log(`\n[SMTP TEST] Simulated diagnostic email dispatched to: ${toEmail}`);
    return {
      success: true,
      simulated: true,
      messageId: `simulated-smtp-${Date.now()}@embeddedindia.in`,
      accepted: [toEmail],
      rejected: [],
      response: '250 Simulated handshake verified',
      message: `Simulated SMTP handshake & delivery verified to ${toEmail} (Local Dev Mode). To dispatch live external emails, save real SMTP credentials.`
    };
  }

  const testTransporter = buildSmtpTransport({
    host,
    port,
    secure,
    requireTLS,
    user,
    pass,
    timeouts: { connection: 12000, greeting: 8000, socket: 12000 }
  });

  try {
    await testTransporter.verify();

    const info = await testTransporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      replyTo: fromEmail,
      envelope: {
        from: fromEmail,
        to: toEmail
      },
      subject: 'SMTP Configuration Verified - Embedded India',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 540px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #007f5f; margin-top: 0;">Outgoing SMTP Verified</h2>
          <p style="font-size: 14px; color: #334155;">This email confirms that your outgoing mail server configuration for <strong>Embedded India</strong> is working properly.</p>
          <div style="padding: 12px; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 12px; color: #475569;">
            Host: ${escapeHtml(host)}<br>
            Port: ${escapeHtml(port)}<br>
            From: ${escapeHtml(fromEmail)}<br>
            Secure: ${escapeHtml(secure)}<br>
            Timestamp: ${escapeHtml(new Date().toISOString())}
          </div>
        </div>
      `,
      text: `SMTP Configuration Verified for Embedded India on ${host}:${port} (From: ${fromEmail}).`
    });

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted || [toEmail],
      rejected: info.rejected || [],
      response: info.response || '250 Message accepted',
      message: `Live test email delivered to ${toEmail} (Message ID: ${info.messageId})`
    };
  } catch (err) {
    let friendlyError = err.message;
    const code = err.code || 'EUNKNOWN';
    if (code === 'EAUTH') {
      friendlyError = 'SMTP Authentication failed (EAUTH): Invalid username or password.';
    } else if (code === 'ESOCKET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
      friendlyError = `Connection to ${host}:${port} failed (${code}). Check host, port, TLS mode, and firewall rules.`;
    }
    return { success: false, code, error: friendlyError };
  }
}

/**
 * Centralized Mailer Service Object
 */
const mailer = {
  getTransporter,
  verifySmtp,
  testSmtpConnection,

  // 1. Send notification to admin when contact inquiry / RFQ is submitted
  async sendInquiryNotification(inquiry) {
    try {
      const { transporter: t, config, error } = await getReadyTransporter();
      if (error) return { success: false, error };

      const adminEmail = recipientSetting(config.map, 'inquiry_recipient_emails', process.env.ADMIN_EMAIL || 'info@embeddedindia.in');
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const timestamp = inquiry.createdAt ? new Date(inquiry.createdAt).toISOString() : new Date().toISOString();

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: adminEmail,
        replyTo: inquiry.email,
        envelope: {
          from: config.fromEmail,
          to: adminEmail
        },
        subject: `[New Inquiry / RFQ] ${inquiry.subject || inquiry.serviceCategory} - ${inquiry.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #007f5f; padding: 20px; color: white;">
              <h2 style="margin: 0;">New Engineering Consultation Inquiry</h2>
              <p style="margin: 5px 0 0; opacity: 0.9;">Embedded India Customer Portal</p>
            </div>
            <div style="padding: 24px; color: #192c27;">
              <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
              <p><strong>Company:</strong> ${escapeHtml(inquiry.company || 'Not provided')}</p>
              <p><strong>Email:</strong> <a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a></p>
              <p><strong>Phone:</strong> ${escapeHtml(inquiry.phone || 'Not provided')}</p>
              <p><strong>Service Category:</strong> ${escapeHtml(inquiry.serviceCategory)}</p>
              <p><strong>Subject:</strong> ${escapeHtml(inquiry.subject)}</p>
              <p><strong>Timestamp:</strong> ${escapeHtml(timestamp)}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p><strong>Message / Project Details:</strong></p>
              <p style="background: #f8fafc; padding: 15px; border-radius: 6px; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${escapeHtml(inquiry.message)}</p>
              <div style="margin-top: 25px;">
                <a href="${escapeHtml(appUrl)}/admin/inquiries" style="background: #007f5f; color: white; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">View in Admin Dashboard</a>
              </div>
            </div>
          </div>
        `,
        text: `New Inquiry from ${inquiry.name} (${inquiry.email}) | Company: ${inquiry.company || 'N/A'} | Phone: ${inquiry.phone || 'N/A'} | Category: ${inquiry.serviceCategory} | Time: ${timestamp}\n\nMessage:\n${inquiry.message}`
      };

      const res = await t.sendMail(mailOptions);
      console.log(`[SMTP] Inbound inquiry email sent to ${adminEmail} (Msg ID: ${res.messageId})`);
      return { success: true, messageId: res.messageId, accepted: res.accepted, rejected: res.rejected, response: res.response };
    } catch (err) {
      console.error('[MAILER ERROR] Failed to send admin inquiry notification:', err.message);
      return { success: false, error: err.message };
    }
  },

  // 2. Send notification to admin when new newsletter subscription occurs
  async sendNewsletterAdminNotification(subscriber) {
    try {
      const { transporter: t, config, error } = await getReadyTransporter();
      if (error) return { success: false, error };

      const adminEmail = recipientSetting(config.map, 'newsletter_recipient_emails', process.env.ADMIN_EMAIL || 'info@embeddedindia.in');
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const timestamp = subscriber.createdAt ? new Date(subscriber.createdAt).toISOString() : new Date().toISOString();

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: adminEmail,
        replyTo: subscriber.email,
        envelope: {
          from: config.fromEmail,
          to: adminEmail
        },
        subject: `[Newsletter Lead] New Subscription Request - ${subscriber.email}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #007f5f; padding: 20px; color: white;">
              <h2 style="margin: 0;">New Newsletter Subscriber Lead</h2>
              <p style="margin: 5px 0 0; opacity: 0.9;">Embedded India Engineering Portal</p>
            </div>
            <div style="padding: 24px; color: #192c27;">
              <p>A new visitor has subscribed to the Embedded India technical newsletter.</p>
              <p><strong>Subscriber Email:</strong> <a href="mailto:${escapeHtml(subscriber.email)}">${escapeHtml(subscriber.email)}</a></p>
              <p><strong>Status:</strong> <span style="display:inline-block; padding: 2px 8px; border-radius: 4px; background:#e2e8f0; font-weight:bold;">${escapeHtml(subscriber.status)}</span></p>
              <p><strong>Source:</strong> ${escapeHtml(subscriber.source || 'Website')}</p>
              <p><strong>Timestamp:</strong> ${escapeHtml(timestamp)}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p>To review, approve, or export subscriber lists, visit the Admin Dashboard:</p>
              <div style="margin-top: 20px;">
                <a href="${escapeHtml(appUrl)}/admin/subscribers" style="background: #007f5f; color: white; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Manage Subscribers in Admin</a>
              </div>
            </div>
          </div>
        `,
        text: `New Newsletter subscriber from ${subscriber.email} (Status: ${subscriber.status}, Source: ${subscriber.source || 'website'}, Timestamp: ${timestamp}). Review at: ${appUrl}/admin/subscribers`
      };

      const res = await t.sendMail(mailOptions);
      console.log(`[SMTP] Newsletter subscriber notification sent to ${adminEmail} (Msg ID: ${res.messageId})`);
      return { success: true, messageId: res.messageId, accepted: res.accepted, rejected: res.rejected, response: res.response };
    } catch (err) {
      console.error('[MAILER ERROR] Failed to send newsletter admin notification:', err.message);
      return { success: false, error: err.message };
    }
  },

  // 3. Send double-opt-in verification link to subscriber
  async sendVerificationEmail(email, token) {
    try {
      const { transporter: t, config, error } = await getReadyTransporter();
      if (error) return { success: false, error };

      const adminEmail = recipientSetting(config.map, 'newsletter_recipient_emails', process.env.ADMIN_EMAIL || 'info@embeddedindia.in');
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const verifyUrl = `${appUrl}/api/newsletter/verify?token=${encodeURIComponent(token)}`;

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: email,
        replyTo: adminEmail,
        envelope: {
          from: config.fromEmail,
          to: email
        },
        subject: 'Please Confirm Your Subscription - Embedded India',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #007f5f; padding: 20px; color: white;">
              <h2 style="margin: 0;">Embedded India Newsletter</h2>
              <p style="margin: 5px 0 0; opacity: 0.9;">One step away from your free PCB Design Checklist</p>
            </div>
            <div style="padding: 24px; color: #192c27;">
              <p>Hello,</p>
              <p>Thank you for subscribing to Embedded India's weekly technical digest. Please confirm your email address to unlock your free copy of <strong>The 2026 Embedded Hardware &amp; Firmware Design Checklist</strong>.</p>
              <div style="margin: 30px 0; text-align: center;">
                <a href="${escapeHtml(verifyUrl)}" style="background: #007f5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirm My Subscription &amp; Download PDF</a>
              </div>
              <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser: <br><a href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyUrl)}</a></p>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">If you did not request this subscription, you can safely ignore this email.</p>
            </div>
          </div>
        `,
        text: `Please confirm your subscription to Embedded India by visiting: ${verifyUrl}`
      };

      const res = await t.sendMail(mailOptions);
      return { success: true, messageId: res.messageId };
    } catch (err) {
      console.error('[MAILER ERROR] Failed to send verification email:', err.message);
      return { success: false, error: err.message };
    }
  },

  // 4. Send Lead Magnet PDF directly to confirmed/approved subscriber
  async sendLeadMagnetEmail(email) {
    try {
      const { transporter: t, config, error } = await getReadyTransporter({ allowMockInDev: false });
      if (error) return { success: false, error };

      const adminEmail = recipientSetting(config.map, 'newsletter_recipient_emails', process.env.ADMIN_EMAIL || 'info@embeddedindia.in');
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const pdfPath = path.join(__dirname, '../../public/downloads/embedded-design-checklist.pdf');
      if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) {
        return { success: false, error: 'Checklist PDF is missing. Run npm run generate-lead-magnet on the server and retry.' };
      }

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: email,
        replyTo: adminEmail,
        envelope: {
          from: config.fromEmail,
          to: email
        },
        subject: 'Your Free PDF: Embedded Hardware & Firmware Design Checklist',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #007f5f; padding: 20px; color: white;">
              <h2 style="margin: 0;">Welcome to Embedded India!</h2>
            </div>
            <div style="padding: 24px; color: #192c27;">
              <p>Your subscription has been confirmed! As promised, your copy of <strong>The 2026 Embedded Hardware &amp; Firmware Design Checklist</strong> is attached to this email.</p>
              <p>You will now receive our curated weekly engineering roundups featuring:</p>
              <ul>
                <li>High-speed PCB layout techniques (DDR, USB 3.0, Differential Pairs)</li>
                <li>Firmware architecture, RTOS, and TinyML on microcontrollers</li>
                <li>Free access to interactive engineering calculators</li>
              </ul>
              <div style="margin: 25px 0;">
                <a href="${escapeHtml(appUrl)}/tools" style="background: #55a630; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Explore Engineering Tools</a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">To unsubscribe at any time, click <a href="${escapeHtml(appUrl)}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}">here</a>.</p>
            </div>
          </div>
        `,
        text: `Your checklist is ready. Download it from the attachment or visit ${appUrl}`,
        attachments: [{
          filename: 'Embedded-Design-Checklist-2026.pdf',
          path: pdfPath
        }]
      };

      const res = await t.sendMail(mailOptions);
      if (!res.accepted || !res.accepted.some(address => String(address).toLowerCase() === email.toLowerCase())) {
        return { success: false, error: 'Mail server did not accept the recipient. Check SMTP settings and retry.' };
      }
      console.log(`[SMTP] Lead magnet dispatched to ${email} (Msg ID: ${res.messageId})`);
      return { success: true, messageId: res.messageId };
    } catch (err) {
      console.error('[MAILER ERROR] Failed to send lead magnet email:', err.message);
      return { success: false, error: err.message };
    }
  },

  // 5. Share user mailbox setup guide (& optional password) via email
  async sendMailboxCredentials({ recipientEmail, mailboxEmail, password, displayName, webmailUrl, activeSyncUrl, imapHost, smtpHost }) {
    try {
      const { transporter: t, config, error } = await getReadyTransporter();
      if (error) return { success: false, error };

      const webUrl = webmailUrl || 'https://mail.embeddedindia.in/';
      const mailHost = (() => {
        try { return new URL(webUrl).hostname; } catch (_) { return 'mail.embeddedindia.in'; }
      })();
      const davUrl = `https://${mailHost}/dav/`;
      const easUrl = activeSyncUrl || `https://${mailHost}/Microsoft-Server-ActiveSync`;
      const imap = imapHost || `${mailHost}:993 (SSL/TLS)`;
      const smtp = smtpHost || `${mailHost}:465 (SSL/TLS) or 587 (STARTTLS)`;
      const hasPassword = typeof password === 'string' && password.length > 0;
      const safeName = escapeHtml(displayName || 'Team Member');

      const passwordRowHtml = hasPassword
        ? `<div style="font-size: 14px; margin-top: 6px;"><strong>Password:</strong> <code style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 14px;">${escapeHtml(password)}</code></div>
           <div style="font-size: 12px; color: #64748b; margin-top: 6px;">You may be asked to set a new password when you sign in for the first time.</div>`
        : `<div style="font-size: 13px; color: #475569; margin-top: 6px;">Sign in with your current mailbox password. You can change it anytime in Webmail under <em>Settings &rarr; Password</em>.</div>`;

      const mailOptions = {
        from: `"Embedded India Mail" <${config.fromEmail}>`,
        to: recipientEmail,
        replyTo: config.fromEmail,
        envelope: {
          from: config.fromEmail,
          to: recipientEmail
        },
        subject: `Your Embedded India Mail Account & Setup Guide (${mailboxEmail})`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
            <div style="background-color: #007f5f; padding: 24px 28px; color: #ffffff;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9;">Embedded India Mail</div>
              <h1 style="margin: 6px 0 0; font-size: 22px; font-weight: 700;">Your Email Account &amp; Setup Guide</h1>
            </div>

            <div style="padding: 28px; color: #192c27; line-height: 1.6;">
              <p style="margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              <p>Your mailbox on <strong>Embedded India Mail</strong> is ready. Below are your account details and setup instructions for webmail, desktop, and mobile apps:</p>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
                <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">Account Details</div>
                <div style="font-size: 14px;"><strong>Email Address:</strong> <code style="font-family: monospace; color: #007f5f; font-size: 15px;">${escapeHtml(mailboxEmail)}</code></div>
                ${passwordRowHtml}
              </div>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${escapeHtml(webUrl)}" style="background-color: #007f5f; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                  Open Embedded India Mail
                </a>
              </div>

              <h3 style="font-size: 16px; font-weight: 700; color: #0d1715; margin: 24px 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                Connecting Mail, Contacts &amp; Calendar Apps
              </h3>

              <div style="margin-bottom: 14px;">
                <h4 style="margin: 0 0 4px; font-size: 14px; color: #007f5f;">Desktop &amp; Mobile (IMAP / SMTP)</h4>
                <p style="margin: 0; font-size: 13px; color: #475569;">
                  Username: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(mailboxEmail)}</code><br>
                  Incoming IMAP: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(imap)}</code><br>
                  Outgoing SMTP: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(smtp)}</code>
                </p>
              </div>

              <div style="margin-bottom: 14px;">
                <h4 style="margin: 0 0 4px; font-size: 14px; color: #007f5f;">Contacts &amp; Calendar Sync (CardDAV / CalDAV)</h4>
                <p style="margin: 0; font-size: 13px; color: #475569;">
                  Server URL: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(davUrl)}</code>
                </p>
              </div>

              <div style="margin-bottom: 8px;">
                <h4 style="margin: 0 0 4px; font-size: 14px; color: #007f5f;">Exchange ActiveSync (Outlook / iOS / Android)</h4>
                <p style="margin: 0; font-size: 13px; color: #475569;">
                  Server: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(mailHost)}</code> &bull; ActiveSync URL: <code style="background: #f1f5f9; padding: 1px 4px;">${escapeHtml(easUrl)}</code> (SSL/TLS, port 443)
                </p>
              </div>
            </div>

            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; font-size: 11px; color: #64748b; text-align: center;">
              Embedded India Mail &bull; Need help? Reply to this email or contact ${escapeHtml(config.fromEmail)}
            </div>
          </div>
        `,
        text: [
          `Embedded India Mail — Account & Setup Guide`,
          `Mailbox: ${mailboxEmail}`,
          hasPassword ? `Password: ${password}` : 'Password: Use your existing mailbox password',
          `Webmail: ${webUrl}`,
          `IMAP: ${imap}`,
          `SMTP: ${smtp}`,
          `CalDAV/CardDAV: ${davUrl}`,
          `Exchange ActiveSync: ${easUrl}`
        ].join('\n')
      };

      const res = await t.sendMail(mailOptions);
      return { success: true, messageId: res.messageId };
    } catch (err) {
      console.error('[MAILER ERROR] Failed to send credentials email:', err.message);
      return { success: false, error: err.message };
    }
  }
};

module.exports = mailer;
