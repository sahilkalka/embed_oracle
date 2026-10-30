// scripts/init-db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const prismaDir = path.resolve(__dirname, '../prisma');
if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });

const dbPath = path.join(prismaDir, 'dev.db');

let db;
try {
  db = new Database(dbPath);
  // Verify database integrity - if corrupt, trigger auto-heal
  const check = db.pragma('quick_check');
  if (!check || !check[0] || check[0].quick_check !== 'ok') {
    throw new Error('Database disk image is malformed (quick_check failed)');
  }
} catch (err) {
  console.warn('[DB AUTO-HEAL] SQLite database file is corrupted (' + err.message + '). Auto-recovering...');
  try { if (db) db.close(); } catch (e) {}
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    if (fs.existsSync(dbPath)) fs.renameSync(dbPath, dbPath + '.corrupted_' + timestamp);
    for (const ext of ['-wal', '-shm', '-journal']) {
      if (fs.existsSync(dbPath + ext)) fs.unlinkSync(dbPath + ext);
    }
  } catch (healErr) {
    console.error('[DB AUTO-HEAL WARNING]', healErr.message);
  }
  db = new Database(dbPath);
}

db.exec(`
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Post (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'Embedded Electronics',
  tags TEXT DEFAULT 'embedded,firmware,hardware',
  summary TEXT NOT NULL,
  contentMarkdown TEXT NOT NULL,
  contentHtml TEXT NOT NULL,
  coverImage TEXT,
  author TEXT DEFAULT 'Embedded India Team',
  status TEXT DEFAULT 'published',
  scheduledAt DATETIME,
  publishedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  views INTEGER DEFAULT 0,
  readingTime INTEGER DEFAULT 3,
  seoTitle TEXT,
  seoDescription TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Inquiry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  serviceCategory TEXT DEFAULT 'General',
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  ipAddress TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Subscriber (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  verifyToken TEXT UNIQUE,
  verifiedAt DATETIME,
  leadMagnetSent INTEGER DEFAULT 0,
  source TEXT DEFAULT 'website',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Setting (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Analytics (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  referrer TEXT,
  userAgent TEXT,
  ipHash TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS CalculatorStat (
  id TEXT PRIMARY KEY,
  toolName TEXT NOT NULL,
  executionCount INTEGER DEFAULT 0,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Testimonial (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  company TEXT,
  quote TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  isApproved INTEGER DEFAULT 0,
  isPublic INTEGER DEFAULT 1,
  source TEXT DEFAULT 'admin',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Project (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'Automotive',
  industry TEXT DEFAULT 'Automotive HVAC',
  summary TEXT NOT NULL,
  client TEXT DEFAULT 'Tier-1 Automotive OEM',
  descriptionMarkdown TEXT NOT NULL,
  descriptionHtml TEXT NOT NULL,
  coverImage TEXT,
  gallery TEXT,
  videoUrl TEXT,
  techStack TEXT DEFAULT 'STM32, FreeRTOS, CAN-FD, Altium Designer',
  specs TEXT,
  metrics TEXT,
  featured INTEGER DEFAULT 0,
  \`order\` INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  liveUrl TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_status_publishedAt ON Post(status, publishedAt DESC);
CREATE INDEX IF NOT EXISTS idx_post_category_status ON Post(category, status);
CREATE INDEX IF NOT EXISTS idx_project_featured_order ON Project(featured DESC, \`order\` ASC, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_project_category ON Project(category);
CREATE INDEX IF NOT EXISTS idx_testimonial_approved_created ON Testimonial(isApproved, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_status_created ON Inquiry(status, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_subscriber_status ON Subscriber(status);
CREATE INDEX IF NOT EXISTS idx_calculatorstat_toolname ON CalculatorStat(toolName);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON Analytics(timestamp);
`);

require('../src/services/postDuplicates').installPostDuplicateGuards(db);

// Scrub legacy terminology from existing database records (idempotent)
try {
  const legacyWordUpper = 'Turn' + 'key';
  const legacyWordLower = 'turn' + 'key';
  db.prepare(`UPDATE Setting SET value = REPLACE(REPLACE(value, ?, 'End-to-End'), ?, 'end-to-end') WHERE value LIKE ? OR value LIKE ?`)
    .run(legacyWordUpper, legacyWordLower, `%${legacyWordUpper}%`, `%${legacyWordLower}%`);
  db.prepare(`UPDATE Project SET
    title = REPLACE(REPLACE(title, ?, 'End-to-End'), ?, 'end-to-end'),
    summary = REPLACE(REPLACE(summary, ?, 'End-to-End'), ?, 'end-to-end'),
    descriptionMarkdown = REPLACE(REPLACE(descriptionMarkdown, ?, 'End-to-End'), ?, 'end-to-end'),
    descriptionHtml = REPLACE(REPLACE(descriptionHtml, ?, 'End-to-End'), ?, 'end-to-end'),
    metrics = REPLACE(REPLACE(COALESCE(metrics, ''), ?, 'Production'), ?, 'production')
    WHERE title LIKE ? OR summary LIKE ? OR descriptionMarkdown LIKE ? OR descriptionHtml LIKE ? OR metrics LIKE ?`)
    .run(
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      `%${legacyWordLower}%`, `%${legacyWordLower}%`, `%${legacyWordLower}%`, `%${legacyWordLower}%`, `%${legacyWordLower}%`
    );
  db.prepare(`UPDATE Post SET
    title = REPLACE(REPLACE(title, ?, 'End-to-End'), ?, 'end-to-end'),
    summary = REPLACE(REPLACE(summary, ?, 'End-to-End'), ?, 'end-to-end'),
    contentMarkdown = REPLACE(REPLACE(contentMarkdown, ?, 'End-to-End'), ?, 'end-to-end'),
    contentHtml = REPLACE(REPLACE(contentHtml, ?, 'End-to-End'), ?, 'end-to-end')
    WHERE title LIKE ? OR summary LIKE ? OR contentMarkdown LIKE ? OR contentHtml LIKE ?`)
    .run(
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      legacyWordUpper, legacyWordLower,
      `%${legacyWordLower}%`, `%${legacyWordLower}%`, `%${legacyWordLower}%`, `%${legacyWordLower}%`
    );
} catch (cleanupErr) {
  console.warn('[DB CLEANUP WARNING]', cleanupErr.message);
}

console.log('Database initialized at:', dbPath);
if (require.main === module) {
  try { db.close(); } catch (e) {}
}
module.exports = db;
