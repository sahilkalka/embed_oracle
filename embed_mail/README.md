# Embedded India Production Email Infrastructure (/embed_mail)

This directory contains the production email infrastructure configurations and scripts designed to deploy a modern, responsive, multi-account mail server on **Oracle Cloud Infrastructure (Ubuntu ARM64)** alongside the existing Node.js website.

---

## 📁 Directory Structure

```
embed_mail/
├── mailcow.conf.template         # Main Mailcow environment & port configuration
├── docker-compose.override.yml   # Docker compose override (mounts Outlook Web & theme overrides)
├── nginx/
│   └── mail.embeddedindia.in.conf# Host Nginx reverse proxy & ActiveSync stream config
├── webmail/
│   ├── outlook-web.css           # Microsoft Outlook Web stylesheet (Fluent UI, zero SOGo graphics)
│   ├── outlook-web.js            # Outlook title & waffle app launcher dynamic injector
│   └── assets/                   # Outlook envelope and Webmail logos
├── admin_theme/
│   ├── theme.json                # Embedded India Mailcow theme definition
│   ├── theme.css / dark.css      # Website Admin Dashboard dark emerald palette (#0b1412)
│   ├── 0081-custom-mailcow.css   # Mailcow topbar, rounded-2xl cards & icon buttons
│   └── vars.local.inc.php        # Persistent branding PHP override
├── sogo/
│   └── sogo-custom.conf          # Exchange ActiveSync & Webmail configuration
└── docs/
    ├── ADMIN_GUIDE.md            # User manual: CRUD users, reset passwords, quotas, Outlook setup
    └── OUTBOUND_RELAY_AND_PORT25.md # Server instructions for Path A (Relay) vs Path B (Direct Send)
```

---

## ⚡ Quick Deployment Steps

### 1. Configure Cloudflare DNS & Oracle VCN
1. Generate the exact DNS records to add into Cloudflare:
   ```bash
   node scripts/generate-mail-dns-records.js
   ```
2. In Cloudflare, add the `mail` A record with **Proxy status: DNS Only (Gray Cloud)**.
3. In Oracle Cloud Console (`embedded-vcn` Security List), add Ingress rules for TCP ports: `25, 465, 587, 993, 995, 4190`.

### 2. Deploy Email Server to `/embed_mail`
Run the automated deployment script on the Oracle server:
```bash
sudo bash scripts/deploy-email-server.sh
```

If you ever need to repair file permissions, synchronize database schema, or recover from a blank page on the UI:
```bash
sudo bash scripts/fix-embed-mail.sh
```

### 3. Configure Outbound Mail (Least Cost & Maximum Reliability)
Follow instructions in [`docs/OUTBOUND_RELAY_AND_PORT25.md`](docs/OUTBOUND_RELAY_AND_PORT25.md) or run:
```bash
sudo bash scripts/setup-outbound-relay.sh
```
- **Path A ($0/mo)**: OCI Native Email Delivery (3,000 free emails/mo) or Brevo (9,000 free emails/mo).
- **Path B ($0/mo direct)**: Submit OCI ticket to unlock outbound Port 25.

### 4. Access Admin Console & Webmail
- **Email Admin Dashboard**: [`https://mail.embeddedindia.in/admin`](https://mail.embeddedindia.in/admin)
  - Styled with the Embedded India website admin dashboard theme (Dark Emerald `#0b1412`, `#10b981`).
  - Log in with `admin` / `moohoo` (or custom `$ADMIN_PASSWORD`).
  - Create mailboxes, edit quotas, and manage domains using [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md).
- **User Webmail (Outlook Web)**: [`https://mail.embeddedindia.in/mail`](https://mail.embeddedindia.in/mail) (or [`https://mail.embeddedindia.in/`](https://mail.embeddedindia.in/))
  - Full Microsoft Outlook Web styling with app launcher waffle, "+ New mail" pill icon button, and 3-pane layout.
  - Log in with individual mailbox credentials (e.g. `sahil@embeddedindia.in`).
- **Website Admin Email Hub**: [`https://embeddedindia.in/admin/email`](https://embeddedindia.in/admin/email)
  - Single pane of glass for email server health and quick launches.
