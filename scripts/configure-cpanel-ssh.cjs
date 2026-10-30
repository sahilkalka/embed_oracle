const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function panelAddress(env) {
  const value = (env.CPANEL_HOST || '').trim();
  if (!value) throw new Error('Set CPANEL_HOST to your cPanel hostname or HTTPS login URL.');
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.protocol !== 'https:') throw new Error('CPANEL_HOST must use HTTPS.');
  const port = (env.CPANEL_PORT || '').trim();
  url.port = url.port || (['2083', '443'].includes(port) ? port : '2083');
  url.pathname = '/'; url.search = ''; url.hash = '';
  if (url.username || url.password) throw new Error('CPANEL_HOST must not include credentials.');
  return url;
}

async function resolveSsh(env, fetcher = fetch, log = console.log) {
  const panel = panelAddress(env);
  const user = (env.CPANEL_USER || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) throw new Error('CPANEL_USER must be the cPanel account username, not an email address.');
  let host = (env.CPANEL_SSH_HOST || '').trim() || panel.hostname;
  const explicitPort = (env.CPANEL_SSH_PORT || '').trim();
  const oldPort = (env.CPANEL_PORT || '').trim();
  let port = explicitPort || (!['', '2083', '2087', '443'].includes(oldPort) ? oldPort : '22');
  if (env.CPANEL_API_TOKEN?.trim() && !env.CPANEL_SSH_HOST && !explicitPort) {
    try {
      const response = await fetcher(new URL('/execute/VersionControl/retrieve', panel), {
        headers: { Authorization: `cpanel ${user}:${env.CPANEL_API_TOKEN.trim()}` },
        signal: AbortSignal.timeout(20000), redirect: 'error'
      });
      if (!response.ok) throw new Error(`cPanel API returned HTTP ${response.status}`);
      const payload = await response.json();
      if (Number(payload.result?.status) !== 1) throw new Error('cPanel API did not permit repository discovery');
      const repos = payload.result.data;
      if (!Array.isArray(repos)) throw new Error('cPanel API returned no repository list');
      const matching = repos.filter(repo => {
        const source = repo.source_repository?.url || '';
        return source.replace(/\.git$/, '').replace(/\/$/, '').endsWith('github.com/' + env.GITHUB_REPOSITORY) ||
          source.replace(/\.git$/, '').endsWith('github.com:' + env.GITHUB_REPOSITORY);
      });
      const candidates = matching.length ? matching : repos;
      const urls = candidates.flatMap(repo => repo.clone_urls?.read_write || []).filter(url => url.startsWith('ssh://'));
      if (!urls.length) throw new Error('cPanel reports no SSH clone URL. Ask your hosting provider to confirm Shell Access and the SSH hostname/port.');
      const endpoints = [...new Set(urls.map(value => { const url = new URL(value); return `${url.hostname}:${url.port || 22}`; }))];
      if (endpoints.length !== 1) throw new Error('Multiple SSH endpoints were found; set CPANEL_SSH_HOST and CPANEL_SSH_PORT to choose one.');
      const discovered = new URL(urls[0]);
      host = discovered.hostname; port = discovered.port || '22';
      log('Discovered SSH endpoint from cPanel Git repository settings.');
    } catch (error) {
      // Explicit SSH settings remain usable if an older cPanel API is unavailable.
      log(`cPanel SSH discovery: ${error.message}`);
      if (!env.CPANEL_SSH_HOST && !explicitPort && /no SSH clone|Multiple SSH/.test(error.message)) throw error;
      log('Trying CPANEL_HOST and the configured SSH port.');
    }
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('SSH hostname is invalid. Set CPANEL_SSH_HOST to the hostname only.');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('SSH port must be a number between 1 and 65535. Set CPANEL_SSH_PORT to the provider SSH port.');
  return { host, port: Number(port), user };
}

async function configure(env = process.env) {
  const target = await resolveSsh(env);
  const key = (env.CPANEL_SSH_KEY || '').trim();
  if (!/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(key)) throw new Error('CPANEL_SSH_KEY must contain the complete private key, not the public key.');
  const directory = path.join(os.homedir(), '.ssh');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(directory, 'cpanel_key');
  fs.writeFileSync(keyPath, key + '\n', { mode: 0o600 });
  const validation = spawnSync('ssh-keygen', ['-y', '-P', '', '-f', keyPath], { encoding: 'utf8', timeout: 10000 });
  if (validation.status !== 0) throw new Error('The private key could not be read without a passphrase. Use an authorized, unencrypted deployment key.');
  let knownHosts = (env.CPANEL_KNOWN_HOSTS || '').trim();
  if (!knownHosts) {
    console.log(`Checking SSH connectivity on port ${target.port} before authentication.`);
    const scan = spawnSync('ssh-keyscan', ['-T', '15', '-p', String(target.port), '-H', target.host], { encoding: 'utf8', timeout: 30000 });
    if (scan.status !== 0 || !scan.stdout.trim()) throw new Error(`SSH did not respond on port ${target.port}. Confirm Shell Access and the SSH endpoint with your hosting provider; generating a new key will not fix an unreachable endpoint.`);
    knownHosts = scan.stdout.trim();
  }
  fs.writeFileSync(path.join(directory, 'known_hosts'), knownHosts + '\n', { mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'config'), [
    'Host ei-cpanel', `  HostName ${target.host}`, `  User ${target.user}`, `  Port ${target.port}`,
    `  IdentityFile ${keyPath}`, '  IdentitiesOnly yes', '  StrictHostKeyChecking yes', '  BatchMode yes', '  ConnectTimeout 20', ''
  ].join('\n'), { mode: 0o600 });
  console.log('SSH configuration validated. Deployment will use the discovered/configured endpoint.');
}

module.exports = { panelAddress, resolveSsh, configure };
if (require.main === module) configure().catch(error => { console.error(error.message); process.exitCode = 1; });
