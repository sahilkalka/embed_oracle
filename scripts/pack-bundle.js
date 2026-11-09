// Build a cPanel deployment archive from an explicit runtime allowlist.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const zipOutput = path.join(rootDir, 'embeddedindia.zip');
const temporaryOutput = zipOutput + '.tmp';
const runtimeDirectories = ['src', 'views', 'public', 'embed_mail', 'scripts'];
const runtimeFiles = [
  'app.js', 'package.json', 'package-lock.json',
  'tailwind.config.js', 'prisma/schema.prisma'
];
const optionalRuntimeFiles = [
  'server-deploy.sh', '.cpanel.yml', 'scripts/cpanel-deploy.sh'
];
const excludedDirectories = new Set([
  'node_modules', 'tmp', 'scratch', 'reports', 'logs', 'tests', '__tests__',
  'test-results', 'playwright-report', 'coverage', '__pycache__'
]);

function isExcluded(name) {
  return name.startsWith('.') ||
    /\.(?:db|sqlite|sqlite3)(?:[-.].*)?$/i.test(name) ||
    /\.(?:log|bak(?:\..*)?|tmp|temp|map|tsbuildinfo|zip|tar|gz|7z)$/i.test(name) ||
    /(?:^|[.-])(?:test|spec)\.[cm]?[jt]sx?$/i.test(name) ||
    /^(?:Thumbs\.db|desktop\.ini)$/i.test(name);
}

function collectFiles(root = rootDir) {
  const files = new Set();
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    const entry = fs.lstatSync(absolute);
    // Do not follow links into dependencies or files outside the deployment tree.
    if (entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        if (excludedDirectories.has(name.toLowerCase()) || isExcluded(name)) continue;
        visit(path.join(relative, name));
      }
    } else if (entry.isFile()) {
      files.add(relative.split(path.sep).join('/'));
    }
  }
  for (const relative of runtimeFiles) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error('Required deployment file missing: ' + relative);
    visit(relative);
  }
  for (const relative of optionalRuntimeFiles) {
    if (fs.existsSync(path.join(root, relative))) visit(relative);
  }
  for (const relative of runtimeDirectories) visit(relative);
  return Array.from(files).sort();
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? [['python', []], ['py', ['-3']], ['python3', []]]
    : [['python3', []], ['python', []]];
  for (const [command, args] of candidates) {
    const result = spawnSync(command, [...args, '--version'], { encoding: 'utf8', windowsHide: true });
    if (!result.error && result.status === 0 && /Python 3\./.test((result.stdout || '') + (result.stderr || ''))) return [command, args];
  }
  throw new Error('Python 3 is required to create the deployment ZIP.');
}

function pack() {
  try {
    console.log('[1/3] Building production CSS locally...');
    execFileSync(process.execPath, [
      require.resolve('tailwindcss/lib/cli.js'),
      '-i', './src/public/css/input.css', '-o', './public/css/style.css', '--minify'
    ], { cwd: rootDir, stdio: 'inherit', windowsHide: true });

    console.log('[2/3] Ensuring pre-built lead magnet PDF...');
    const leadMagnetPath = path.join(rootDir, 'public/downloads/embedded-design-checklist.pdf');
    if (!fs.existsSync(leadMagnetPath) || fs.statSync(leadMagnetPath).size === 0) {
      execFileSync(process.execPath, [path.join(rootDir, 'scripts/generate-lead-magnet.js')], { cwd: rootDir, stdio: 'inherit', windowsHide: true });
    }

    const files = collectFiles();
    const [python, args] = findPython();
    console.log('[3/3] Packing pre-built zero-server-build release bundle...');
    const pythonScript = [
      'import json, os, sys, zipfile',
      'bundle = json.load(sys.stdin)',
      'with zipfile.ZipFile(bundle["output"], "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:',
      '    for name in bundle["files"]:',
      '        archive.write(os.path.join(bundle["root"], name), name)',
      'with zipfile.ZipFile(bundle["output"]) as archive:',
      '    bad = archive.testzip()',
      '    if bad: raise RuntimeError("Corrupt ZIP entry: " + bad)'
    ].join('\n');
    execFileSync(python, [...args, '-c', pythonScript], {
      input: JSON.stringify({ root: rootDir, output: temporaryOutput, files }),
      cwd: rootDir, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true
    });
    fs.renameSync(temporaryOutput, zipOutput);
    const size = (fs.statSync(zipOutput).size / 1024 / 1024).toFixed(2);
    console.log(`Created embeddedindia.zip: ${files.length} files, ${size} MB.`);
    console.log('Excluded databases, environment files, dependencies, reports, tests, and temporary files.');
  } finally {
    if (fs.existsSync(temporaryOutput)) fs.unlinkSync(temporaryOutput);
  }
}

if (require.main === module) {
  try { pack(); } catch (error) { console.error('Packaging failed:', error.message); process.exitCode = 1; }
}
module.exports = { collectFiles, isExcluded };
