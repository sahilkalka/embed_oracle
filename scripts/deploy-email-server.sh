#!/usr/bin/env bash
# ==============================================================================
# Embedded India - Production Email Server Deployment Script (/embed_mail)
# Target: Ubuntu 24.04/26.04 LTS (ARM64 aarch64) on Oracle Cloud Infrastructure
# Coexists with Host Nginx and Node.js website on 129.225.79.183
# ==============================================================================
set -Eeuo pipefail

MAIL_DIR="/embed_mail"
DOMAIN="embeddedindia.in"
MAIL_HOST="mail.${DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================================="
echo "==> Deploying Production Email Server to ${MAIL_DIR} (${MAIL_HOST})"
echo "=================================================================="

# Ensure running as root or with sudo
if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root or with sudo." >&2
  exit 1
fi

# 1. Install Docker & Docker Compose Plugin on ARM64 if missing
echo "==> [1/7] Checking Docker and Docker Compose (ARM64)..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker CE for Ubuntu aarch64..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
echo "Docker version: $(docker --version)"

# 2. Prepare /embed_mail directory & Mailcow repository
echo "==> [2/7] Setting up ${MAIL_DIR} directory and Mailcow repository..."
mkdir -p "${MAIL_DIR}"
if [ ! -d "${MAIL_DIR}/.git" ]; then
  echo "Cloning Mailcow Dockerized into ${MAIL_DIR}..."
  git clone https://github.com/mailcow/mailcow-dockerized.git "${MAIL_DIR}"
else
  echo "Mailcow directory already exists. Pulling latest updates..."
  git -C "${MAIL_DIR}" pull || true
fi

# 3. Apply Custom Configuration (Host Coexistence & Localhost bindings)
echo "==> [3/7] Applying customized configuration files..."
if [ ! -f "${MAIL_DIR}/mailcow.conf" ]; then
  echo "Generating initial mailcow.conf from template..."
  cp "${ROOT_DIR}/embed_mail/mailcow.conf.template" "${MAIL_DIR}/mailcow.conf"
  
  # Generate unique random passwords for DB
  DB_PASS=$(openssl rand -hex 16)
  DB_ROOT_PASS=$(openssl rand -hex 16)
  sed -i "s/ChangeMeMailcowDBPass2026!/${DB_PASS}/g" "${MAIL_DIR}/mailcow.conf"
  sed -i "s/ChangeMeMailcowRootPass2026!/${DB_ROOT_PASS}/g" "${MAIL_DIR}/mailcow.conf"
fi

# Install Docker Compose override (binds web to 127.0.0.1:8080/8443)
cp "${ROOT_DIR}/embed_mail/docker-compose.override.yml" "${MAIL_DIR}/docker-compose.override.yml"

# Install custom SOGo configuration for ActiveSync & Webmail
mkdir -p "${MAIL_DIR}/data/conf/sogo"
cp "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" "${MAIL_DIR}/data/conf/sogo/custom-sogo.conf"

# 4. Open Inbound Mail Ports in Host iptables
echo "==> [4/7] Configuring host iptables firewall for email protocols..."
MAIL_PORTS=(25 465 587 993 995 4190)
for PORT in "${MAIL_PORTS[@]}"; do
  if ! iptables -C INPUT -p tcp --dport "${PORT}" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 1 -p tcp --dport "${PORT}" -m state --state NEW -j ACCEPT
    echo "  + Opened TCP port ${PORT}"
  fi
done
netfilter-persistent save || true

# 5. Configure Host Nginx for mail.embeddedindia.in
echo "==> [5/7] Configuring Host Nginx reverse proxy for Webmail & ActiveSync..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot

# Ensure SSL cert exists (uses Certbot if installed, or falls back safely to Cloudflare origin cert)
if [ ! -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  if command -v certbot >/dev/null 2>&1; then
    echo "Obtaining Let's Encrypt certificate for ${MAIL_HOST}..."
    certbot certonly --webroot -w /var/www/certbot -d "${MAIL_HOST}" -d "autodiscover.${DOMAIN}" -d "autoconfig.${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" || true
  fi
fi

# If Certbot not present or failed, create origin fallback symlink
if [ ! -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ] && [ -f "/etc/ssl/embeddedindia/origin.crt" ]; then
  mkdir -p "/etc/letsencrypt/live/${MAIL_HOST}"
  ln -sf /etc/ssl/embeddedindia/origin.crt "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem"
  ln -sf /etc/ssl/embeddedindia/origin.key "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
fi

cp "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" "/etc/nginx/sites-available/${MAIL_HOST}.conf"
ln -sf "/etc/nginx/sites-available/${MAIL_HOST}.conf" "/etc/nginx/sites-enabled/${MAIL_HOST}.conf"

nginx -t
systemctl reload nginx

# 6. Pull and Launch Mailcow Docker Services
echo "==> [6/7] Pulling and starting Mailcow containers in ${MAIL_DIR}..."
cd "${MAIL_DIR}"
docker compose pull
docker compose up -d

# 7. Final Instructions & Status Summary
echo "=================================================================="
echo "==> EMAIL SERVER DEPLOYMENT COMPLETE!"
echo "=================================================================="
echo "Access Points:"
echo "  - Webmail & Admin Dashboard: https://${MAIL_HOST}/"
echo "  - Outlook ActiveSync URL:    https://${MAIL_HOST}/Microsoft-Server-ActiveSync"
echo ""
echo "Default Superadmin Credentials:"
echo "  - Username: admin"
echo "  - Password: moohoo (CHANGE IMMEDIATELY UPON FIRST LOGIN)"
echo ""
echo "Next Action Items:"
echo "  1. Log in to https://${MAIL_HOST}/"
echo "  2. Go to 'Configuration' -> 'Mail Setup' -> 'Add Domain': ${DOMAIN}"
echo "  3. Go to 'Configuration' -> 'ARC/DKIM Keys' -> Generate 2048-bit DKIM key for ${DOMAIN} (Selector: dkim)"
echo "  4. Add the DNS records to Cloudflare using: node scripts/generate-mail-dns-records.js"
echo "=================================================================="
