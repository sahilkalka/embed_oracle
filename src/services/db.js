// src/services/db.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const defaultDbPath = path.resolve(__dirname, '../../prisma/dev.db');
const prismaDir = path.dirname(defaultDbPath);
if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

let sqliteDb;
const stmtCache = new Map();
const MAX_STMT_CACHE = 250;

function getSqliteDb() {
  if (!sqliteDb) {
    sqliteDb = new Database(defaultDbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('synchronous = NORMAL');
    sqliteDb.pragma('temp_store = MEMORY');
    sqliteDb.pragma('mmap_size = 268435456'); // 256 MB memory-mapped reads
    sqliteDb.pragma('cache_size = -65536');   // 64 MB page cache in RAM
    sqliteDb.pragma('busy_timeout = 5000');
  }
  return sqliteDb;
}

function prepareCached(db, sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    if (stmtCache.size >= MAX_STMT_CACHE) {
      const oldestKey = stmtCache.keys().next().value;
      stmtCache.delete(oldestKey);
    }
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

// Helper to filter columns based on select options
function applySelect(row, select) {
  if (!row || !select || typeof select !== 'object') return row;
  const filtered = {};
  for (const [key, val] of Object.entries(select)) {
    if (val && key in row) {
      filtered[key] = row[key];
    }
  }
  return filtered;
}

// Convert SQLite row values (like integer booleans or ISO dates) to standard JS types
function normalizeRow(row) {
  if (!row) return row;
  const res = { ...row };
  if ('leadMagnetSent' in res) {
    res.leadMagnetSent = Boolean(res.leadMagnetSent);
  }
  if ('featured' in res) {
    res.featured = Boolean(res.featured);
  }
  if ('isApproved' in res) {
    res.isApproved = Boolean(res.isApproved);
  }
  if ('isPublic' in res) {
    res.isPublic = Boolean(res.isPublic);
  }
  if (res.createdAt && typeof res.createdAt === 'string') {
    res.createdAt = new Date(res.createdAt);
  }
  if (res.updatedAt && typeof res.updatedAt === 'string') {
    res.updatedAt = new Date(res.updatedAt);
  }
  if (res.publishedAt && typeof res.publishedAt === 'string') {
    res.publishedAt = new Date(res.publishedAt);
  }
  if (res.scheduledAt && typeof res.scheduledAt === 'string') {
    res.scheduledAt = new Date(res.scheduledAt);
  }
  if (res.verifiedAt && typeof res.verifiedAt === 'string') {
    res.verifiedAt = new Date(res.verifiedAt);
  }
  if (res.timestamp && typeof res.timestamp === 'string') {
    res.timestamp = new Date(res.timestamp);
  }
  return res;
}

// Build SQL WHERE clause from Prisma query object
function buildWhereClause(where) {
  if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
    return { clause: '', params: [] };
  }

  const parts = [];
  const params = [];

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(val)) {
      const orParts = [];
      for (const condition of val) {
        const sub = buildWhereClause(condition);
        if (sub.clause) {
          orParts.push(sub.clause.replace(/^WHERE\s+/, ''));
          params.push(...sub.params);
        }
      }
      if (orParts.length > 0) {
        parts.push(`(${orParts.join(' OR ')})`);
      }
    } else if (key === 'AND' && Array.isArray(val)) {
      const andParts = [];
      for (const condition of val) {
        const sub = buildWhereClause(condition);
        if (sub.clause) {
          andParts.push(sub.clause.replace(/^WHERE\s+/, ''));
          params.push(...sub.params);
        }
      }
      if (andParts.length > 0) {
        parts.push(`(${andParts.join(' AND ')})`);
      }
    } else if (val === null) {
      parts.push(`\`${key}\` IS NULL`);
    } else if (typeof val === 'object' && !(val instanceof Date)) {
      if ('contains' in val) {
        parts.push(`\`${key}\` LIKE ?`);
        params.push(`%${val.contains}%`);
      } else if ('gt' in val) {
        parts.push(`\`${key}\` > ?`);
        params.push(val.gt instanceof Date ? val.gt.toISOString() : val.gt);
      } else if ('gte' in val) {
        parts.push(`\`${key}\` >= ?`);
        params.push(val.gte instanceof Date ? val.gte.toISOString() : val.gte);
      } else if ('lt' in val) {
        parts.push(`\`${key}\` < ?`);
        params.push(val.lt instanceof Date ? val.lt.toISOString() : val.lt);
      } else if ('lte' in val) {
        parts.push(`\`${key}\` <= ?`);
        params.push(val.lte instanceof Date ? val.lte.toISOString() : val.lte);
      } else if ('not' in val) {
        if (val.not === null) {
          parts.push(`\`${key}\` IS NOT NULL`);
        } else {
          parts.push(`\`${key}\` != ?`);
          params.push(typeof val.not === 'boolean' ? (val.not ? 1 : 0) : val.not);
        }
      } else if ('in' in val && Array.isArray(val.in)) {
        if (val.in.length === 0) {
          parts.push('1 = 0');
        } else {
          const placeholders = val.in.map(() => '?').join(', ');
          parts.push(`\`${key}\` IN (${placeholders})`);
          params.push(...val.in.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v)));
        }
      }
    } else {
      parts.push(`\`${key}\` = ?`);
      params.push(
        val instanceof Date
          ? val.toISOString()
          : typeof val === 'boolean'
            ? (val ? 1 : 0)
            : val
      );
    }
  }

  return {
    clause: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    params
  };
}

