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

# 1. Install Docker, Docker Compose, and Certbot on ARM64 if missing
echo "==> [1/7] Checking Docker, Docker Compose, and Certbot (ARM64)..."
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

if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing Certbot and Nginx plugin..."
  apt-get update -y
  apt-get install -y certbot python3-certbot-nginx
fi
echo "Certbot version: $(certbot --version 2>/dev/null || echo 'installed')"

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

# 5. Configure Host Nginx for mail.embeddedindia.in & Obtain Let's Encrypt SSL
echo "==> [5/7] Configuring Host Nginx reverse proxy and Let's Encrypt SSL..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot
chown -R www-data:www-data /var/www/certbot 2>/dev/null || chmod -R 755 /var/www/certbot

# Provide temporary certificate if no certificate exists yet so Nginx can start
mkdir -p "/etc/letsencrypt/live/${MAIL_HOST}"
if [ ! -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  if [ -f "/etc/ssl/embeddedindia/origin.crt" ]; then
    ln -sf /etc/ssl/embeddedindia/origin.crt "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem"
    ln -sf /etc/ssl/embeddedindia/origin.key "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
  else
    openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
      -keyout "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem" \
      -out "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" \
      -subj "/CN=${MAIL_HOST}" 2>/dev/null
  fi
fi

cp "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" "/etc/nginx/sites-available/${MAIL_HOST}.conf"
ln -sf "/etc/nginx/sites-available/${MAIL_HOST}.conf" "/etc/nginx/sites-enabled/${MAIL_HOST}.conf"

# Test and reload Nginx so ACME webroot challenge /.well-known/acme-challenge/ is active on port 80
nginx -t
systemctl reload nginx

# Check whether existing cert is a real Let's Encrypt certificate or a self-signed / origin fallback
IS_REAL_LE=false
if [ -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ] && [ ! -L "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  if openssl x509 -in "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"; then
    IS_REAL_LE=true
    echo "  + Valid Let's Encrypt certificate already active."
  fi
fi

if [ "$IS_REAL_LE" = "false" ]; then
  echo "Obtaining trusted Let's Encrypt certificate via ACME webroot..."
  
  # Detect public IPv4 of this host
  MY_IP=$(curl -4s --max-time 3 https://ifconfig.me 2>/dev/null || curl -4s --max-time 3 https://icanhazip.com 2>/dev/null || echo "129.225.79.183")
  
  # Only request SANs if their DNS actually points to this host IP
  CERT_DOMAINS=("-d" "${MAIL_HOST}")
  
  AUTODISC_IP=$(getent ahostsv4 "autodiscover.${DOMAIN}" 2>/dev/null | awk '{print $1; exit}' || echo "")
  if [ -n "$AUTODISC_IP" ] && [ "$AUTODISC_IP" = "$MY_IP" ]; then
    CERT_DOMAINS+=("-d" "autodiscover.${DOMAIN}")
  else
    echo "  Notice: autodiscover.${DOMAIN} does not point to this server (${MY_IP}) - omitting from SSL cert."
  fi
  
  AUTOCONF_IP=$(getent ahostsv4 "autoconfig.${DOMAIN}" 2>/dev/null | awk '{print $1; exit}' || echo "")
  if [ -n "$AUTOCONF_IP" ] && [ "$AUTOCONF_IP" = "$MY_IP" ]; then
    CERT_DOMAINS+=("-d" "autoconfig.${DOMAIN}")
  else
    echo "  Notice: autoconfig.${DOMAIN} does not point to this server (${MY_IP}) - omitting from SSL cert."
  fi

  # If temporary symlink to origin cert exists, clear it so Certbot can create real cert directory
  if [ -L "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
    rm -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
    rmdir "/etc/letsencrypt/live/${MAIL_HOST}" 2>/dev/null || true
  fi

  # Run Certbot non-interactively
  certbot certonly --webroot -w /var/www/certbot "${CERT_DOMAINS[@]}" \
    --non-interactive --agree-tos -m "admin@${DOMAIN}" --keep-until-expiring || {
      echo "Warning: Certbot initial issuance encountered an issue. Re-linking origin fallback temporarily..."
      mkdir -p "/etc/letsencrypt/live/${MAIL_HOST}"
      ln -sf /etc/ssl/embeddedindia/origin.crt "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem"
      ln -sf /etc/ssl/embeddedindia/origin.key "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
    }
  
  nginx -t
  systemctl reload nginx
fi

# 6. Pull and Launch Mailcow Docker Services
echo "==> [6/7] Pulling and starting Mailcow containers in ${MAIL_DIR}..."
cd "${MAIL_DIR}"
docker compose pull
docker compose up -d

# Wait for MariaDB container and execute initial database schema sync
echo "Waiting for MariaDB to initialize..."
for i in {1..30}; do
  if docker compose exec -T mysql-mailcow mariadb-admin ping --silent 2>/dev/null || docker compose exec -T mysql-mailcow mysqladmin ping --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "Running initial database schema migration and API sync..."
docker compose exec -T php-fpm-mailcow php -c /usr/local/etc/php -f /web/inc/init_db.inc.php || true
docker compose restart php-fpm-mailcow nginx-mailcow

# Wait for Dovecot for password encryption
echo "Waiting for Dovecot service for password encryption..."
for i in {1..20}; do
  if docker compose exec -T dovecot-mailcow doveadm whoami 2>/dev/null; then
    break
  fi
  sleep 1
done

# Provision / Reset superadmin account credentials
TARGET_ADMIN_PASS="${ADMIN_PASSWORD:-moohoo}"
echo "Provisioning master admin credentials for 'admin'..."
source "${MAIL_DIR}/mailcow.conf" 2>/dev/null || true
ADMIN_HASH=$(docker compose exec -T dovecot-mailcow doveadm pw -s SSHA256 -p "${TARGET_ADMIN_PASS}" 2>/dev/null | tr -d '\r\n')

if [ -n "${ADMIN_HASH}" ] && [ -n "${DBPASS:-}" ]; then
  docker compose exec -T mysql-mailcow sh -c "mysql -u\"${DBUSER}\" -p\"${DBPASS}\" \"${DBNAME}\" -e \"
    DELETE FROM admin WHERE username='admin';
    DELETE FROM domain_admins WHERE username='admin';
    INSERT INTO admin (username, password, superadmin, active) VALUES ('admin', '${ADMIN_HASH}', 1, 1);
    DELETE FROM tfa WHERE username='admin';
  \" 2>/dev/null || mariadb -u\"${DBUSER}\" -p\"${DBPASS}\" \"${DBNAME}\" -e \"
    DELETE FROM admin WHERE username='admin';
    DELETE FROM domain_admins WHERE username='admin';
    INSERT INTO admin (username, password, superadmin, active) VALUES ('admin', '${ADMIN_HASH}', 1, 1);
    DELETE FROM tfa WHERE username='admin';
  \"" 2>/dev/null || true

  ADMIN_CHECK=$(docker compose exec -T mysql-mailcow sh -c "mysql -u\"${DBUSER}\" -p\"${DBPASS}\" \"${DBNAME}\" -N -e \"SELECT username FROM admin WHERE username='admin';\" 2>/dev/null || mariadb -u\"${DBUSER}\" -p\"${DBPASS}\" \"${DBNAME}\" -N -e \"SELECT username FROM admin WHERE username='admin';\" 2>/dev/null" | tr -d '\r\n' || true)
  if [ "${ADMIN_CHECK}" = "admin" ]; then
    echo "  + Master admin account successfully provisioned and verified in database."
  fi
else
  # Fallback to built-in helper script if doveadm was not yet responsive
  if [ -f "${MAIL_DIR}/helper-scripts/mailcow-reset-admin.sh" ]; then
    echo "Running helper-scripts/mailcow-reset-admin.sh..."
    bash "${MAIL_DIR}/helper-scripts/mailcow-reset-admin.sh" -y || true
  fi
fi

# 7. Final Instructions & Status Summary
echo "=================================================================="
echo "==> EMAIL SERVER DEPLOYMENT COMPLETE!"
echo "=================================================================="
echo "Access Points:"
echo "  - Mailcow Admin Control Panel: https://${MAIL_HOST}/admin"
echo "  - Webmail (SOGo):              https://${MAIL_HOST}/SOGo/ (or https://${MAIL_HOST}/)"
echo "  - Outlook ActiveSync URL:      https://${MAIL_HOST}/Microsoft-Server-ActiveSync"
echo ""
echo "Master Admin Login (Log in at https://${MAIL_HOST}/admin):"
echo "  - Username: admin"
echo "  - Password: ${TARGET_ADMIN_PASS}"
echo "  (CHANGE IMMEDIATELY UPON FIRST LOGIN)"
echo ""
echo "Next Action Items:"
echo "  1. Log in to https://${MAIL_HOST}/admin"
echo "  2. Go to 'Configuration' -> 'Mail Setup' -> 'Add Domain': ${DOMAIN}"
echo "  3. Go to 'Configuration' -> 'ARC/DKIM Keys' -> Generate 2048-bit DKIM key for ${DOMAIN} (Selector: dkim)"
echo "  4. Add the DNS records to Cloudflare using: node scripts/generate-mail-dns-records.js"
echo "=================================================================="
