const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { collectFiles } = require('./pack-bundle');
const root = path.resolve(__dirname, '..');
const files = collectFiles(root);
for (const required of ['app.js', 'package-lock.json', 'prisma/schema.prisma', 'scripts/init-db.js', 'scripts/seed-sqlite.js', 'scripts/oracle-setup.sh', 'scripts/oracle-deploy.sh', 'src/server.js', 'src/cluster.js', 'public/css/style.css']) {
  assert(files.includes(required), 'Missing runtime file: ' + required);
}
const scratchDir = path.join(root, 'scratch');
fs.mkdirSync(scratchDir, { recursive: true });
const scratch = fs.realpathSync(scratchDir);
const fixture = fs.mkdtempSync(path.join(scratch, 'pack-filter-'));
try {
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), 'fixture');
  }
  for (const file of [
    '.env', '.env.production', 'README.md', 'reports/audit.png', 'scratch/screenshot.png',
    'scripts/test-ui.js', 'scripts/visual-inspect.js', 'prisma/dev.db', 'prisma/dev.db-wal',
    'src/debug.log', 'src/runtime.sqlite3', 'src/database.sqlite-wal', 'src/data.db.bak2026',
    'src/.env.local', 'src/example.test.js', 'src/example.spec.ts',
    'public/css/style.css.map', 'public/temp.zip', 'public/reports/audit.png',
    'src/nested/node_modules/dependency.js', 'views/__tests__/sample.ejs'
  ]) {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), 'must not be deployed');
  }
  assert.deepEqual(collectFiles(fixture), files, 'Excluded files leaked into the runtime manifest');
  fs.unlinkSync(path.join(fixture, 'app.js'));
  assert.throws(() => collectFiles(fixture), /Required deployment file missing: app.js/);
} finally {
  const resolved = fs.realpathSync(fixture);
  assert(resolved.startsWith(scratch + path.sep), 'Cleanup must remain within the test workspace');
  fs.rmSync(resolved, { recursive: true, force: true });
}
const archive = path.join(root, 'embeddedindia.zip');
if (fs.existsSync(archive)) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const entries = JSON.parse(execFileSync(python, ['-c', 'import json, sys, zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(sorted(z.namelist())))', archive], { encoding: 'utf8' }));
  assert.deepEqual(entries, files, 'ZIP contents must exactly match the deployment manifest');
  console.log('PASS: ZIP integrity and all ' + entries.length + ' deployment entries verified.');
}
console.log('PASS: runtime requirements, artifact/secret/database exclusions, and missing-file failure.');
