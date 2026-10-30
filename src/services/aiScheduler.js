// src/services/aiScheduler.js
const prisma = require('./db');
const aiGenerator = require('./aiGenerator');

const DEFAULT_TOPICS = [
  "High-Density Interconnect (HDI) Microvias & Differential Pair Skew Matching in 8-Layer PCBs",
  "Hardware Design Strategies for Minimizing EMI and ESD on Industrial CAN-FD Nodes",
  "Designing Ultra-Low-Noise Switched Mode Power Supplies for 24-Bit ADC Frontends",
  "Implementing Hard Real-Time Mutexes and DMA Streams in FreeRTOS on STM32G4",
  "Battery Life Optimization for LoRaWAN Class A Nodes Operating in Deep Freeze Environments",
  "Hardware-in-the-Loop (HIL) Automated Fault Injection for Automotive ECUs using Python",
  "Designing Fail-Safe Dual-Bank FOTA Firmware Bootloaders for ESP32-S3 over BLE",
  "Eliminating Ground Bounce & Clock Jitter in 100MHz+ SPI Bus Architectures",
  "Thermal Modeling & Copper Pour Heat Sinking for High-Power GaN Transistors in Motor Inverters",
  "Deterministic FreeRTOS Queue Management and Interrupt Latency Benchmarking on Cortex-M7",
  "Precision Low-Side vs High-Side Current Sensing Circuit Topology in Battery Management Systems",
  "Configuring Zero-Wait-State Flash Cache & TCM Memory for STM32H7 DSP Audio Filters"
];

