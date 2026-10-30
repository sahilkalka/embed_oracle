// scripts/postinstall.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const schemaPath = path.join(rootDir, 'prisma', 'schema.prisma');

console.log('[POSTINSTALL] Executing post-install tasks...');

if (fs.existsSync(schemaPath)) {
  try {
    console.log(`[POSTINSTALL] Generating Prisma client using schema: ${schemaPath}`);
    execSync(`npx prisma generate --schema="${schemaPath}"`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log('[POSTINSTALL] Prisma client generated successfully.');
  } catch (err) {
    console.warn('[POSTINSTALL WARNING] Prisma generation deferred to application startup:', err.message);
  }
} else {
  console.log('[POSTINSTALL NOTICE] Prisma schema not found in postinstall, will generate on app startup.');
}

// Always exit 0 so npm install in cPanel never fails
process.exit(0);
