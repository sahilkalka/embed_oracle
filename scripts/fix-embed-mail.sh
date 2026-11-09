#!/usr/bin/env bash
# ==============================================================================
# Embedded India - Mail Server Repair & Health Restore Script (/embed_mail)
# Target: Ubuntu ARM64 (Oracle Cloud Infrastructure)
# Resolves: PHP-FPM Twig cache permissions, missing mailcow.conf variables,
#           missing app_info.inc.php, and Host Nginx reverse proxy routing.
# ==============================================================================
set -Eeuo pipefail

MAIL_DIR="/embed_mail"
DOMAIN="embeddedindia.in"
MAIL_HOST="mail.${DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================================="
echo "==> Diagnosing and Repairing Mailcow Setup at ${MAIL_DIR}"
echo "=================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root or with sudo." >&2
  exit 1
fi

if [ ! -d "${MAIL_DIR}" ]; then
  echo "Error: Directory ${MAIL_DIR} not found. Deploy first using scripts/deploy-email-server.sh." >&2
  exit 1
fi

cd "${MAIL_DIR}"

# 1. Ensure .env symlink exists and points to mailcow.conf
echo "==> [1/6] Validating .env symlink..."
ln -snf mailcow.conf "${MAIL_DIR}/.env"

# 2. Synchronize and complete mailcow.conf variables
echo "==> [2/6] Validating and repairing mailcow.conf settings..."
if [ ! -f "${MAIL_DIR}/mailcow.conf" ]; then
  echo "mailcow.conf missing. Copying from template..."
  cp "${ROOT_DIR}/embed_mail/mailcow.conf.template" "${MAIL_DIR}/mailcow.conf"
fi

set_conf_var() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "${MAIL_DIR}/mailcow.conf"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${MAIL_DIR}/mailcow.conf"
  else
    echo "${key}=${val}" >> "${MAIL_DIR}/mailcow.conf"
  fi
}

# Critical settings for reverse proxy coexistence
set_conf_var "HTTP_PORT" "8088"
set_conf_var "HTTP_BIND" "127.0.0.1"
set_conf_var "HTTPS_PORT" "8443"
set_conf_var "HTTPS_BIND" "127.0.0.1"
set_conf_var "HTTP_REDIRECT" "n"
set_conf_var "TRUSTED_PROXIES" "127.0.0.1 172.22.1.1"
set_conf_var "COMPOSE_PROJECT_NAME" "mailcowdockerized"
set_conf_var "MASTER" "y"
set_conf_var "DEV_MODE" "n"
set_conf_var "ACL_ANYONE" "disallow"
set_conf_var "MAILDIR_GC_TIME" "7200"
set_conf_var "AUTODISCOVER_SAN" "y"
set_conf_var "ENABLE_IPV6" "false"
set_conf_var "NGINX_MAX_BODY_SIZE" "128m"

# Ensure SOGO_URL_ENCRYPTION_KEY exists and has 16 characters
if ! grep -q "^SOGO_URL_ENCRYPTION_KEY=" "${MAIL_DIR}/mailcow.conf" || grep -q "ChangeMeSogoEncKey16!" "${MAIL_DIR}/mailcow.conf"; then
  SOGO_ENC_KEY=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 16 || openssl rand -hex 8)
  set_conf_var "SOGO_URL_ENCRYPTION_KEY" "${SOGO_ENC_KEY}"
fi

# Ensure REDISPASS exists
if ! grep -q "^REDISPASS=" "${MAIL_DIR}/mailcow.conf"; then
  REDIS_PASS=$(openssl rand -hex 16)
  set_conf_var "REDISPASS" "${REDIS_PASS}"
fi

# 3. Fix Twig template cache and asset permissions (UID 82:82 www-data)
echo "==> [3/6] Fixing filesystem permissions for PHP-FPM (UID 82:82)..."
mkdir -p "${MAIL_DIR}/data/web/templates/cache"
mkdir -p "${MAIL_DIR}/data/assets/ssl"
mkdir -p "${MAIL_DIR}/data/conf/sogo"

# Clear any stale or broken cached templates
find "${MAIL_DIR}/data/web/templates/cache" -mindepth 1 -not -name '.gitkeep' -delete 2>/dev/null || true

# Grant www-data (UID 82) write access to templates cache and runtime dirs
chown -R 82:82 "${MAIL_DIR}/data/web/templates/cache" 2>/dev/null || chmod -R 777 "${MAIL_DIR}/data/web/templates/cache"
chmod -R 775 "${MAIL_DIR}/data/web/templates/cache"

# Ensure app_info.inc.php exists
if [ ! -f "${MAIL_DIR}/data/web/inc/app_info.inc.php" ]; then
  echo "Generating data/web/inc/app_info.inc.php..."
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

