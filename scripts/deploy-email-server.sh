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
  rm -rf /tmp/mailcow-clone-tmp
  git clone --depth 1 https://github.com/mailcow/mailcow-dockerized.git /tmp/mailcow-clone-tmp
  cp -a /tmp/mailcow-clone-tmp/. "${MAIL_DIR}/"
  rm -rf /tmp/mailcow-clone-tmp
else
  echo "Mailcow directory already exists. Pulling latest updates..."
  git -C "${MAIL_DIR}" pull || true
fi

# 3. Apply Custom Configuration (Host Coexistence & Localhost bindings)
echo "==> [3/7] Applying customized configuration files..."
if [ ! -f "${MAIL_DIR}/mailcow.conf" ]; then
  echo "Generating initial mailcow.conf from template..."
  cp "${ROOT_DIR}/embed_mail/mailcow.conf.template" "${MAIL_DIR}/mailcow.conf"
  
  # Generate unique random passwords for DB, Redis, and SOGo
  DB_PASS=$(openssl rand -hex 16)
  DB_ROOT_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  SOGO_KEY=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 16 || openssl rand -hex 8)
  sed -i "s/ChangeMeMailcowDBPass2026!/${DB_PASS}/g" "${MAIL_DIR}/mailcow.conf"
  sed -i "s/ChangeMeMailcowRootPass2026!/${DB_ROOT_PASS}/g" "${MAIL_DIR}/mailcow.conf"
  sed -i "s/ChangeMeMailcowRedisPass2026!/${REDIS_PASS}/g" "${MAIL_DIR}/mailcow.conf"
  sed -i "s/ChangeMeSogoEncKey16!/${SOGO_KEY}/g" "${MAIL_DIR}/mailcow.conf"
else
  # Ensure HTTP_PORT is 8088 to avoid port collisions
  sed -i "s/^HTTP_PORT=.*/HTTP_PORT=8088/" "${MAIL_DIR}/mailcow.conf"
  if ! grep -q "^REDISPASS=" "${MAIL_DIR}/mailcow.conf"; then
    REDIS_PASS=$(openssl rand -hex 16)
    echo "REDISPASS=${REDIS_PASS}" >> "${MAIL_DIR}/mailcow.conf"
  fi
  if ! grep -q "^SOGO_URL_ENCRYPTION_KEY=" "${MAIL_DIR}/mailcow.conf"; then
    SOGO_KEY=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 16 || openssl rand -hex 8)
    echo "SOGO_URL_ENCRYPTION_KEY=${SOGO_KEY}" >> "${MAIL_DIR}/mailcow.conf"
  fi
fi

# Ensure .env symlink points to mailcow.conf (Docker Compose requires .env)
ln -snf mailcow.conf "${MAIL_DIR}/.env"

# Install Docker Compose override
cp "${ROOT_DIR}/embed_mail/docker-compose.override.yml" "${MAIL_DIR}/docker-compose.override.yml"

# Install custom SOGo configuration for ActiveSync & Webmail
mkdir -p "${MAIL_DIR}/data/conf/sogo"
cp "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" "${MAIL_DIR}/data/conf/sogo/custom-sogo.conf"

# Fix permissions on Twig template cache and asset directories for PHP-FPM (UID 82:82)
mkdir -p "${MAIL_DIR}/data/web/templates/cache"
chown -R 82:82 "${MAIL_DIR}/data/web/templates/cache" 2>/dev/null || chmod -R 777 "${MAIL_DIR}/data/web/templates/cache"
chmod -R 775 "${MAIL_DIR}/data/web/templates/cache"

# Generate app_info.inc.php if missing
if [ ! -f "${MAIL_DIR}/data/web/inc/app_info.inc.php" ]; then
  cat <<'EOF' > "${MAIL_DIR}/data/web/inc/app_info.inc.php"
<?php
  $MAILCOW_GIT_VERSION="master";
  $MAILCOW_LAST_GIT_VERSION="";
  $MAILCOW_GIT_OWNER="mailcow";
  $MAILCOW_GIT_REPO="mailcow-dockerized";
  $MAILCOW_GIT_URL="https://github.com/mailcow/mailcow-dockerized";
  $MAILCOW_GIT_COMMIT="master";
  $MAILCOW_GIT_COMMIT_DATE=date("c");
  $MAILCOW_BRANCH="master";
  $MAILCOW_UPDATEDAT=time();
?>
EOF
  chown 82:82 "${MAIL_DIR}/data/web/inc/app_info.inc.php" 2>/dev/null || true
fi

# Ensure Mailcow internal SSL certificate exists for nginx-mailcow
mkdir -p "${MAIL_DIR}/data/assets/ssl"
if [ ! -f "${MAIL_DIR}/data/assets/ssl/cert.pem" ] || [ ! -f "${MAIL_DIR}/data/assets/ssl/key.pem" ]; then
  echo "Generating internal SSL certificate for Mailcow Nginx..."
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${MAIL_DIR}/data/assets/ssl/key.pem" \
    -out "${MAIL_DIR}/data/assets/ssl/cert.pem" \
    -subj "/CN=${MAIL_HOST}"
  chmod 600 "${MAIL_DIR}/data/assets/ssl/key.pem"
fi

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

# Wait for MariaDB container and execute initial database schema sync
echo "Waiting for MariaDB to initialize..."
for i in {1..30}; do
  if docker compose exec -T mysql-mailcow mariadb-admin ping --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "Running initial database schema migration and API sync..."
docker compose exec -T php-fpm-mailcow php -c /usr/local/etc/php -f /web/inc/init_db.inc.php || true
docker compose restart php-fpm-mailcow nginx-mailcow

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
