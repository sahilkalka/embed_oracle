const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = fs.readFileSync(path.join(__dirname, '../server-deploy.sh'), 'utf8');
const base = fs.mkdtempSync(path.join(__dirname, '../scratch/deploy-test-'));
const posix = p => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, c) => '/' + c.toLowerCase());
const home = posix(base);
const helper=path.join(base,'mock-cloudlinux-install.cjs');
fs.writeFileSync(helper,`const fs=require('fs'),path=require('path');
const root=process.cwd(), target=path.join(path.dirname(root),'nodevenv',path.basename(root),'22','lib','node_modules');
fs.mkdirSync(target,{recursive:true});
if(!fs.existsSync('node_modules'))fs.symlinkSync(target,'node_modules',process.platform==='win32'?'junction':'dir');`);

const run = (file, ...args) => spawnSync(bash, [file, ...args], { encoding: 'utf8', env: { ...process.env, REAL_NODE: posix(process.execPath), MOCK_INSTALL_HELPER: posix(helper) } });
try {
  for (const [target, folder, domain] of [['default', 'embeddedindia.in', 'embeddedindia.in'], ['new', 'new', 'new.embeddedindia.in']]) {
    const root = path.join(base, folder);
    fs.mkdirSync(root, { recursive: true });
    const deploy = path.join(root, 'server-deploy.sh');
    fs.writeFileSync(deploy, script.replaceAll('/home/jiazxebj', home));
    let result = run(deploy, target);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Incomplete upload/);
    for (const file of ['app.js', 'src/server.js', 'package.json', 'package-lock.json', 'prisma/schema.prisma', 'scripts/init-db.js', 'scripts/seed-sqlite.js', 'src/deployment-check.js', 'src/public/css/input.css', 'tailwind.config.js']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), file.endsWith('.json') ? '{}' : '// fixture\n');
    }
    fs.mkdirSync(path.join(root, 'public/downloads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public/downloads/embedded-design-checklist.pdf'), '%PDF-fixture');
    const activate = path.join(base, 'nodevenv', folder, '22/bin/activate');
    fs.mkdirSync(path.dirname(activate), { recursive: true });
    fs.writeFileSync(activate, `
node() {
  case "\${1:-}" in
    -v) echo v22.17.0 ;;
    -p) echo 22 ;;
    --check|-e|-) "$REAL_NODE" "$@" ;;
    "") cat >/dev/null; printf yes ;;
    *) return 0 ;;
  esac
}
npm() {
  echo "$*" >> npm-calls.log
  if [ "\${1:-}" = prune ]; then echo "prune must never run against the managed link" >&2; return 42; fi
  if [ "\${1:-}" = install ]; then "$REAL_NODE" "$MOCK_INSTALL_HELPER"; fi
  if [ "\${1:-}" = -v ]; then echo 10.9.2; fi
  if [ "\${1:-}" = run ]; then echo 'built stylesheet' > public/css/style.css; fi
}
curl() { cat public/deployment-version.json; }
`);
    result = run(deploy, target, 'update');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Verified:/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/deployment-version.json'))).domain, domain);
    assert.ok(fs.existsSync(path.join(root, 'tmp/restart.txt')));
    assert.match(fs.readFileSync(path.join(root, 'npm-calls.log'), 'utf8'), /run build:css/);
    assert(!fs.readFileSync(path.join(root,'npm-calls.log'),'utf8').includes('prune'),'CloudLinux deployment never prunes its dependency link');
    assert.match(fs.readFileSync(path.join(root, '.env'), 'utf8'), new RegExp('APP_URL=https://' + domain.replaceAll('.', '\\.')));

    const modules=path.join(root,'node_modules');assert(fs.lstatSync(modules).isSymbolicLink(),'npm creates the managed link');
    const expected=fs.realpathSync(modules);
    // A regular directory is preserved, then replaced by the correct managed link.
    fs.unlinkSync(modules);fs.mkdirSync(modules);fs.writeFileSync(path.join(modules,'keep.txt'),'old dependencies');
    result=run(deploy,target);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(fs.realpathSync(modules),expected);
    const backups=fs.readdirSync(path.join(root,'tmp')).filter(n=>n.startsWith('node_modules.pre-deploy.'));
    assert(backups.some(n=>fs.existsSync(path.join(root,'tmp',n,'node_modules','keep.txt'))),'original dependency directory backed up');
    // A wrong-site link is moved as a link; its target must never be modified.
    const foreign=path.join(base,'foreign-'+folder);fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'keep.txt'),'other site');
    fs.unlinkSync(modules);fs.symlinkSync(foreign,modules,process.platform==='win32'?'junction':'dir');
    result=run(deploy,target);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(fs.readFileSync(path.join(foreign,'keep.txt'),'utf8'),'other site');assert.equal(fs.realpathSync(modules),expected);
    // Existing secrets/data survive a mode-only invocation; target is inferred from folder.
    fs.appendFileSync(path.join(root, '.env'), 'PRESERVE_ME=keep\n');
    result = run(deploy, 'update');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(fs.readFileSync(path.join(root, '.env'), 'utf8'), /PRESERVE_ME=keep/);
    result = run(deploy, target === 'new' ? 'default' : 'new');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Wrong app root/);
    // Exercise ZIP -> extraction -> re-exec -> installation from outside the app root.
    const archive=path.join(base,'release with spaces.zip');
    const required=['app.js','src/server.js','package.json','package-lock.json','server-deploy.sh','prisma/schema.prisma','scripts/init-db.js','scripts/seed-sqlite.js','src/deployment-check.js','src/public/css/input.css','tailwind.config.js'];
    let zipResult=spawnSync(process.platform==='win32'?'python':'python3',['-c', 'import zipfile,sys,json,os; z=zipfile.ZipFile(sys.argv[1], "w"); [z.write(os.path.join(sys.argv[2],p),p) for p in json.load(sys.stdin)]; z.close()', archive,root],{input:JSON.stringify(required),encoding:'utf8'});
    assert.equal(zipResult.status,0,zipResult.stderr);
    const bootstrap=path.join(base,'bootstrap.sh');fs.writeFileSync(bootstrap,script.replaceAll('/home/jiazxebj',home));
    const wrapper=process.platform==='win32' ? 'python3() { if [ "$1" = "-" ]; then command python - "$(cygpath -w "$2")" "$(cygpath -w "$3")"; else command python "$@"; fi; }; export -f python3; exec /bin/bash "$@"' : 'exec /bin/bash "$@"';
    result=spawnSync(bash,['-c',wrapper,'zip-test',posix(bootstrap),target,posix(archive)],{encoding:'utf8',env:{...process.env,REAL_NODE:posix(process.execPath),MOCK_INSTALL_HELPER:posix(helper)}});
    assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/Extracted 11 deployment files/);assert.match(result.stdout,/Verified:/);
    fs.appendFileSync(activate, '\ncurl() { printf \'{"id":"stale"}\'; }\n');
    result = run(deploy, target);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Live update is NOT verified/);
    console.log(`${target}: upload validation, target environment, build, restart, preservation, CloudLinux link repair, foreign-link safety, wrong-root rejection, stale-site detection passed`);
  }
} finally {
  const safe = path.resolve(__dirname, '../scratch') + path.sep;
  if (!path.resolve(base).startsWith(safe)) throw new Error('Unsafe cleanup path');
  fs.rmSync(base, { recursive: true, force: true });
}
