# Embedded India Production Email Infrastructure (/embed_mail)

This directory contains the production email infrastructure configurations and scripts designed to deploy a modern, responsive, multi-account mail server on **Oracle Cloud Infrastructure (Ubuntu ARM64)** alongside the existing Node.js website.

---

## 📁 Directory Structure

```
embed_mail/
├── mailcow.conf.template         # Main Mailcow environment & port configuration
├── docker-compose.override.yml   # Docker compose override (binds web to 127.0.0.1:8080/8443)
├── nginx/
│   └── mail.embeddedindia.in.conf# Host Nginx reverse proxy & ActiveSync stream config
├── sogo/
│   └── sogo-custom.conf          # SOGo Exchange ActiveSync & responsive Webmail tuning
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

### 3. Configure Outbound Mail (Least Cost & Maximum Reliability)
Follow instructions in [`docs/OUTBOUND_RELAY_AND_PORT25.md`](docs/OUTBOUND_RELAY_AND_PORT25.md) or run:
```bash
sudo bash scripts/setup-outbound-relay.sh
```
- **Path A ($0/mo)**: OCI Native Email Delivery (3,000 free emails/mo) or Brevo (9,000 free emails/mo).
- **Path B ($0/mo direct)**: Submit OCI ticket to unlock outbound Port 25.

### 4. Access Admin Console & Webmail
Open [`https://mail.embeddedindia.in/`](https://mail.embeddedindia.in/):
- **Superadmin**: Log in with `admin` / `moohoo` (change password immediately).
- Create mailboxes, edit quotas, and reset passwords using the guide in [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md).
