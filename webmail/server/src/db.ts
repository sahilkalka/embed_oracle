import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { config } from './config';

// Ensure storage directories exist
if (!fs.existsSync(config.storageDir)) fs.mkdirSync(config.storageDir, { recursive: true });
if (!fs.existsSync(config.attachmentsDir)) fs.mkdirSync(config.attachmentsDir, { recursive: true });
if (!fs.existsSync(config.emlDir)) fs.mkdirSync(config.emlDir, { recursive: true });

export const prisma = new PrismaClient();

// Enable SQLite Write-Ahead Logging (WAL) and memory cache tuning for blazing performance
async function initDbOptimizations() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;'); // 64MB cache in RAM
    await prisma.$queryRawUnsafe('PRAGMA temp_store = MEMORY;');
  } catch (err) {
    console.warn('SQLite PRAGMA optimization warning:', err);
  }
}

initDbOptimizations();
