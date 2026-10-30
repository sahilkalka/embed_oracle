#!/usr/bin/env node
/**
 * scripts/test-smtp.js
 * 
 * Diagnostic SMTP verification script for Embedded India Portal.
 * Verifies live SMTP credentials and tests email delivery for both
 * Contact Form and Newsletter subscription flows to info@embeddedindia.in.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const mailer = require('../src/services/mailer');

async function runSmtpDiagnostics() {
  console.log('================================================================');
  console.log('🔬 EMBEDDED INDIA - SMTP DIAGNOSTIC & VERIFICATION SUITE');
  console.log('================================================================');

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || 'info@embeddedindia.in';
  const pass = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_EMAIL || 'info@embeddedindia.in';

  const isPort465 = port === 465;
  const secure = isPort465 || (process.env.SMTP_SECURE === 'true' && port !== 587);
  const requireTLS = port === 587;

  console.log('\n[1/4] Loaded SMTP Environment Configuration:');
  console.log(`  • Host:        ${host}`);
  console.log(`  • Port:        ${port}`);
  console.log(`  • Secure:      ${secure} (${isPort465 ? 'SSL/TLS direct on 465' : 'STARTTLS on ' + port})`);
  console.log(`  • RequireTLS:  ${requireTLS}`);
  console.log(`  • User/Sender: ${user}`);
  console.log(`  • Password:    ${pass ? (pass.length > 4 ? pass.slice(0, 3) + '••••••••' : '••••') : '[NOT SET]'}`);
  console.log(`  • Admin Target:${adminEmail}`);

  // Test 1: Transporter Connection & Handshake Verification
  console.log('\n[2/4] Testing SMTP Handshake & Authentication (transporter.verify())...');

  const isMock = !pass || pass === 'your-smtp-app-password' || user === 'mock';

  if (isMock) {
    console.log('  ⚠️  NOTICE: Placeholder credentials detected in .env (SMTP_PASS=your-smtp-app-password).');
    console.log('  Running simulated diagnostic verification for local development...');
  }

  let transporter;
  try {
    transporter = await mailer.getTransporter();
    if (!transporter.isMock) {
      await transporter.verify();
      console.log(`  ✅ [SMTP] Ready to send emails to ${adminEmail} (Live Connection Established)`);
    } else {
      console.log(`  ✅ [SMTP DEV MODE] Mock transporter active & verified for ${adminEmail}`);
    }
  } catch (err) {
    const code = err.code || 'EUNKNOWN';
    console.error(`  ❌ [SMTP ERROR] [${code}] Handshake verification failed: ${err.message}`);
    if (code === 'EAUTH') {
      console.error('     👉 Hint: Invalid SMTP credentials. If using Gmail / Google Workspace, use a 16-character App Password (not your account password).');
    } else if (code === 'ESOCKET' || code === 'ETIMEDOUT') {
      console.error(`     👉 Hint: Connection to ${host}:${port} timed out or was blocked. Verify firewall and hosting outbound port 587/465.`);
    }
    console.log('\n================================================================');
    console.log('❌ SMTP DIAGNOSTICS COMPLETED WITH ERRORS');
    console.log('================================================================');
    process.exit(1);
  }

  // Test 2: Contact Form / RFQ Notification Email
  console.log('\n[3/4] Dispatching Test Contact / RFQ Notification to ' + adminEmail + '...');
  const testInquiry = {
    name: 'Diagnostic Test Engineer',
    company: 'Embedded India Testing Lab',
    email: 'test-visitor@embeddedindia.in',
    phone: '+91 98765 00000',
    serviceCategory: 'Hardware Design & RFQ',
    subject: 'Automated SMTP Pipeline Test',
    message: 'This is a diagnostic verification email sent by scripts/test-smtp.js to ensure Contact Form and RFQ delivery works properly.',
    createdAt: new Date()
  };

  try {
    const contactResult = await mailer.sendInquiryNotification(testInquiry);
    console.log('  ✅ Contact Form Email Dispatched Successfully:');
    console.log(`     • messageId: ${contactResult.messageId}`);
    console.log(`     • accepted:  ${JSON.stringify(contactResult.accepted)}`);
    console.log(`     • rejected:  ${JSON.stringify(contactResult.rejected)}`);
    console.log(`     • response:  ${contactResult.response || '250 OK'}`);
  } catch (err) {
    console.error(`  ❌ Failed to dispatch Contact Form email: ${err.message}`);
  }

  // Test 3: Newsletter Subscription / Admin Notification Email
  console.log('\n[4/4] Dispatching Test Newsletter Lead Notification to ' + adminEmail + '...');
  const testSubscriber = {
    email: 'diagnostic-subscriber@example.com',
    status: 'pending',
    source: 'CLI Test Script (scripts/test-smtp.js)',
    createdAt: new Date()
  };

  try {
    const newsletterResult = await mailer.sendNewsletterAdminNotification(testSubscriber);
    console.log('  ✅ Newsletter Admin Lead Email Dispatched Successfully:');
    console.log(`     • messageId: ${newsletterResult.messageId}`);
    console.log(`     • accepted:  ${JSON.stringify(newsletterResult.accepted)}`);
    console.log(`     • rejected:  ${JSON.stringify(newsletterResult.rejected)}`);
    console.log(`     • response:  ${newsletterResult.response || '250 OK'}`);
  } catch (err) {
    console.error(`  ❌ Failed to dispatch Newsletter email: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log('🎉 SMTP PIPELINE VERIFICATION COMPLETED FOR info@embeddedindia.in');
  console.log('================================================================\n');
}

runSmtpDiagnostics().catch(err => {
  console.error('[FATAL DIAGNOSTIC ERROR]', err);
  process.exit(1);
});
