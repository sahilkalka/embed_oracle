// src/services/mailDnsCheck.js
// Live DNS + TLS health of the mail domain, for the /admin/email dashboard.

const dns = require('dns');
const tls = require('tls');

const DOMAIN = process.env.MAIL_DOMAIN || 'embeddedindia.in';
const MAIL_HOST = process.env.MAIL_HOST || `mail.${DOMAIN}`;
const SERVER_IP = process.env.MAIL_SERVER_IP || '';
const CACHE_MS = 5 * 60 * 1000;

const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const txt = async (name) => (await resolver.resolveTxt(name).catch(() => [])).map(parts => parts.join(''));
const ipv4 = async (name) => resolver.resolve4(name).catch(() => []);

function certInfo(port, servername) {
  return new Promise(resolve => {
    const sock = tls.connect({ host: MAIL_HOST, port, servername, timeout: 6000 }, () => {
      const cert = sock.getPeerCertificate();
      const authorized = sock.authorized;
      sock.end();
      resolve({
        ok: authorized,
        validTo: cert && cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
        issuer: cert && cert.issuer ? (cert.issuer.O || cert.issuer.CN || '') : '',
        error: authorized ? null : String(sock.authorizationError || 'untrusted certificate')
      });
    });
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, error: 'timeout' }); });
    sock.on('error', err => resolve({ ok: false, error: err.code || err.message }));
  });
}

let cache = { at: 0, data: null };

async function run(dkimExpected) {
  const checks = [];
  const add = (key, label, ok, value, help, level) =>
    checks.push({ key, label, ok, level: ok ? 'pass' : (level || 'fail'), value, help });

  const mailIps = await ipv4(MAIL_HOST);
  const serverIp = SERVER_IP || mailIps[0] || '';
  add('a', `${MAIL_HOST} address`, mailIps.length > 0, mailIps.join(', ') || 'not found',
      'A record for the mail server, DNS only (grey cloud).');

  const mx = (await resolver.resolveMx(DOMAIN).catch(() => [])).sort((a, b) => a.priority - b.priority);
  const mxHosts = mx.map(m => `${m.priority} ${m.exchange}`);
  const onlyOurs = mx.length > 0 && mx.every(m => m.exchange.toLowerCase() === MAIL_HOST);
  add('mx', 'MX (incoming mail)', onlyOurs, mxHosts.join(', ') || 'not found',
      onlyOurs ? '' : `Only ${MAIL_HOST} should be listed; other hosts receive mail you never see.`,
      mx.some(m => m.exchange.toLowerCase() === MAIL_HOST) ? 'warn' : 'fail');

  const spf = (await txt(DOMAIN)).find(t => t.toLowerCase().startsWith('v=spf1')) || '';
  add('spf', 'SPF (allowed senders)', /include:rp\.oracleemaildelivery\.com|mx|a:mail/i.test(spf), spf || 'not found',
      'Must allow the relay that sends your mail.');

  const dkimName = `dkim._domainkey.${DOMAIN}`;
  const dkim = (await txt(dkimName)).join('');
  const norm = s => String(s || '').replace(/\s+/g, '');
  const dkimOk = !!dkim && (!dkimExpected || norm(dkim) === norm(dkimExpected));
  add('dkim', 'DKIM (message signature)', dkimOk, dkim ? `${dkim.slice(0, 48)}…` : 'not found',
      dkim && !dkimOk ? 'Published key differs from the mail server key.' : 'TXT record dkim._domainkey.');

  const dmarc = (await txt(`_dmarc.${DOMAIN}`)).find(t => t.startsWith('v=DMARC1')) || '';
  const dmarcClean = !!dmarc && !/[`|]/.test(dmarc) && /p=(quarantine|reject)/.test(dmarc);
  add('dmarc', 'DMARC (policy)', dmarcClean, dmarc || 'not found',
      dmarc && !dmarcClean ? 'Record is malformed or too weak.' : '', dmarc ? 'warn' : 'fail');

  const sts = (await txt(`_mta-sts.${DOMAIN}`)).find(t => t.startsWith('v=STSv1')) || '';
  add('mtasts', 'MTA-STS (TLS for incoming mail)', !!sts, sts || 'not found', '', 'warn');
  const tlsrpt = (await txt(`_smtp._tls.${DOMAIN}`)).find(t => t.startsWith('v=TLSRPTv1')) || '';
  add('tlsrpt', 'TLS reports', !!tlsrpt, tlsrpt || 'not found', '', 'warn');

  for (const h of ['autodiscover', 'autoconfig', 'mta-sts']) {
    const ips = await ipv4(`${h}.${DOMAIN}`);
    const ok = !!serverIp && ips.includes(serverIp);
    add(h, `${h}.${DOMAIN}`, ok, ips.join(', ') || 'not found',
        ok ? '' : `Should point to ${serverIp || 'the mail server'} with the Cloudflare proxy off (grey cloud).`, 'warn');
  }

  const tlsResults = await Promise.all([[993, 'IMAP'], [465, 'SMTP'], [443, 'Webmail']].map(async ([port, name]) => {
    const c = await certInfo(port, MAIL_HOST);
    const days = c.validTo ? Math.floor((new Date(c.validTo) - Date.now()) / 86400000) : null;
    return { port, name, ...c, daysLeft: days };
  }));
  for (const t of tlsResults) {
    const ok = t.ok && t.daysLeft !== null && t.daysLeft > 14;
    add(`tls${t.port}`, `${t.name} certificate (port ${t.port})`, ok,
        t.ok ? `${t.issuer}, ${t.daysLeft} days left` : (t.error || 'unavailable'),
        ok ? '' : 'Certificate is untrusted or expires within 14 days.', t.ok ? 'warn' : 'fail');
  }

  return {
    domain: DOMAIN,
    mailHost: MAIL_HOST,
    checkedAt: new Date().toISOString(),
    summary: {
      pass: checks.filter(c => c.level === 'pass').length,
      warn: checks.filter(c => c.level === 'warn').length,
      fail: checks.filter(c => c.level === 'fail').length
    },
    checks
  };
}

module.exports = {
  async check({ dkimExpected, fresh } = {}) {
    if (!fresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
    const data = await run(dkimExpected);
    cache = { at: Date.now(), data };
    return data;
  },
  DOMAIN,
  MAIL_HOST
};