const FREQUENCY_INTERVALS_MS = {
  hourly: 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  every_12_hours: 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  every_2_days: 48 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

/**
 * Retrieve scheduler settings from database
 */
async function getSchedulerSettings() {
  const settings = await prisma.setting.findMany();
  const map = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  const enabled = map.ai_auto_gen_enabled === 'true' || map.ai_auto_gen_enabled === '1';
  const frequency = map.ai_auto_gen_frequency || 'daily';
  const maxPosts = parseInt(map.ai_auto_gen_max_posts, 10) || 100;
  const statusMode = map.ai_auto_gen_status || 'published';
  const category = map.ai_auto_gen_category || 'Embedded Electronics';
  const lastRun = map.ai_auto_gen_last_run ? new Date(map.ai_auto_gen_last_run) : null;

  let rawTopics = map.ai_auto_gen_topics;
  let topicsList = [];
  if (rawTopics && rawTopics.trim()) {
    topicsList = rawTopics
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  if (topicsList.length === 0) {
    topicsList = DEFAULT_TOPICS;
  }

  return {
    enabled,
    frequency,
    maxPosts,
    statusMode,
    category,
    lastRun,
    topicsList,
    rawTopics: map.ai_auto_gen_topics || DEFAULT_TOPICS.join('\n')
  };
}

/**
 * Check if the scheduler should execute based on current state & frequency
 */
async function shouldRunScheduledTask() {
  const settings = await getSchedulerSettings();
  if (!settings.enabled) {
    return { shouldRun: false, reason: 'Scheduler is disabled in Admin settings' };
  }

  const totalPosts = await prisma.post.count();
  if (totalPosts >= settings.maxPosts) {
    return {
      shouldRun: false,
      reason: `Max blog pages limit (${settings.maxPosts}) reached (Current: ${totalPosts})`
    };
  }

  if (!settings.lastRun) {
    return { shouldRun: true, reason: 'First run' };
  }

  const intervalMs = FREQUENCY_INTERVALS_MS[settings.frequency] || FREQUENCY_INTERVALS_MS.daily;
  const elapsedMs = Date.now() - settings.lastRun.getTime();

  if (elapsedMs >= intervalMs) {
    return { shouldRun: true, reason: `Elapsed interval (${Math.round(elapsedMs / (60 * 1000))} min) satisfies ${settings.frequency}` };
  }

  return {
    shouldRun: false,
    reason: `Interval not reached yet (${Math.round((intervalMs - elapsedMs) / (60 * 1000))} minutes remaining)`
  };
}

/**
 * Select the next technical topic from the configured pool that hasn't been recently written
 */
async function pickNextTopic(topicsList) {
  const existingPosts = await prisma.post.findMany({
    select: { title: true, slug: true },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const existingTitles = existingPosts.map(p => p.title.toLowerCase());

  // Find the first topic from the pool that isn't already a title
  for (const topic of topicsList) {
    const isUsed = existingTitles.some(t => t.includes(topic.toLowerCase().slice(0, 25)));
    if (!isUsed) {
      return topic;
    }
  }

  // If all pool topics have been covered, rotate or ask AI for a fresh topic
  try {
    const aiSuggested = await aiGenerator.suggestTopics({ category: 'Embedded Electronics' });
    if (aiSuggested && aiSuggested.topics && aiSuggested.topics.length > 0) {
      return aiSuggested.topics[Math.floor(Math.random() * aiSuggested.topics.length)];
    }
  } catch (e) {}

  // Fallback to random pick from pool with time-based suffix
  const baseTopic = topicsList[Math.floor(Math.random() * topicsList.length)];
  return baseTopic;
}

/**
 * Execute automated blog post generation
 */
async function executeAutoGeneration({ force = false } = {}) {
  const settings = await getSchedulerSettings();
  const totalPosts = await prisma.post.count();

  if (!force && totalPosts >= settings.maxPosts) {
    return {
      success: false,
      error: `Maximum allowed blog pages limit (${settings.maxPosts}) has been reached. Current total: ${totalPosts}.`
    };
  }

  const topic = await pickNextTopic(settings.topicsList);
  console.log(`[AUTO-BLOG ENGINE] Generating scheduled article for topic: "${topic}"...`);

  const category = settings.category === 'auto' ? 'Embedded Electronics' : settings.category;

  const post = await aiGenerator.generateBlogArticle({
    topic,
    category,
    targetAudience: 'Hardware Layout Specialists & Embedded Firmware Engineers',
    createDraftInDb: true
  });

  // Apply configured status mode (published, scheduled, or draft)
  let updatedPost = post;
  const now = new Date();
  if (settings.statusMode === 'scheduled') {
    // Schedule for 4 hours ahead
    const scheduledTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'scheduled',
        scheduledAt: scheduledTime,
        publishedAt: null
      }
    });
  } else if (settings.statusMode === 'published') {
    updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'published',
        publishedAt: now,
        scheduledAt: null
      }
    });
  } else {
    // Draft
    updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'draft',
        publishedAt: null
      }
    });
  }

  // Update last run timestamp in settings
  await prisma.setting.upsert({
    where: { key: 'ai_auto_gen_last_run' },
    update: { value: now.toISOString() },
    create: { key: 'ai_auto_gen_last_run', value: now.toISOString() }
  });

  console.log(`[AUTO-BLOG ENGINE] Article generated successfully: "${updatedPost.title}" (ID: ${updatedPost.id}, Status: ${updatedPost.status})`);

  return {
    success: true,
    post: updatedPost,
    topic,
    status: updatedPost.status
  };
}

/**
 * Background tick called periodically by cron
 */
async function checkAndRunScheduledTask() {
  const check = await shouldRunScheduledTask();
  if (!check.shouldRun) {
    return;
  }

  console.log(`[AUTO-BLOG CRON] Scheduled trigger condition met: ${check.reason}. Starting article synthesis...`);
  try {
    const result = await executeAutoGeneration({ force: false });
    if (result.success) {
      console.log(`[AUTO-BLOG CRON] Auto-generation complete: "${result.post.title}"`);
    } else {
      console.warn(`[AUTO-BLOG CRON] Auto-generation skipped: ${result.error}`);
    }
  } catch (err) {
    console.error(`[AUTO-BLOG CRON ERROR] Generation failed:`, err.message);
  }
}

module.exports = {
  DEFAULT_TOPICS,
  FREQUENCY_INTERVALS_MS,
  getSchedulerSettings,
  shouldRunScheduledTask,
  executeAutoGeneration,
  checkAndRunScheduledTask
};