function createModelHandler(tableName) {
  return {
    async findUnique(options = {}) {
      const db = getSqliteDb();
      const { where, select } = options;
      const { clause, params } = buildWhereClause(where);
      if (!clause) return null;
      const row = prepareCached(db, `SELECT * FROM \`${tableName}\` ${clause} LIMIT 1`).get(...params);
      if (!row) return null;
      return applySelect(normalizeRow(row), select);
    },

    async findFirst(options = {}) {
      const db = getSqliteDb();
      const { where, orderBy, select } = options;
      const { clause, params } = buildWhereClause(where);
      let sql = `SELECT * FROM \`${tableName}\` ${clause}`;
      if (orderBy) {
        const orderCols = Array.isArray(orderBy) ? orderBy : [orderBy];
        const orderParts = orderCols.map(o => {
          const [col, dir] = Object.entries(o)[0];
          return `\`${col}\` ${dir.toUpperCase()}`;
        });
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }
      sql += ' LIMIT 1';
      const row = prepareCached(db, sql).get(...params);
      if (!row) return null;
      return applySelect(normalizeRow(row), select);
    },

    async findMany(options = {}) {
      const db = getSqliteDb();
      const { where, orderBy, take, skip, select } = options;
      const { clause, params } = buildWhereClause(where);
      let sql = `SELECT * FROM \`${tableName}\` ${clause}`;

      if (orderBy) {
        const orderCols = Array.isArray(orderBy) ? orderBy : [orderBy];
        const orderParts = orderCols.map(o => {
          const [col, dir] = Object.entries(o)[0];
          return `\`${col}\` ${dir.toUpperCase()}`;
        });
        sql += ` ORDER BY ${orderParts.join(', ')}`;
      }

      if (take !== undefined) {
        sql += ` LIMIT ${Number(take)}`;
        if (skip !== undefined) {
          sql += ` OFFSET ${Number(skip)}`;
        }
      } else if (skip !== undefined) {
        sql += ` LIMIT -1 OFFSET ${Number(skip)}`;
      }

      const rows = prepareCached(db, sql).all(...params);
      return rows.map(r => applySelect(normalizeRow(r), select));
    },

    async count(options = {}) {
      const db = getSqliteDb();
      const { where } = options;
      const { clause, params } = buildWhereClause(where);
      const sql = `SELECT COUNT(*) as count FROM \`${tableName}\` ${clause}`;
      const res = prepareCached(db, sql).get(...params);
      return res ? Number(res.count) : 0;
    },

    async create(options = {}) {
      const db = getSqliteDb();
      const { data, select } = options;
      const record = { ...data };
      if (!record.id) {
        record.id = crypto.randomUUID();
      }
      const now = new Date().toISOString();
      if (tableName === 'Analytics') {
        if ('timestamp' in record && record.timestamp instanceof Date) {
          record.timestamp = record.timestamp.toISOString();
        } else if (!record.timestamp) {
          record.timestamp = now;
        }
      } else {
        if ('createdAt' in record && record.createdAt instanceof Date) {
          record.createdAt = record.createdAt.toISOString();
        } else if (!record.createdAt && tableName !== 'CalculatorStat') {
          record.createdAt = now;
        }
        if ('updatedAt' in record && record.updatedAt instanceof Date) {
          record.updatedAt = record.updatedAt.toISOString();
        } else if (!record.updatedAt) {
          record.updatedAt = now;
        }
      }
      if ('publishedAt' in record && record.publishedAt instanceof Date) {
        record.publishedAt = record.publishedAt.toISOString();
      }
      if ('scheduledAt' in record && record.scheduledAt instanceof Date) {
        record.scheduledAt = record.scheduledAt.toISOString();
      }
      if ('verifiedAt' in record && record.verifiedAt instanceof Date) {
        record.verifiedAt = record.verifiedAt.toISOString();
      }
      for (const k of Object.keys(record)) {
        if (typeof record[k] === 'boolean') {
          record[k] = record[k] ? 1 : 0;
        }
      }

      const cols = Object.keys(record);
      const placeholders = cols.map(() => '?').join(', ');
      const values = cols.map(c => record[c]);

      const sql = `INSERT INTO \`${tableName}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
      prepareCached(db, sql).run(...values);

      if (tableName === 'Analytics') {
        return applySelect(normalizeRow(record), select);
      }

      const inserted = prepareCached(db, `SELECT * FROM \`${tableName}\` WHERE id = ?`).get(record.id);
      return applySelect(normalizeRow(inserted), select);
    },

    async update(options = {}) {
      const db = getSqliteDb();
      const { where, data, select } = options;
      const { clause, params: whereParams } = buildWhereClause(where);
      if (!clause) throw new Error('Update requires a where clause');

      const updateData = { ...data };
      const setParts = [];
      const setParams = [];

      const isPureIncrement = Object.values(updateData).every(
        v => v && typeof v === 'object' && 'increment' in v
      );
      if (!('updatedAt' in updateData) && !(tableName === 'Post' && isPureIncrement)) {
        updateData.updatedAt = new Date().toISOString();
      }

      for (const [key, val] of Object.entries(updateData)) {
        if (val && typeof val === 'object' && 'increment' in val) {
          setParts.push(`\`${key}\` = \`${key}\` + ?`);
          setParams.push(val.increment);
        } else if (val instanceof Date) {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val.toISOString());
        } else if (typeof val === 'boolean') {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val ? 1 : 0);
        } else {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val);
        }
      }

      const sql = `UPDATE \`${tableName}\` SET ${setParts.join(', ')} ${clause}`;
      prepareCached(db, sql).run(...setParams, ...whereParams);

      if (tableName === 'Post' && isPureIncrement && !select) {
        return null;
      }

      const row = prepareCached(db, `SELECT * FROM \`${tableName}\` ${clause} LIMIT 1`).get(...whereParams);
      return applySelect(normalizeRow(row), select);
    },

    async updateMany(options = {}) {
      const db = getSqliteDb();
      const { where, data } = options;
      const { clause, params: whereParams } = buildWhereClause(where);
      const updateData = { ...data };
      const setParts = [];
      const setParams = [];

      for (const [key, val] of Object.entries(updateData)) {
        if (val instanceof Date) {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val.toISOString());
        } else if (typeof val === 'boolean') {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val ? 1 : 0);
        } else {
          setParts.push(`\`${key}\` = ?`);
          setParams.push(val);
        }
      }

      const sql = `UPDATE \`${tableName}\` SET ${setParts.join(', ')} ${clause}`;
      const result = prepareCached(db, sql).run(...setParams, ...whereParams);
      return { count: result.changes };
    },

    async upsert(options = {}) {
      const { where, update, create, select } = options;
      const existing = await this.findFirst({ where });
      if (existing) {
        return this.update({ where: { id: existing.id }, data: update, select });
      } else {
        const createData = { ...where, ...create };
        return this.create({ data: createData, select });
      }
    },

    async delete(options = {}) {
      const db = getSqliteDb();
      const { where, select } = options;
      const { clause, params } = buildWhereClause(where);
      if (!clause) throw new Error('Delete requires a where clause');

      const existing = prepareCached(db, `SELECT * FROM \`${tableName}\` ${clause} LIMIT 1`).get(...params);
      prepareCached(db, `DELETE FROM \`${tableName}\` ${clause}`).run(...params);
      return applySelect(normalizeRow(existing), select);
    },

    async deleteMany(options = {}) {
      const db = getSqliteDb();
      const { where } = options;
      const { clause, params } = buildWhereClause(where);
      const result = prepareCached(db, `DELETE FROM \`${tableName}\` ${clause}`).run(...params);
      return { count: result.changes };
    }
  };
}

