# Embedded India Mail — Change Log and Pending Work

Last updated: 2026-11-11 (IST).

**Live system:**
- Webmail: https://mail.embeddedindia.in/
- Website admin: https://embeddedindia.in/admin/email
- Server: Oracle VM 129.225.79.183. Mail server: mailcow in `/embed_mail`. Website: `/var/www/embeddedindia`.

---

## 1. Completed and live

### Phase 0: Security (merged to `main`, deployed)

**Auth hardening** (`src/middleware/auth.js`):
- Hardcoded JWT fallback secrets removed.
- A token is valid only if its user exists in the database, and the role comes from the database.
- HS256 pinned; the app refuses to start in production without a strong `ADMIN_JWT_SECRET`.
- New `requireRole()` helper; login redirects restricted to same-site paths.

**Other fixes:**
- Admin login: hardcoded fallback passwords removed (`src/routes/admin.js`).
- Draft blog posts are shown only to verified admins (`src/routes/blogs.js`).
- The old Node webmail was patched in the interim (no demo login, encrypted session, sanitised HTML, CSRF protection), then retired in Phase 2.

**Secrets removed from the repo:** SSH key, OCI SMTP credentials, mail API key, default passwords.

**Rotated by you:** SSH key, OCI SMTP credential, mail admin password plus 2FA, API keys, JWT secret, website admin password.

Tools added:
- `docs/SECURITY_ROTATION.md`
- `scripts/oracle-deploy.sh`: rotates a weak or leaked `ADMIN_JWT_SECRET` automatically.

### Phase 1: Mail server hardening (`scripts/apply-mail-config.sh`, idempotent)

- **TLS:** Let's Encrypt certificate on IMAP, SMTP, POP3 and Sieve (993/465/587/995/4190) and on 443. It covers `mail`, `autodiscover`, `autoconfig` and `mta-sts`. Renewals copy it into mailcow and reload the host nginx automatically.
- **Admin access:** the mail admin UI and API are no longer public; admins reach them through an SSH tunnel to `https://localhost:8443/admin/`.
- **DNS:** DKIM key 2048-bit (`dkim._domainkey`) is published and verified. DMARC is fixed and sends reports to `dmarc@`. MTA-STS (testing mode) and TLS-RPT are live. Hostinger MX and SPF removed. Autodiscover, autoconfig and mta-sts are DNS-only.
- **Firewall:** duplicate rules removed, and the script bug that kept adding them is fixed.
- **Backups:** daily backups to `/opt/backups/mailcow`, kept 7 days.
- **Aliases:** `dmarc@` and `tlsrpt@` forward to `info@`.
- **Autoconfig:** own branded file listing only encrypted ports (`embed_mail/nginx/autoconfig/`).
- **Audit:** `scripts/mail-audit.sh` is a read-only health audit. Latest run: 28 PASS, 0 FAIL.
- **Deploy fix:** CI no longer runs `chown -R` on `/embed_mail`. That chown had broken Postfix, Dovecot and webmail permissions and caused a mail outage of about 6 minutes. CI now only installs `docker-compose.override.yml`.

### Phase 2: Webmail "Embedded India Mail" (Roundcube 1.6.21, fully rebranded)

- **Installer:** `scripts/install-webmail.sh` (idempotent; also handles upgrades). Configs live in `embed_mail/webmail/roundcube/`.
- **Features:** responsive, dark mode, threads, search, drafts, HTML compose, attachments, archive, zip download, mark-as-junk, filters, vacation reply, forwarding, password change, contacts synced with phones (CardDAV), and optional 2-step login (TOTP, no IP bypass).
- **Branding:**
  - Plugin `embedded_branding`: logos, colours, branded About page.
  - No "Roundcube" or "SOGo" in pages, cookies (`ei_mail`) or the `User-Agent` header.
- **Routing:**
  - The SOGo web UI is closed (404).
  - Calendar and contacts sync at the neutral path `/dav/`; ActiveSync is unchanged.
  - `embeddedindia.in/webmail` and `/mail` redirect to the new webmail; the old Node webmail code is removed.
