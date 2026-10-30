// scripts/reset-admin.js
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const db = new Database(dbPath);

const adminEmail = (process.argv[2] || process.env.ADMIN_DEFAULT_EMAIL || 'admin@embeddedindia.in').trim().toLowerCase();
const rawPassword = process.argv[3] || process.env.ADMIN_DEFAULT_PASSWORD || 'AdminEmbedded@2026!';

console.log(`🔐 Setting up Admin Account [${adminEmail}]...`);

const passwordHash = bcrypt.hashSync(rawPassword, 10);
const now = new Date().toISOString();

const existing = db.prepare("SELECT id, email, username FROM User WHERE email = ? OR username = 'admin'").get(adminEmail);

if (existing) {
  db.prepare(`
    UPDATE User 
    SET passwordHash = ?, email = ?, role = 'admin', updatedAt = ?
    WHERE id = ?
  `).run(passwordHash, adminEmail, now, existing.id);
  console.log(`✅ Admin password reset successfully for: ${adminEmail} (id: ${existing.id})`);
} else {
  const newId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO User (id, username, email, passwordHash, role, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newId, 'admin', adminEmail, passwordHash, 'admin', now, now);
  console.log(`✅ Admin account created: ${adminEmail} (id: ${newId})`);
}

console.log(`🔑 Credentials:\n   Email:    ${adminEmail}\n   Password: ${rawPassword}\n`);
db.close();

