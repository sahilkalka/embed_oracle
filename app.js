/**
 * Embedded India - Self-Bootstrapping Root Entrypoint
 *
 * Initializes runtime directories and SQLite database on first start,
 * then delegates to the Express server.
 */
const fs = require('fs');
const path = require('path');

// 0. Ensure environment variables are loaded
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {}

// 1. Ensure required runtime directories exist
const prismaDir = path.join(__dirname, 'prisma');
const dbFile = path.join(prismaDir, 'dev.db');
const downloadsDir = path.join(__dirname, 'public/downloads');
const tmpDir = path.join(__dirname, 'tmp');

try {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });

  // Use restrictive permissions on dedicated Linux servers; only relax under cPanel Passenger
  const isPassenger = Boolean(process.env.PASSENGER_APP_ENV);
  if (fs.existsSync(dbFile)) {
    try { fs.chmodSync(dbFile, isPassenger ? 0o666 : 0o640); } catch (e) {}
  }
  try { fs.chmodSync(prismaDir, isPassenger ? 0o777 : 0o750); } catch (e) {}
} catch (err) {
  console.warn('[SELF-BOOTSTRAP NOTICE]', err.message);
}

// 2. Initialize a missing or unseeded SQLite database using the native database scripts
const initDbScript = path.join(__dirname, 'scripts/init-db.js');
const seedSqliteScript = path.join(__dirname, 'scripts/seed-sqlite.js');
try {
  let needsInitialization = false;
  if (!fs.existsSync(dbFile)) {
    needsInitialization = true;
  } else {
    try {
      const stats = fs.statSync(dbFile);
      if (stats.size === 0) {
        needsInitialization = true;
      } else {
        const Database = require('better-sqlite3');
        const testDb = new Database(dbFile, { readonly: true });
        const userTable = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get();
        if (!userTable) {
          needsInitialization = true;
        } else {
          const adminCount = testDb.prepare("SELECT COUNT(*) as count FROM User WHERE role = 'admin'").get();
          if (!adminCount || adminCount.count === 0) {
            needsInitialization = true;
          }
        }
        testDb.close();
      }
    } catch (_) {
      needsInitialization = true;
    }
  }

  if (needsInitialization) {
    if (!fs.existsSync(initDbScript) || !fs.existsSync(seedSqliteScript)) {
      throw new Error('SQLite initialization scripts are missing.');
    }

    const { execFileSync } = require('child_process');
    console.log('[SELF-BOOTSTRAP] Initializing SQLite database tables...');
    execFileSync(process.execPath, [initDbScript], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit'
    });
    console.log('[SELF-BOOTSTRAP] Seeding initial admin account and content...');
    execFileSync(process.execPath, [seedSqliteScript], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit'
    });
  }
} catch (dbErr) {
  console.error('[SELF-BOOTSTRAP DB ERROR]', dbErr);
  process.exit(1);
}

// 4. Delegate to express server
module.exports = require('./src/server');