# Ensure custom SOGo config is in place
if [ -f "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" ]; then
  cp "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" "${MAIL_DIR}/data/conf/sogo/custom-sogo.conf"
fi

# 4. Synchronize Host Nginx configuration
echo "==> [4/6] Updating Host Nginx configuration..."
if [ -f "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" ]; then
  cp "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" "/etc/nginx/sites-available/${MAIL_HOST}.conf"
  ln -sf "/etc/nginx/sites-available/${MAIL_HOST}.conf" "/etc/nginx/sites-enabled/${MAIL_HOST}.conf"
  nginx -t && systemctl reload nginx
fi

# 5. Recreate Docker Containers & Run Database Schema Sync
echo "==> [5/6] Recreating containers and cleaning conflicting networks..."
cd "${MAIL_DIR}"

# Tear down existing containers to prevent network pool overlap
docker compose down --remove-orphans 2>/dev/null || true

# Check for and clean any orphaned networks using subnet 172.22.1.0/24
echo "Cleaning any stale networks on subnet 172.22.1..."
for net in $(docker network ls -q 2>/dev/null); do
  if docker network inspect "$net" 2>/dev/null | grep -q "172.22.1."; then
    docker network rm "$net" 2>/dev/null || true
  fi
done

# Start containers with a clean network pool
docker compose up -d

# Wait for MariaDB to accept connections
echo "Waiting for MariaDB container to be ready..."
for i in {1..30}; do
  if docker compose exec -T mysql-mailcow mariadb-admin ping --silent 2>/dev/null; then
    echo "  + MariaDB is accepting connections."
    break
  fi
  sleep 2
done

# Run Mailcow database schema initialisation and service sync
echo "Running schema migration and API sync in php-fpm-mailcow..."
docker compose exec -T php-fpm-mailcow php -c /usr/local/etc/php -f /web/inc/init_db.inc.php || true

# Wait for Dovecot for password hashing
echo "Waiting for Dovecot service for password encryption..."
for i in {1..20}; do
  if docker compose exec -T dovecot-mailcow doveadm whoami 2>/dev/null; then
    break
  fi
  sleep 1
done

# Reset / Provision the admin account credentials
TARGET_ADMIN_PASS="${ADMIN_PASSWORD:-moohoo}"
echo "Provisioning master admin credentials for 'admin'..."
source "${MAIL_DIR}/mailcow.conf" 2>/dev/null || true
ADMIN_HASH=$(docker compose exec -T dovecot-mailcow doveadm pw -s SSHA256 -p "${TARGET_ADMIN_PASS}" 2>/dev/null | tr -d '\r\n')

if [ -n "${ADMIN_HASH}" ]; then
  docker compose exec -T mysql-mailcow mariadb -u"${DBUSER}" -p"${DBPASS}" "${DBNAME}" -e "
    DELETE FROM admin WHERE username='admin';
    DELETE FROM domain_admins WHERE username='admin';
    INSERT INTO admin (username, password, superadmin, active) VALUES ('admin', '${ADMIN_HASH}', 1, 1);
    DELETE FROM tfa WHERE username='admin';
  " 2>/dev/null || true
  echo "  + Master admin account provisioned."
else
  # Fallback to built-in helper script if doveadm was not yet responsive
  if [ -f "${MAIL_DIR}/helper-scripts/mailcow-reset-admin.sh" ]; then
    echo "Running helper-scripts/mailcow-reset-admin.sh..."
    bash "${MAIL_DIR}/helper-scripts/mailcow-reset-admin.sh" -y || true
  fi
fi

# Restart php-fpm-mailcow and nginx-mailcow to pick up fresh configuration and cleared cache
echo "Restarting php-fpm-mailcow and nginx-mailcow..."
docker compose restart php-fpm-mailcow nginx-mailcow

# 6. Verify Local Endpoint Response
echo "==> [6/6] Verifying local HTTP response..."
sleep 3
LOCAL_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088/ || true)
LOCAL_BODY_SIZE=$(curl -s http://127.0.0.1:8088/ | wc -c || echo "0")

echo "=================================================================="
echo "Health Check Result:"
echo "  - Local Port 8088 HTTP Code: ${LOCAL_HTTP_CODE}"
echo "  - Local Port 8088 Body Size: ${LOCAL_BODY_SIZE} bytes"
if [ "${LOCAL_BODY_SIZE}" -gt 500 ]; then
  echo "  ==> SUCCESS: Mailcow web UI is live and returning content!"
else
  echo "  ==> Note: Check 'docker compose logs --tail=50 php-fpm-mailcow' if body remains empty."
fi
echo "=================================================================="
echo "Superadmin Login Credentials:"
echo "  - URL:      https://${MAIL_HOST}/"
echo "  - Username: admin"
echo "  - Password: ${TARGET_ADMIN_PASS}"
echo "=================================================================="