// Write-behind batching for high-frequency telemetry on Block Storage
const pendingAnalytics = [];
const pendingPostViews = new Map();
const pendingToolStats = new Map();
let flushTimer = null;

function flushWriteBuffer() {
  if (pendingAnalytics.length === 0 && pendingPostViews.size === 0 && pendingToolStats.size === 0) {
    return;
  }
  try {
    const db = getSqliteDb();
    const analyticsBatch = pendingAnalytics.splice(0, pendingAnalytics.length);
    const postViewsBatch = Array.from(pendingPostViews.entries());
    pendingPostViews.clear();
    const toolStatsBatch = Array.from(pendingToolStats.entries());
    pendingToolStats.clear();

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      if (analyticsBatch.length > 0) {
        const insertAnalytics = prepareCached(
          db,
          'INSERT INTO `Analytics` (`id`, `path`, `referrer`, `userAgent`, `timestamp`, `trafficType`) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const item of analyticsBatch) {
          insertAnalytics.run(
            crypto.randomUUID(),
            item.path,
            item.referrer,
            item.userAgent,
            item.timestamp || now,
            item.trafficType || 'legacy'
          );
        }
      }
      if (postViewsBatch.length > 0) {
        const updatePostViews = prepareCached(db, 'UPDATE `Post` SET `views` = `views` + ? WHERE `id` = ?');
        for (const [postId, delta] of postViewsBatch) {
          updatePostViews.run(delta, postId);
        }
      }
      if (toolStatsBatch.length > 0) {
        const findStat = prepareCached(db, 'SELECT `id` FROM `CalculatorStat` WHERE `toolName` = ? LIMIT 1');
        const updateStat = prepareCached(db, 'UPDATE `CalculatorStat` SET `executionCount` = `executionCount` + ?, `updatedAt` = ? WHERE `id` = ?');
        const insertStat = prepareCached(db, 'INSERT INTO `CalculatorStat` (`id`, `toolName`, `executionCount`, `updatedAt`) VALUES (?, ?, ?, ?)');
        for (const [toolName, delta] of toolStatsBatch) {
          const existing = findStat.get(toolName);
          if (existing) {
            updateStat.run(delta, now, existing.id);
          } else {
            insertStat.run(crypto.randomUUID(), toolName, delta, now);
          }
        }
      }
    });
    tx();
  } catch (err) {
    // Fail-open on background telemetry flush
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushWriteBuffer();
  }, 15000);
  if (typeof flushTimer.unref === 'function') {
    flushTimer.unref();
  }
}

