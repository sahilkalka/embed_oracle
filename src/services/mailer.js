// src/services/mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const prisma = require('./db');

let transporter = null;
let lastSmtpConfigHash = '';

/**
 * Build or retrieve the Nodemailer transporter instance
 */
async function getTransporter() {
  try {
    let map = {};
    try {
      const settings = await prisma.setting.findMany();
      map = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
    } catch (e) {
      // Fallback if settings table is temporarily inaccessible
      map = {};
    }

    const host = process.env.SMTP_HOST || map.smtp_host || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || map.smtp_port || 587);
    const user = process.env.SMTP_USER || map.smtp_user;
    const pass = process.env.SMTP_PASS || map.smtp_pass;

    // Automatic secure & requireTLS based on port specifications
    const isPort465 = port === 465;
    const explicitSecure = process.env.SMTP_SECURE === 'true' || map.smtp_secure === 'true';
    const secure = isPort465 || (explicitSecure && port !== 587);
    const requireTLS = port === 587;

    const currentHash = `${host}:${port}:${secure}:${requireTLS}:${user}:${pass}`;

    if (!transporter || currentHash !== lastSmtpConfigHash) {
      lastSmtpConfigHash = currentHash;

      const isLiveCredentials = user && pass && 
        pass !== 'your-smtp-app-password' && 
        user !== 'test@ethereal.email' && 
        user !== 'mock';

      if (isLiveCredentials) {
        transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          requireTLS,
          auth: { user, pass },
          tls: {
            rejectUnauthorized: false // Fallback for shared/self-signed cPanel/Hostinger/Zoho certificates
          },
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 15000
        });
        transporter.isMock = false;
      } else {
        // Fallback development transporter that logs full details to stdout
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
  } catch (err) {
    console.error('[MAILER] Error creating SMTP transport:', err.message);
  }

  return transporter;
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
      console.log(`[SMTP DEV MODE] Mock transporter active (Enter SMTP credentials in .env to send live emails to ${adminEmail}).`);
      return { success: true, mock: true, message: 'Mock transporter active' };
    }

    await t.verify();
    console.log(`[SMTP] Ready to send emails to ${adminEmail}`);
    return { success: true, message: `[SMTP] Ready to send emails to ${adminEmail}` };
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
  const host = options.host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(options.port || process.env.SMTP_PORT || 587);
  const user = options.user || process.env.SMTP_USER || 'info@embeddedindia.in';
  const pass = options.pass || process.env.SMTP_PASS;
  const toEmail = options.toEmail || process.env.ADMIN_EMAIL || 'info@embeddedindia.in';

  const isPort465 = port === 465;
  const secure = isPort465 || (options.secure === true || options.secure === 'true' || (process.env.SMTP_SECURE === 'true' && port !== 587));
  const requireTLS = port === 587;

  const isMock = !pass || pass === 'your-smtp-app-password' || user === 'mock' || user === 'test@ethereal.email';

  if (isMock) {
    await new Promise(r => setTimeout(r, 200));
    console.log(`\n[SMTP TEST] Simulated diagnostic email dispatched to: ${toEmail}`);
    return {
      success: true,
      simulated: true,
      messageId: `simulated-smtp-${Date.now()}@embeddedindia.in`,
      accepted: [toEmail],
      rejected: [],
      response: '250 Simulated handshake verified',
      message: `Simulated SMTP handshake & delivery verified to ${toEmail} (Local Dev Mode). To dispatch live external emails, update SMTP_PASS in .env.`
    };
  }

  const testTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: { user, pass },
    connectionTimeout: 12000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: { rejectUnauthorized: false }
  });

  try {
    await testTransporter.verify();

    const info = await testTransporter.sendMail({
      from: `"Embedded India Portal" <${user}>`,
      to: toEmail,
      replyTo: toEmail,
      envelope: {
        from: user,
        to: toEmail
      },
      subject: 'SMTP Configuration Verified - Embedded India',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 540px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #007f5f; margin-top: 0;">✅ Outgoing SMTP Verified</h2>
          <p style="font-size: 14px; color: #334155;">This email confirms that your outgoing mail server configuration for <strong>Embedded India</strong> is working properly.</p>
          <div style="padding: 12px; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 12px; color: #475569;">
            Host: ${host}<br>
            Port: ${port}<br>
            Secure: ${secure}<br>
            Timestamp: ${new Date().toISOString()}
          </div>
        </div>
      `,
      text: `SMTP Configuration Verified for Embedded India on ${host}:${port}.`
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
      friendlyError = 'SMTP Authentication failed (EAUTH): Invalid username or password. If using Gmail/Google Workspace, please generate and use an App Password.';
    } else if (code === 'ESOCKET' || code === 'ETIMEDOUT') {
      friendlyError = `Connection to ${host}:${port} timed out or was refused (${code}). Check host, port, and firewall rules.`;
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
      const smtpSender = process.env.SMTP_USER || 'info@embeddedindia.in';
      let adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';
      try {
        const _s = await prisma.setting.findUnique({ where: { key: 'inquiry_recipient_emails' } });
        if (_s && _s.value && _s.value.trim()) adminEmail = _s.value.trim();
      } catch (_) {}
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const timestamp = inquiry.createdAt ? new Date(inquiry.createdAt).toISOString() : new Date().toISOString();

      const mailOptions = {
        from: `"Embedded India Portal" <${smtpSender}>`,
        to: adminEmail,
        replyTo: inquiry.email,
        envelope: {
          from: smtpSender,
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
              <p><strong>Name:</strong> ${inquiry.name}</p>
              <p><strong>Company:</strong> ${inquiry.company || 'Not provided'}</p>
              <p><strong>Email:</strong> <a href="mailto:${inquiry.email}">${inquiry.email}</a></p>
              <p><strong>Phone:</strong> ${inquiry.phone || 'Not provided'}</p>
              <p><strong>Service Category:</strong> ${inquiry.serviceCategory}</p>
              <p><strong>Subject:</strong> ${inquiry.subject}</p>
              <p><strong>Timestamp:</strong> ${timestamp}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p><strong>Message / Project Details:</strong></p>
              <p style="background: #f8fafc; padding: 15px; border-radius: 6px; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${inquiry.message}</p>
              <div style="margin-top: 25px;">
                <a href="${appUrl}/admin/inquiries" style="background: #007f5f; color: white; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">View in Admin Dashboard</a>
              </div>
            </div>
          </div>
        `,
        text: `New Inquiry from ${inquiry.name} (${inquiry.email}) | Company: ${inquiry.company || 'N/A'} | Phone: ${inquiry.phone || 'N/A'} | Category: ${inquiry.serviceCategory} | Time: ${timestamp}\n\nMessage:\n${inquiry.message}`
      };

      const t = await getTransporter();
      if (!t) {
        console.warn('[MAILER] No transporter configured for inquiry notification');
        return { success: false, error: 'No transporter configured' };
      }
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
      const smtpSender = process.env.SMTP_USER || 'info@embeddedindia.in';
      let adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';
      try {
        const _s = await prisma.setting.findUnique({ where: { key: 'newsletter_recipient_emails' } });
        if (_s && _s.value && _s.value.trim()) adminEmail = _s.value.trim();
      } catch (_) {}
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const timestamp = subscriber.createdAt ? new Date(subscriber.createdAt).toISOString() : new Date().toISOString();

      const mailOptions = {
        from: `"Embedded India Portal" <${smtpSender}>`,
        to: adminEmail,
        replyTo: subscriber.email,
        envelope: {
          from: smtpSender,
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
              <p><strong>Subscriber Email:</strong> <a href="mailto:${subscriber.email}">${subscriber.email}</a></p>
              <p><strong>Status:</strong> <span style="display:inline-block; padding: 2px 8px; border-radius: 4px; background:#e2e8f0; font-weight:bold;">${subscriber.status}</span></p>
              <p><strong>Source:</strong> ${subscriber.source || 'Website'}</p>
              <p><strong>Timestamp:</strong> ${timestamp}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p>To review, approve, or export subscriber lists, visit the Admin Dashboard:</p>
              <div style="margin-top: 20px;">
                <a href="${appUrl}/admin/subscribers" style="background: #007f5f; color: white; padding: 10px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Manage Subscribers in Admin</a>
              </div>
            </div>
          </div>
        `,
        text: `New Newsletter subscriber from ${subscriber.email} (Status: ${subscriber.status}, Source: ${subscriber.source || 'website'}, Timestamp: ${timestamp}). Review at: ${appUrl}/admin/subscribers`
      };

      const t = await getTransporter();
      if (!t) {
        console.warn('[MAILER] No transporter configured for newsletter admin notification');
        return { success: false, error: 'No transporter configured' };
      }
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
      const smtpSender = process.env.SMTP_USER || 'info@embeddedindia.in';
      let adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';
      try {
        const _s = await prisma.setting.findUnique({ where: { key: 'newsletter_recipient_emails' } });
        if (_s && _s.value && _s.value.trim()) adminEmail = _s.value.trim();
      } catch (_) {}
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const verifyUrl = `${appUrl}/api/newsletter/verify?token=${token}`;

      const mailOptions = {
        from: `"Embedded India Portal" <${smtpSender}>`,
        to: email,
        replyTo: adminEmail,
        envelope: {
          from: smtpSender,
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
                <a href="${verifyUrl}" style="background: #007f5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirm My Subscription &amp; Download PDF</a>
              </div>
              <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser: <br><a href="${verifyUrl}">${verifyUrl}</a></p>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">If you did not request this subscription, you can safely ignore this email.</p>
            </div>
          </div>
        `,
        text: `Please confirm your subscription to Embedded India by visiting: ${verifyUrl}`
      };

      const t = await getTransporter();
      if (!t) return { success: false, error: 'No transporter configured' };
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
      const t = await getTransporter();
      if (!t) return { success: false, error: 'No transporter configured' };
      if (t.isMock) return { success: false, error: 'SMTP is not configured. Save valid SMTP credentials in Settings before sending PDFs.' };
      const smtpSender = t.options?.auth?.user || process.env.SMTP_USER || 'info@embeddedindia.in';
      let adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';
      try {
        const _s = await prisma.setting.findUnique({ where: { key: 'newsletter_recipient_emails' } });
        if (_s && _s.value && _s.value.trim()) adminEmail = _s.value.trim();
      } catch (_) {}
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const pdfPath = path.join(__dirname, '../../public/downloads/embedded-design-checklist.pdf');
      const attachments = [];
      if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) {
        return { success: false, error: 'Checklist PDF is missing. Run npm run generate-lead-magnet on the server and retry.' };
      }
      if (fs.existsSync(pdfPath)) {
        attachments.push({
          filename: 'Embedded-Design-Checklist-2026.pdf',
          path: pdfPath
        });
      }

      const mailOptions = {
        from: `"Embedded India Portal" <${smtpSender}>`,
        to: email,
        replyTo: adminEmail,
        envelope: {
          from: smtpSender,
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
                <a href="${appUrl}/tools" style="background: #55a630; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Explore Engineering Tools</a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">To unsubscribe at any time, click <a href="${appUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}">here</a>.</p>
            </div>
          </div>
        `,
        text: `Your checklist is ready. Download it from the attachment or visit ${appUrl}`,
        attachments
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
  }
};

module.exports = mailer;
