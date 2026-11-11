# Cloudflare DNS changes for embeddedindia.in mail

These records were checked against live DNS on 2026-11-11.

All mail records must be **DNS only (grey cloud)**. Cloudflare's proxy only handles web traffic. When it is on, mail clients, autodiscover and certificate checks fail; that is why autodiscover currently returns error 525.

Open Cloudflare, go to **embeddedindia.in → DNS → Records**, and work through the sections in order.

---

## 1. Add now (most important first)

| # | Type | Name | Content | Proxy | TTL | Why |
|---|------|------|---------|-------|-----|-----|
| 1 | TXT | `dkim._domainkey` | see the value below | DNS only | Auto | Signs outgoing mail. Without it, DMARC fails and mail lands in spam. |
| 2 | A | `mta-sts` | `129.225.79.183` | **DNS only** | Auto | Hosts the MTA-STS policy. |
| 3 | TXT | `_mta-sts` | `v=STSv1; id=2026111101` | DNS only | Auto | Tells senders to use TLS. Starts in testing mode. |
| 4 | TXT | `_smtp._tls` | `v=TLSRPTv1; rua=mailto:tlsrpt@embeddedindia.in` | DNS only | Auto | Daily TLS delivery reports. |

**Record 1, the DKIM value.** Paste it exactly as one line. Cloudflare splits long TXT values automatically.

```
v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAplcn8juhh/qb7P83A/zXYx9NQq8fifqjKvBdGpqHI4eBR/BBh+xLqznOyRCjoI8+t2Lunr7AZUeFOsjh49p4kGRWKIdsgYSXK1ASC5CN91Mvpo6eK+Sc8dSrh4cGLTOuWF2N1C1opPUoTYluMAuvr2QkNuWjdEHxX6moQSSukLtQ4bUUl23qLw8DqypUsmDS103hRq37PRM4/kZYRnWTU5RrCGmIxUjf358eKuwRzduZdG+/m8Z6DVlB9LoDqSc6tAv8o3h2U4QvibR3Y5bujSfC0rlkwSgeOTNS5+XEza4hYgE0rmDLlGjNsIApRAEojyBWkp+uew8sZd06F8DE8wIDAQAB
```

## 2. Change now

| # | Type | Name | Current | Change to | Proxy |
|---|------|------|---------|-----------|-------|
| 5 | A → **CNAME** | `autodiscover` | A `104.21.36.252` / `172.67.201.159` (proxied) | Delete the A record(s), then add CNAME `autodiscover` → `mail.embeddedindia.in` | **DNS only** |
| 6 | A → **CNAME** | `autoconfig` | A `104.21.36.252` / `172.67.201.159` (proxied) | Delete the A record(s), then add CNAME `autoconfig` → `mail.embeddedindia.in` | **DNS only** |
| 7 | TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:sahil.kalka@gmail.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@embeddedindia.in; adkim=r; aspf=r` | DNS only |

About record 7: receivers usually drop DMARC reports addressed to another domain such as gmail.com, because that domain hasn't authorised them. The `dmarc@` alias already exists and forwards to `info@embeddedindia.in`.

## 3. Optional, helps mail apps set themselves up

| Type | Name | Priority | Weight | Port | Target | Proxy |
|------|------|----------|--------|------|--------|-------|
| SRV | `_autodiscover._tcp` | 0 | 0 | 443 | `mail.embeddedindia.in` | DNS only |
| SRV | `_imaps._tcp` | 0 | 1 | 993 | `mail.embeddedindia.in` | DNS only |
| SRV | `_submissions._tcp` | 0 | 1 | 465 | `mail.embeddedindia.in` | DNS only |
| SRV | `_submission._tcp` | 0 | 1 | 587 | `mail.embeddedindia.in` | DNS only |

## 4. Later: once you have stopped using Hostinger mail

| # | Type | Name | Action |
|---|------|------|--------|
| 8 | MX | `@` → `mx1.hostinger.com` (priority 5) | Delete |
| 9 | MX | `@` → `mx2.hostinger.com` (priority 10) | Delete |
| 10 | TXT | `@` (SPF) | Change to `v=spf1 mx a:mail.embeddedindia.in include:rp.oracleemaildelivery.com ~all` |

About record 10: it drops the Hostinger include and the plain `a`. That `a` points at Cloudflare's IP addresses, which never send your mail.

After those deletions, the only MX record left is `2 mail.embeddedindia.in`. Before deleting, check that nobody still reads mail at Hostinger. Mail that lands there is not copied to your server.

## 5. Keep as they are (already correct)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `mail` | `129.225.79.183` | DNS only |
| MX | `@` | `mail.embeddedindia.in`, priority 2 | n/a |
| A / AAAA | `@`, `www` | the website | Proxied (orange) is fine for the website |

---

## After saving

Wait about 5 minutes, then tell me or run on the server:

```bash
cd /var/www/embeddedindia
sudo bash scripts/apply-mail-config.sh     # adds autodiscover/autoconfig/mta-sts to the TLS certificate
sudo bash scripts/mail-audit.sh </dev/null # DKIM / MTA-STS / TLS-RPT checks should now PASS
```

**Not set in Cloudflare: reverse DNS (PTR).** The reverse record for `129.225.79.183` belongs to Oracle, not Cloudflare. Your mail goes out through Oracle's relay, which has its own reverse DNS, so a PTR record isn't needed. You would only need one if you switch to sending directly on port 25.