function ensureIndexes(db) {
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_post_status_publishedAt ON Post(status, publishedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_post_category_status ON Post(category, status);
      CREATE INDEX IF NOT EXISTS idx_project_featured_order ON Project(featured DESC, \`order\` ASC, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_project_category ON Project(category);
      CREATE INDEX IF NOT EXISTS idx_testimonial_approved_created ON Testimonial(isApproved, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_inquiry_status_created ON Inquiry(status, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_subscriber_status ON Subscriber(status);
      CREATE INDEX IF NOT EXISTS idx_calculatorstat_toolname ON CalculatorStat(toolName);
      CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON Analytics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_analytics_traffic_timestamp ON Analytics(trafficType, timestamp);
    `);
  } catch (_) {
    // Tables may not all exist yet prior to init-db
  }
}

const sqlitePrisma = {
  user: createModelHandler('User'),
  post: createModelHandler('Post'),
  project: createModelHandler('Project'),
  inquiry: createModelHandler('Inquiry'),
  subscriber: createModelHandler('Subscriber'),
  setting: createModelHandler('Setting'),
  analytics: createModelHandler('Analytics'),
  calculatorStat: createModelHandler('CalculatorStat'),
  testimonial: createModelHandler('Testimonial'),
  telemetryBlock: createModelHandler('TelemetryBlock'),

  recordPageView(data) {
    if (process.env.NODE_ENV === 'test') {
      return this.analytics.create({ data }).catch(() => {});
    }
    if (pendingAnalytics.length < 2000) {
      pendingAnalytics.push({
        path: data.path,
        referrer: data.referrer || null,
        userAgent: data.userAgent || null,
        trafficType: data.trafficType || 'legacy',
        timestamp: new Date().toISOString()
      });
      scheduleFlush();
    }
  },

  incrementPostView(postId) {
    if (!postId) return;
    if (process.env.NODE_ENV === 'test') {
      return this.post.update({ where: { id: postId }, data: { views: { increment: 1 } } }).catch(() => {});
    }
    pendingPostViews.set(postId, (pendingPostViews.get(postId) || 0) + 1);
    scheduleFlush();
  },

  incrementToolExecution(toolName) {
    const normalizedName = String(toolName || '').toLowerCase().trim();
    if (!normalizedName) return;
    if (process.env.NODE_ENV === 'test') {
      return (async () => {
        const stat = await this.calculatorStat.findFirst({ where: { toolName: normalizedName } });
        if (stat) {
          await this.calculatorStat.update({ where: { id: stat.id }, data: { executionCount: { increment: 1 } } });
        } else {
          await this.calculatorStat.create({ data: { toolName: normalizedName, executionCount: 1 } });
        }
      })().catch(() => {});
    }
    pendingToolStats.set(normalizedName, (pendingToolStats.get(normalizedName) || 0) + 1);
    scheduleFlush();
  },

  flushWriteBuffer,

  runMaintenance(retentionDays = 90) {
    try {
      flushWriteBuffer();
      const db = getSqliteDb();
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      prepareCached(db, 'DELETE FROM `Analytics` WHERE `timestamp` < ?').run(cutoff);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.pragma('optimize');
    } catch (_) {}
  },

  async $disconnect() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushWriteBuffer();
    stmtCache.clear();
    if (sqliteDb) {
      sqliteDb.close();
      sqliteDb = null;
    }
  },

  async $connect() {
    getSqliteDb();
  }
};