- **Test:** `scripts/webmail-check.py` is an end-to-end check using a temporary mailbox. Latest run: 18/18.

### Verification run (2026-11-11)

- **Webmail:** 18/18.
- **External mail-client test from a laptop:** 7/8.
  - Passed: IMAP 993, SMTP 587 and 465, Sieve, spoofing refused, GTUBE spam rejected, EICAR virus rejected.
  - Failed: external send. The OCI relay blocks senders that are not on its approved list (see pending item A1).

---

## 2. Pending: actions for you

| # | Action | Where |
|---|--------|-------|
| A1 | Add every mailbox that must send outside the domain as an **Approved Sender**. Start with `fahim.ahmad@embeddedindia.in`, which had 3 bounced messages. | OCI Console → Developer Services → Email Delivery → Approved Senders |
| A2 | After A1, send one message to Gmail and share its "Show original" SPF/DKIM/DMARC lines. | Gmail |
| A3 | Choose how to handle approved senders long term: automate through the OCI API in Phase 3 (needs an OCI API key), or switch the relay to Brevo or SES (whole domain at once). | Decision |
| A4 | Optional: after about 2 weeks of clean TLS reports, change MTA-STS `mode: testing` to `enforce`. | `embed_mail/nginx/mail.embeddedindia.in.conf` |

## 3. Pending: development work

### Phase 3: Native mail admin at `/admin/email` (IN PROGRESS, not deployed)

Already written locally, not wired up or committed yet:
- `src/services/mailcowApi.js`: server-side mail API client. Write-call formats checked against mailcow's source.
- `src/services/mailDnsCheck.js`: live DNS and TLS health checks.
- `src/services/mailAudit.js`: audit trail, table `MailAuditLog` in SQLite.
- `src/routes/adminEmail.js`: JSON API covering:
  - overview, DNS
  - mailboxes: create, edit, password reset, delete
  - aliases, queue, quarantine, fail2ban unban, logs, activity, share setup guide

Still to do:
1. Mount the router in `src/routes/admin.js`: `router.use('/email', requireRole('admin'), require('./adminEmail'))`. Remove the old `GET /email` and `POST /email/share-credentials` handlers.
2. Rewrite `views/admin/email.ejs`. It is still the old mock with hardcoded rows. New page:
   - tabs: Overview, Mailboxes, Aliases, DNS & Certificates, Queue, Quarantine, Security, Logs, Activity
   - icon buttons; responsive (cards on mobile, tables on desktop)
   - all output escaped
3. Rebrand `src/services/mailer.js` → `sendMailboxCredentials`. It still says "Outlook Webmail" and builds HTML from user input without escaping. Make the password optional.
4. Verify the `protocol_access` edit format against the mailcow API before enabling protocol toggles.
5. Optional (A3): OCI approved-sender automation when a mailbox is created or deleted.
6. Run the checks: `node --check` on the new files, the webmail check, and a manual click-through of every tab at 375, 768 and 1440 px.

### Phase 4: Documentation

- Rewrite `embed_mail/README.md` and `embed_mail/docs/ADMIN_GUIDE.md`. They still describe SOGo/Outlook Web, `mail.embeddedindia.in/admin` and "accept all certificates".
- Remove the obsolete SOGo theme files (`embed_mail/webmail/outlook-web.*`, `admin_theme/*`) and their mounts in `docker-compose.override.yml`. They are not used now that the SOGo UI is closed.
- Optional: a calendar inside the webmail (calendar plugin). Today calendars sync to phones and Outlook only.

---

## 4. How to work on this repo

- **Pushing:** the corporate network blocks `git push` intermittently. Push from another network, then merge the PR in the browser.
- **Never** re-add `chown -R` on `/embed_mail` to deploy scripts.
- **After a deploy or mail config change:**
  ```bash
  sudo bash scripts/mail-audit.sh </dev/null
  sudo python3 -I scripts/webmail-check.py
  ```
- **Upgrade the webmail:** `sudo bash scripts/install-webmail.sh`. It picks the latest 1.6.x and reloads PHP.
- **Mail config or DNS changed:** `sudo bash scripts/apply-mail-config.sh`.
