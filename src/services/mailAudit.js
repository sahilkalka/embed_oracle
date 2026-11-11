// src/services/mailAudit.js
// Append-only record of every change made through /admin/email (who, what, when, from where).
// Stored in the site's SQLite database, table MailAuditLog (created on first use).

const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

let db;
function conn() {
  if (!db) {
    db = new Database(path.resolve(__dirname, '../../prisma/dev.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS MailAuditLog (
        id TEXT PRIMARY KEY,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT,
        ok INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS MailAuditLog_createdAt ON MailAuditLog (createdAt);
    `);
  }
  return db;
}

// Never store secrets in the audit trail.
function scrub(detail) {
  if (!detail) return null;
  const copy = { ...detail };
  for (const k of Object.keys(copy)) if (/pass|secret|token|key/i.test(k)) copy[k] = '[redacted]';
  return JSON.stringify(copy).slice(0, 2000);
}

module.exports = {
  record(req, action, target, detail, ok = true) {
    try {
      conn().prepare(
        'INSERT INTO MailAuditLog (id, actor, action, target, detail, ip, ok) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        (req.user && (req.user.email || req.user.username)) || 'unknown',
        action,
        target ? String(target).slice(0, 320) : null,
        scrub(detail),
        String(req.headers['cf-connecting-ip'] || req.ip || '').slice(0, 64),
        ok ? 1 : 0
      );
    } catch (err) {
      console.error('[MAIL AUDIT] could not write entry:', err.message);
    }
  },

  recent(limit = 50) {
    return conn().prepare(
      'SELECT createdAt, actor, action, target, detail, ip, ok FROM MailAuditLog ORDER BY createdAt DESC LIMIT ?'
    ).all(Math.min(Math.max(Number(limit) || 50, 1), 500));
  }
};
