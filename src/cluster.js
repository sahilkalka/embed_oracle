/**
 * High-Performance Multi-Core Cluster Entrypoint for Oracle Cloud (VM.Standard.A1.Flex)
 *
 * Forks worker processes across available ARM64 OCPUs (default: min(cpus, 4))
 * while ensuring database initialization and background cron jobs run only once.
 */
const cluster = require('node:cluster');
const os = require('node:os');
const path = require('node:path');

try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (_) {}

const requestedWorkers = parseInt(process.env.WEB_CONCURRENCY || process.env.CLUSTER_WORKERS || '0', 10);
const numCpus = os.cpus().length;
const workerCount = requestedWorkers > 0 ? requestedWorkers : Math.min(Math.max(numCpus, 1), 4);

if (cluster.isPrimary && workerCount > 1 && process.env.NODE_ENV !== 'test') {
  console.log(`[CLUSTER] Primary ${process.pid} starting ${workerCount} ARM64/CPU workers...`);

  // Run one-time DB self-bootstrap before forking workers to prevent race conditions
  const fs = require('node:fs');
  const { execFileSync } = require('node:child_process');
  const rootDir = path.resolve(__dirname, '..');
  const prismaDir = path.join(rootDir, 'prisma');
  const dbFile = path.join(prismaDir, 'dev.db');
  if (!fs.existsSync(prismaDir)) fs.mkdirSync(prismaDir, { recursive: true });
  if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) {
    execFileSync(process.execPath, [path.join(rootDir, 'scripts/init-db.js')], { cwd: rootDir, stdio: 'inherit' });
    execFileSync(process.execPath, [path.join(rootDir, 'scripts/seed-sqlite.js')], { cwd: rootDir, stdio: 'inherit' });
  }

  const workerIds = new Map();
  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork({ NODE_APP_INSTANCE: String(i) });
    workerIds.set(worker.id, i);
  }

  let shuttingDown = false;
  cluster.on('exit', (worker, code, signal) => {
    const instanceIndex = workerIds.get(worker.id) ?? 1;
    workerIds.delete(worker.id);
    if (!shuttingDown) {
      console.warn(`[CLUSTER] Worker ${worker.process.pid} (instance ${instanceIndex}) exited (${signal || code}). Respawning...`);
      const replacement = cluster.fork({ NODE_APP_INSTANCE: String(instanceIndex) });
      workerIds.set(replacement.id, instanceIndex);
    }
  });

  const shutdownCluster = (signal) => {
    shuttingDown = true;
    console.log(`[CLUSTER] Primary received ${signal}. Stopping workers gracefully...`);
    for (const id of Object.keys(cluster.workers)) {
      cluster.workers[id]?.process.kill(signal);
    }
    setTimeout(() => process.exit(0), 6000).unref();
  };

  process.once('SIGTERM', () => shutdownCluster('SIGTERM'));
  process.once('SIGINT', () => shutdownCluster('SIGINT'));
} else {
  require('../app');
}

