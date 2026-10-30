// src/cron/jobs.js
const cron = require('node-cron');
const prisma = require('../services/db');
const mailer = require('../services/mailer');
const aiScheduler = require('../services/aiScheduler');

// Function to auto-publish scheduled articles
async function publishScheduledPosts() {
  const now = new Date();
  try {
    const scheduledPosts = await prisma.post.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: now }
      }
    });

    if (scheduledPosts.length > 0) {
      console.log(`[CRON] Found ${scheduledPosts.length} posts to publish.`);
      for (const post of scheduledPosts) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: 'published',
            publishedAt: now
          }
        });
        console.log(`[CRON] Published scheduled post: "${post.title}"`);
      }
    }
  } catch (err) {
    console.error('[CRON ERROR] Scheduled post check failed:', err.message);
  }
}

// Function to compile and send weekly newsletter digest
async function sendWeeklyNewsletterDigest() {
  console.log('[CRON] Preparing weekly newsletter digest...');
  try {
    const settings = await prisma.setting.findMany();
    const map = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Compute time window based on frequency setting
    let timeWindowDays = 7;
    const freq = (map.newsletter_frequency || 'weekly').toLowerCase();
    if (freq === 'daily') timeWindowDays = 1;
    else if (freq === 'bi-weekly') timeWindowDays = 14;
    else if (freq === 'monthly') timeWindowDays = 30;

    const dateThreshold = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);

    // Filter by category if specified
    const postWhere = {
      status: 'published',
      publishedAt: { gte: dateThreshold }
    };
    if (map.newsletter_category && map.newsletter_category !== 'all') {
      postWhere.category = { equals: map.newsletter_category, mode: 'insensitive' };
    }

    let recentPosts = await prisma.post.findMany({
      where: postWhere,
      orderBy: { publishedAt: 'desc' },
      take: 5
    });

    // Fallback: if no posts within the threshold, fetch the latest 3 published posts
    if (recentPosts.length === 0) {
      recentPosts = await prisma.post.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
        take: 3
      });
    }

    if (recentPosts.length === 0) {
      console.log('[CRON] No new posts this week. Skipping newsletter digest.');
      return;
    }

    const activeSubscribers = await prisma.subscriber.findMany({
      where: { status: 'active' }
    });

    if (activeSubscribers.length === 0) {
      console.log('[CRON] No active subscribers found.');
      return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const postItemsHtml = recentPosts.map(p => `
      <li style="margin-bottom: 16px;">
        <a href="${appUrl}/blogs/${p.slug}" style="color: #007f5f; font-weight: bold; font-size: 16px; text-decoration: none;">${p.title}</a>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;">${p.summary}</p>
      </li>
    `).join('');


    const fromName = map.smtp_from_name || map.site_name || 'Embedded India';
    const fromEmail = map.smtp_from_email || map.contact_email || 'info@embeddedindia.in';
    const sender = `"${fromName}" <${fromEmail}>`;

    for (const sub of activeSubscribers) {
      const unsubUrl = `${appUrl}/api/newsletter/unsubscribe?token=${sub.verifyToken || sub.id}&email=${encodeURIComponent(sub.email)}`;
      const mailOptions = {
        from: sender,
        to: sub.email,
        subject: map.newsletter_topic ? `[${map.newsletter_topic}] ${recentPosts[0].title}` : `Embedded India Engineering Digest: ${recentPosts[0].title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #007f5f; padding: 20px; color: white;">
              <h2 style="margin: 0;">Embedded India Engineering Weekly</h2>
              <p style="margin: 5px 0 0; opacity: 0.9;">Curated hardware, firmware, and IoT engineering insights</p>
            </div>
            <div style="padding: 24px; color: #192c27;">
              <p>Hello,</p>
              <div style="margin-bottom: 16px; font-size: 14px; color: #334155;">${map.newsletter_intro_content ? map.newsletter_intro_content.replace(/\n/g, '<br>') : 'Here are the latest engineering guides, embedded firmware patterns, and hardware architectures curated for you:'}</div>
              <ul style="padding-left: 20px; margin: 20px 0;">
                ${postItemsHtml}
              </ul>
              <div style="margin: 25px 0; text-align: center;">
                <a href="${appUrl}/tools" style="background: #55a630; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Try Interactive Engineering Calculators</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                You received this because you subscribed on embeddedindia.in.<br>
                <a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe with one click</a>
              </p>
            </div>
          </div>
        `
      };
      // Send mail in try-catch to not block loop
      try {
        await mailer.getTransporter().sendMail(mailOptions);
      } catch (err) {
        console.warn(`[NEWSLETTER WARN] Failed to send to ${sub.email}:`, err.message);
      }
    }
    console.log(`[CRON] Weekly newsletter sent to ${activeSubscribers.length} subscribers.`);
  } catch (err) {
    console.error('[CRON ERROR] Newsletter digest failed:', err.message);
  }
}

function initCronJobs() {
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    return;
  }

  console.log('[CRON] Initializing background tasks...');

  // Check scheduled posts every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    publishScheduledPosts();
  });

  // Check AI Scheduled Blog Generator every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await aiScheduler.checkAndRunScheduledTask();
    } catch (err) {
      console.error('[CRON ERROR] AI Scheduled generator failed:', err.message);
    }
  });

  // Run weekly digest every Monday at 09:00 AM IST (03:30 AM UTC)
  cron.schedule('30 3 * * 1', () => {
    sendWeeklyNewsletterDigest();
  });

  // Daily SQLite Block Storage maintenance & 90-day analytics pruning at 04:00 UTC
  cron.schedule('0 4 * * *', () => {
    if (typeof prisma.runMaintenance === 'function') {
      prisma.runMaintenance(90);
    }
  });

  console.log('[CRON] Tasks scheduled: Draft Auto-Publisher (*/15 min), AI Scheduled Blog Generator (*/15 min), Weekly Digest (Mon 9:00 AM IST), and Daily DB Maintenance (04:00 UTC).');
}

module.exports = {
  initCronJobs,
  publishScheduledPosts,
  sendWeeklyNewsletterDigest
};