// Native better-sqlite3 is the default high-performance engine for ARM64 / Oracle Cloud.
// Set USE_PRISMA_ENGINE=true only if explicitly forcing Prisma's Rust query engine.
let activeClient = sqlitePrisma;

if (process.env.USE_PRISMA_ENGINE === 'true') {
  try {
    const { PrismaClient } = require('@prisma/client');
    activeClient = new PrismaClient({
      datasources: {
        db: { url: `file:${defaultDbPath}` }
      },
      log: ['error']
    });
    for (const [key, handler] of Object.entries(sqlitePrisma)) {
      if (!key.startsWith('$') && activeClient[key] === undefined) {
        activeClient[key] = handler;
      }
    }
  } catch (e) {
    activeClient = sqlitePrisma;
  }
}

// Install on startup as well, so restarting an existing installation protects it.
const guardDb = getSqliteDb();
guardDb.exec(`
CREATE TABLE IF NOT EXISTS Analytics (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  referrer TEXT,
  userAgent TEXT,
  ipHash TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  trafficType TEXT NOT NULL DEFAULT 'legacy'
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
CREATE TABLE IF NOT EXISTS TelemetryBlock (
  id TEXT PRIMARY KEY,
  visitorHash TEXT UNIQUE NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);
const analyticsColumns = guardDb.pragma('table_info(Analytics)');
if (!analyticsColumns.some(column => column.name === 'trafficType')) {
  guardDb.exec("ALTER TABLE Analytics ADD COLUMN trafficType TEXT NOT NULL DEFAULT 'legacy'");
}
if (guardDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Post'").get()) {
  require('./postDuplicates').installPostDuplicateGuards(guardDb);
  ensureIndexes(guardDb);
}
module.exports = activeClient;
