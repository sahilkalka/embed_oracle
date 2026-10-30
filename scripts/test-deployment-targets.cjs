const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/deploy-cpanel.yml'), 'utf8'));

function run(args, options = {}) {
  return spawnSync(bash, args, { cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, TARGET_SITE: '', MODE: 'update' }, ...options });
}
function temporary(check) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ei-domain-test-'));
  try { check(directory); }
  finally {
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'ei-domain-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
const expected = domain => `${domain}|/home/jiazxebj/${domain === 'embeddedindia.in' ? 'embeddedindia.in' : 'new'}|/home/jiazxebj/nodevenv/${domain === 'embeddedindia.in' ? 'embeddedindia.in' : 'new'}/22/bin/activate`;

test('both domains, complete URLs and legacy aliases resolve to isolated application roots', () => {
  for (const [domain, aliases] of [
    ['embeddedindia.in', ['embeddedindia.in', 'https://embeddedindia.in/', 'default', '1']],
    ['new.embeddedindia.in', ['new.embeddedindia.in', 'https://new.embeddedindia.in/', 'new', '2']]
  ]) {
    for (const alias of aliases) {
      const result = run(['server-deploy.sh', alias, '--print-target']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected(domain));
    }
  }
  const invalid = run(['server-deploy.sh', '../unexpected', '--print-target']);
  assert.notEqual(invalid.status, 0);
});

test('workflow exposes both domains, keeps pushes on staging and resolves actual outputs for each choice', () => {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.domain.options.sort(), ['embeddedindia.in', 'new.embeddedindia.in']);
  assert.equal(workflow.on.workflow_dispatch.inputs.domain.default, 'new.embeddedindia.in');
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.match(workflow.concurrency.group, /inputs.domain/);
  const steps = workflow.jobs.deploy.steps;
  const resolve = steps.find(step => step.id === 'target');
  assert.match(resolve.env.SELECTED_DOMAIN, /inputs.domain \|\| 'new.embeddedindia.in'/);
  for (const domain of ['embeddedindia.in', 'new.embeddedindia.in']) {
    temporary(directory => {
      const output = path.join(directory, 'output');
      const summary = path.join(directory, 'summary');
      const result = run(['-c', resolve.run], { env: { ...process.env, SELECTED_DOMAIN: domain, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
      assert.equal(result.status, 0, result.stderr);
      const values = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('=')));
      assert.equal([values.domain, values.app_root, values.activate].join('|'), expected(domain));
    });
  }
  const upload = steps.find(step => step.name?.startsWith('Upload,'));
  assert.equal(upload.env.DEPLOY_DOMAIN, '${{ steps.target.outputs.domain }}');
  assert.match(upload.run, /"\$2" update/);
  assert.match(upload.run, /https:\/\/\$2\/health/);
  const notification = steps.find(step => step.name === 'Email deployment result');
  assert.equal(notification.env.APP_ROOT, '${{ steps.target.outputs.app_root }}');
  assert.equal(notification.env.ACTIVATE, '${{ steps.target.outputs.activate }}');
  assert.match(notification.run, /DEPLOY_DOMAIN='\$DEPLOY_DOMAIN'/);
});

test('cPanel Git selection persists in its ignored config and rejects unselected generic checkouts', () => {
  temporary(directory => {
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/cpanel-deploy.sh'), path.join(directory, 'scripts/cpanel-deploy.sh'));
    fs.copyFileSync(path.join(root, 'server-deploy.sh'), path.join(directory, 'server-deploy.sh'));
    const helper = path.join(directory, 'scripts/cpanel-deploy.sh');
    let result = run([helper, '', '--print-target']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Set TARGET_SITE/);
    for (const domain of ['embeddedindia.in', 'new.embeddedindia.in']) {
      fs.writeFileSync(path.join(directory, '.cpanel-target'), domain + '\r\n');
      result = run([helper, '', '--print-target']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected(domain));
    }
    // An explicit argument wins over the persisted staging selection.
    result = run([helper, 'embeddedindia.in', '--print-target']);
    assert.equal(result.stdout.trim(), expected('embeddedindia.in'));
    fs.writeFileSync(path.join(directory, '.cpanel-target'), '../unexpected');
    result = run([helper, '', '--print-target']);
    assert.notEqual(result.status, 0);
  });
});

test('deployment scripts and every workflow shell block pass bash syntax checks', () => {
  for (const file of ['server-deploy.sh', 'scripts/cpanel-deploy.sh']) {
    const result = run(['-n', file]);
    assert.equal(result.status, 0, result.stderr);
    assert(!fs.readFileSync(path.join(root, file), 'utf8').includes('\r'));
  }
  for (const step of workflow.jobs.deploy.steps.filter(step => step.run)) {
    const result = run(['-n', '-c', step.run]);
    assert.equal(result.status, 0, `${step.name}: ${result.stderr}`);
  }
});
