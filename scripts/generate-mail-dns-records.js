#!/usr/bin/env node
/**
 * DNS Record Generator for Embedded India Mail Server
 * Generates exact DNS records to add into Cloudflare DNS or registrar DNS.
 */

const DOMAIN = process.env.DOMAIN || 'embeddedindia.in';
const MAIL_HOST = `mail.${DOMAIN}`;
const SERVER_IP = process.env.SERVER_IP || '129.225.79.183';
const DKIM_KEY = process.env.DKIM_PUBKEY || '<REPLACE_WITH_DKIM_PUBLIC_KEY_FROM_MAILCOW_ADMIN>';

console.log('='.repeat(80));
console.log(`DNS RECORDS MATRIX FOR ${DOMAIN} (Mail Server at ${MAIL_HOST} / ${SERVER_IP})`);
console.log('='.repeat(80));

const records = [
  {
    type: 'A',
    name: 'mail',
    content: SERVER_IP,
    proxy: 'DNS Only (Gray Cloud - MANDATORY)',
    ttl: 'Auto / 300s',
    comment: 'Direct server IP for SMTP/IMAP/POP3/ActiveSync traffic'
  },
  {
    type: 'CNAME',
    name: 'autodiscover',
    content: MAIL_HOST,
    proxy: 'DNS Only (Gray Cloud)',
    ttl: 'Auto',
    comment: 'Outlook Autodiscover endpoint'
  },
  {
    type: 'CNAME',
    name: 'autoconfig',
    content: MAIL_HOST,
    proxy: 'DNS Only (Gray Cloud)',
    ttl: 'Auto',
    comment: 'Thunderbird & Mobile Autoconfig endpoint'
  },
  {
    type: 'MX',
    name: '@',
    content: MAIL_HOST,
    priority: 10,
    proxy: 'N/A',
    ttl: 'Auto / 300s',
    comment: 'Primary Mail Exchanger for incoming mail'
  },
  {
    type: 'TXT (SPF)',
    name: '@',
    content: `"v=spf1 mx a:${MAIL_HOST} ip4:${SERVER_IP} ~all"`,
    proxy: 'N/A',
    ttl: 'Auto / 300s',
    comment: 'SPF record authorizing mail server IP to send for @' + DOMAIN
  },
  {
    type: 'TXT (DKIM)',
    name: 'dkim._domainkey',
    content: `"v=DKIM1; k=rsa; p=${DKIM_KEY}"`,
    proxy: 'N/A',
    ttl: 'Auto / 300s',
    comment: '2048-bit DKIM key from Mailcow Admin UI (Configuration -> ARC/DKIM)'
  },
  {
    type: 'TXT (DMARC)',
    name: '_dmarc',
    content: `"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${DOMAIN}; ruf=mailto:dmarc-reports@${DOMAIN}; pct=100; sp=quarantine"`,
    proxy: 'N/A',
    ttl: 'Auto / 300s',
    comment: 'DMARC alignment policy to prevent spoofing and ensure inbox placement'
  },
  {
    type: 'SRV (Autodiscover)',
    name: '_autodiscover._tcp',
    content: `0 0 443 ${MAIL_HOST}`,
    proxy: 'N/A',
    ttl: 'Auto',
    comment: 'Outlook Auto-configuration SRV record'
  }
];

console.table(records);

console.log('\n--- CLOUDFLARE DNS INSTRUCTIONS ---');
console.log('1. Go to Cloudflare Dashboard -> embeddedindia.in -> DNS -> Records');
console.log('2. CRITICAL: The "mail" A record MUST have the Orange Cloud toggled OFF (Gray Cloud / DNS Only).');
console.log('   Otherwise, Cloudflare will block inbound ports 25, 465, 587, 993, 995.');
console.log('\n--- ORACLE CLOUD (OCI) REVERSE DNS (PTR) ---');
console.log(`Set Reverse DNS for Public IP ${SERVER_IP}:`);
console.log(`Expected PTR: ${SERVER_IP} -> ${MAIL_HOST}`);
console.log('In OCI Console: Networking -> Virtual Cloud Networks -> Public IPs -> Edit IP -> Set Reverse Connection Domain Name: mail.embeddedindia.in');
console.log('='.repeat(80));
