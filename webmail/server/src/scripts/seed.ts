import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { ingestEmail } from '../services/threading';

async function main() {
  console.log('==> Seeding Modern Webmail Database...');

  // 1. Create Default Folders
  const folders = [
    { name: 'Inbox', slug: 'inbox', isSystem: true, sortOrder: 1, icon: 'Inbox' },
    { name: 'Sent Items', slug: 'sent', isSystem: true, sortOrder: 2, icon: 'Send' },
    { name: 'Drafts', slug: 'drafts', isSystem: true, sortOrder: 3, icon: 'FileEdit' },
    { name: 'Archive', slug: 'archive', isSystem: true, sortOrder: 4, icon: 'Archive' },
    { name: 'Junk Email', slug: 'junk', isSystem: true, sortOrder: 5, icon: 'ShieldAlert' },
    { name: 'Deleted Items', slug: 'trash', isSystem: true, sortOrder: 6, icon: 'Trash2' },
  ];

  for (const f of folders) {
    await prisma.folder.upsert({
      where: { slug: f.slug },
      update: f,
      create: f,
    });
  }

  // 2. Create Default Tags
  const tags = [
    { name: 'Engineering', color: '#0078d4' },
    { name: 'AWS SES', color: '#ff9900' },
    { name: 'Server Alert', color: '#d83b01' },
    { name: 'Client Inquiries', color: '#107c41' },
  ];

  for (const t of tags) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: t,
      create: t,
    });
  }

  // 3. Create Admin / Default User
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('EmbeddedIndia@2026', salt);

  const user = await prisma.user.upsert({
    where: { email: 'info@embeddedindia.in' },
    update: {
      name: 'Embedded India Admin',
      signature: '<p>--<br><strong>Embedded India Engineering Team</strong><br><a href="https://embeddedindia.in">embeddedindia.in</a></p>',
    },
    create: {
      email: 'info@embeddedindia.in',
      name: 'Embedded India Admin',
      passwordHash,
      signature: '<p>--<br><strong>Embedded India Engineering Team</strong><br><a href="https://embeddedindia.in">embeddedindia.in</a></p>',
      theme: 'system',
    },
  });

  console.log(`Created/Verified default user: ${user.email} (Password: EmbeddedIndia@2026)`);

  // 4. Ingest Sample Showcase Emails
  const sample1 = {
    messageId: '<aws-ses-welcome-2026@amazon.com>',
    fromName: 'Amazon Web Services',
    fromEmail: 'no-reply-aws@amazon.com',
    toRecipients: [{ name: 'Embedded India', address: 'info@embeddedindia.in' }],
    ccRecipients: [],
    bccRecipients: [],
    subject: 'Amazon SES Domain Verification: embeddedindia.in is ready',
    textBody: 'Your domain embeddedindia.in has been successfully verified in Amazon SES for outbound and inbound email delivery.',
    htmlBody: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; color: #232f3e; line-height: 1.6;">
        <h2 style="color: #ff9900; border-bottom: 2px solid #eaeded; padding-bottom: 10px;">Amazon Simple Email Service (SES)</h2>
        <p>Hello Embedded India Team,</p>
        <p>We are pleased to inform you that your custom domain <strong>embeddedindia.in</strong> is fully verified for high-deliverability email transmission.</p>
        <div style="background: #f7f9fa; border-left: 4px solid #ff9900; padding: 12px 16px; margin: 16px 0;">
          <strong>Configuration Summary:</strong><br>
          • <strong>SPF:</strong> <code>v=spf1 mx a:mail.embeddedindia.in include:amazonses.com ~all</code><br>
          • <strong>DKIM:</strong> 2048-bit RSA Enabled<br>
          • <strong>DMARC:</strong> Alignment Policy Active (p=quarantine)
        </div>
        <p>You can now send fluid, modern webmail messages through this dashboard with zero deliverability friction.</p>
        <p>Regards,<br><strong>Amazon Web Services Team</strong></p>
      </div>
    `,
    sentAt: new Date(Date.now() - 3600 * 1000 * 4),
    attachments: [],
  };

  const sample2 = {
    messageId: '<oracle-cloud-telemetry-01@oracle.com>',
    fromName: 'Oracle Cloud Infrastructure',
    fromEmail: 'alerts@oracle.com',
    toRecipients: [{ name: 'Embedded India Ops', address: 'info@embeddedindia.in' }],
    ccRecipients: [],
    bccRecipients: [],
    subject: 'OCI Compute Health: VM.Standard.A1.Flex (129.225.79.183) Operating Optimally',
    textBody: 'System health report: 4 ARM64 OCPUs, 24 GB RAM, 0% packet loss. Webmail service running under systemd.',
    htmlBody: `
      <div style="font-family: 'Segoe UI', sans-serif; color: #1b1a19; line-height: 1.5;">
        <h3 style="color: #c74634;">Oracle Cloud Infrastructure - Server Status Alert</h3>
        <p>Automated telemetry report for host <strong>129.225.79.183</strong> (Region: ap-hyderabad-1):</p>
        <table style="width: 100%; border-collapse: collapse; margin: 14px 0;">
          <tr style="background: #f3f2f1;"><th style="padding: 8px; text-align: left; border: 1px solid #edebe9;">Metric</th><th style="padding: 8px; text-align: left; border: 1px solid #edebe9;">Value</th></tr>
          <tr><td style="padding: 8px; border: 1px solid #edebe9;">Instance Shape</td><td style="padding: 8px; border: 1px solid #edebe9;">VM.Standard.A1.Flex (4 OCPU, 24GB RAM)</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #edebe9;">Node.js Webmail Daemon</td><td style="padding: 8px; border: 1px solid #edebe9;"><span style="color: #107c41; font-weight: bold;">ACTIVE (RUNNING)</span></td></tr>
          <tr><td style="padding: 8px; border: 1px solid #edebe9;">SQLite Cache Mode</td><td style="padding: 8px; border: 1px solid #edebe9;">WAL (Write-Ahead Logging) Enabled</td></tr>
        </table>
        <p style="color: #605e5c; font-size: 13px;">This is an automated notification from your server monitoring cron.</p>
      </div>
    `,
    sentAt: new Date(Date.now() - 3600 * 1000 * 2),
    attachments: [],
  };

  const sample3 = {
    messageId: '<firmware-client-inquiry-101@acme.com>',
    fromName: 'Rajesh Verma (Hardware Lead)',
    fromEmail: 'rajesh.verma@apexhardware.com',
    toRecipients: [{ name: 'Embedded India', address: 'info@embeddedindia.in' }],
    ccRecipients: [],
    bccRecipients: [],
    subject: 'PCB Design & Firmware Architecture Consultation for IoT Gateway',
    textBody: 'Hi Team, We came across your engineering portal embeddedindia.in and would like to consult on an STM32-based industrial edge gateway.',
    htmlBody: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <p>Hi Embedded India Team,</p>
        <p>We read your recent pillar articles on embedded firmware architecture and were very impressed with the depth of the engineering documentation.</p>
        <p>Our company is designing an industrial edge gateway powered by an <strong>STM32MP1</strong> dual-core MPU running embedded Linux + FreeRTOS on the real-time core. We need assistance with:</p>
        <ul>
          <li>Device tree customization & high-speed DDR3 routing verification</li>
          <li>Secure Bootloader (TF-A / U-Boot with hardware crypto engine)</li>
          <li>AWS IoT Core MQTT telemetry integration</li>
        </ul>
        <p>Could you schedule a 30-minute discovery call this Thursday at 3:00 PM IST?</p>
        <p>Best regards,<br><strong>Rajesh Verma</strong><br>Hardware Systems Architect<br>Apex Hardware Solutions</p>
      </div>
    `,
    sentAt: new Date(Date.now() - 3600 * 1000 * 0.5),
    attachments: [],
  };

  await ingestEmail(sample1, 'inbox');
  await ingestEmail(sample2, 'inbox');
  await ingestEmail(sample3, 'inbox');

  console.log('==> Database seeded successfully with default folders, tags, user, and showcase emails!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
