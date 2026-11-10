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
set_conf_var "TRUSTED_PROXIES" "127.0.0.1,172.22.1.1"
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

# Grant www-data (UID 82) full write access to templates cache and runtime dirs
chown -R 82:82 "${MAIL_DIR}/data/web/templates/cache" 2>/dev/null || true
chmod -R 777 "${MAIL_DIR}/data/web/templates/cache"

# Fix permissions on Dovecot SQL dict configuration files for dovecot process (UID 401)
if [ -d "${MAIL_DIR}/data/conf/dovecot/sql" ]; then
  chmod 755 "${MAIL_DIR}/data/conf/dovecot/sql"
  chmod 644 "${MAIL_DIR}/data/conf/dovecot/sql"/*.conf 2>/dev/null || true
fi

# Ensure dhparams.pem exists for Dovecot
if [ ! -f "${MAIL_DIR}/data/assets/ssl/dhparams.pem" ]; then
  echo "Generating dhparams.pem for Dovecot SSL..."
  openssl dhparam -out "${MAIL_DIR}/data/assets/ssl/dhparams.pem" 2048
  chmod 644 "${MAIL_DIR}/data/assets/ssl/dhparams.pem"
fi

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

# Ensure custom Outlook Webmail theme and SOGo config are in place
if [ -f "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" ]; then
  cp "${ROOT_DIR}/embed_mail/sogo/sogo-custom.conf" "${MAIL_DIR}/data/conf/sogo/custom-sogo.conf"
fi
if [ -f "${ROOT_DIR}/embed_mail/webmail/outlook-web.css" ]; then
  cp "${ROOT_DIR}/embed_mail/webmail/outlook-web.css" "${MAIL_DIR}/data/conf/sogo/custom-theme.css"
fi
if [ -f "${ROOT_DIR}/embed_mail/webmail/outlook-web.js" ]; then
  cp "${ROOT_DIR}/embed_mail/webmail/outlook-web.js" "${MAIL_DIR}/data/conf/sogo/outlook-web.js"
fi
if [ -d "${ROOT_DIR}/embed_mail/webmail/assets" ]; then
  cp "${ROOT_DIR}/embed_mail/webmail/assets"/* "${MAIL_DIR}/data/conf/sogo/" 2>/dev/null || true
fi

# Ensure Embedded India Theme for Email Admin Dashboard is in place
mkdir -p "${MAIL_DIR}/data/web/css/themes/embeddedindia"
mkdir -p "${MAIL_DIR}/data/web/css/build"
mkdir -p "${MAIL_DIR}/data/web/inc"
if [ -f "${ROOT_DIR}/embed_mail/admin_theme/theme.json" ]; then
  cp "${ROOT_DIR}/embed_mail/admin_theme/theme.json" "${MAIL_DIR}/data/web/css/themes/embeddedindia/"
fi
if [ -f "${ROOT_DIR}/embed_mail/admin_theme/theme.css" ]; then
  cp "${ROOT_DIR}/embed_mail/admin_theme/theme.css" "${MAIL_DIR}/data/web/css/themes/embeddedindia/"
fi
if [ -f "${ROOT_DIR}/embed_mail/admin_theme/dark.css" ]; then
  cp "${ROOT_DIR}/embed_mail/admin_theme/dark.css" "${MAIL_DIR}/data/web/css/themes/embeddedindia/"
fi
if [ -f "${ROOT_DIR}/embed_mail/admin_theme/0081-custom-mailcow.css" ]; then
  cp "${ROOT_DIR}/embed_mail/admin_theme/0081-custom-mailcow.css" "${MAIL_DIR}/data/web/css/build/0081-custom-mailcow.css"
fi
if [ -f "${ROOT_DIR}/embed_mail/admin_theme/vars.local.inc.php" ]; then
  cp "${ROOT_DIR}/embed_mail/admin_theme/vars.local.inc.php" "${MAIL_DIR}/data/web/inc/vars.local.inc.php"
fi

# 4. Synchronize Host Nginx configuration & Repair Let's Encrypt SSL Certificate
echo "==> [4/6] Updating Host Nginx configuration & verifying SSL certificate..."
mkdir -p /var/www/certbot /etc/nginx/sites-available /etc/nginx/sites-enabled
chown -R www-data:www-data /var/www/certbot 2>/dev/null || chmod -R 755 /var/www/certbot

# Ensure Inbound Mail Ports are open in Host iptables
echo "==> Ensuring host iptables firewall allows mail protocol ports..."
MAIL_PORTS=(25 465 587 993 995 4190)
for PORT in "${MAIL_PORTS[@]}"; do
  if ! iptables -C INPUT -p tcp --dport "${PORT}" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 1 -p tcp --dport "${PORT}" -m state --state NEW -j ACCEPT
    echo "  + Opened TCP port ${PORT} in host iptables"
  fi
done
netfilter-persistent save 2>/dev/null || true

if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot and python3-certbot-nginx..."
  apt-get update -y
  apt-get install -y certbot python3-certbot-nginx
fi

if [ -f "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" ]; then
  cp "${ROOT_DIR}/embed_mail/nginx/mail.embeddedindia.in.conf" "/etc/nginx/sites-available/${MAIL_HOST}.conf"
  ln -sf "/etc/nginx/sites-available/${MAIL_HOST}.conf" "/etc/nginx/sites-enabled/${MAIL_HOST}.conf"
fi

# Ensure placeholder cert exists so Nginx can validate config if no cert exists
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

nginx -t
systemctl reload nginx

# Check if current certificate is self-signed or a symlink to Cloudflare origin CA
NEEDS_LE_CERT=false
if [ -L "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  TARGET=$(readlink -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" || true)
  if [[ "$TARGET" == *"/etc/ssl/embeddedindia/"* ]]; then
    NEEDS_LE_CERT=true
    echo "  ! Detected self-signed origin fallback certificate in /etc/letsencrypt/live/${MAIL_HOST}/."
  fi
fi

if [ -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  CURRENT_ISSUER=$(openssl x509 -in "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" -noout -issuer 2>/dev/null || echo "")
  if echo "$CURRENT_ISSUER" | grep -qi "CN=embeddedindia.in"; then
    NEEDS_LE_CERT=true
    echo "  ! Current certificate issuer is self-signed ($CURRENT_ISSUER). Replacing with Let's Encrypt..."
  fi
else
  NEEDS_LE_CERT=true
fi

if [ "$NEEDS_LE_CERT" = "true" ]; then
  echo "Obtaining trusted Let's Encrypt certificate for ${MAIL_HOST} via ACME webroot..."
  
  MY_IP=$(curl -4s --max-time 3 https://ifconfig.me 2>/dev/null || curl -4s --max-time 3 https://icanhazip.com 2>/dev/null || echo "129.225.79.183")
  CERT_DOMAINS=("-d" "${MAIL_HOST}")
  
  # Only append autodiscover / autoconfig if DNS points to this server IP
  AUTODISC_IP=$(getent ahostsv4 "autodiscover.${DOMAIN}" 2>/dev/null | awk '{print $1; exit}' || echo "")
  if [ -n "$AUTODISC_IP" ] && [ "$AUTODISC_IP" = "$MY_IP" ]; then
    CERT_DOMAINS+=("-d" "autodiscover.${DOMAIN}")
  else
    echo "  Notice: autodiscover.${DOMAIN} does not point to this server (${MY_IP}) - omitting from cert request."
  fi
  
  AUTOCONF_IP=$(getent ahostsv4 "autoconfig.${DOMAIN}" 2>/dev/null | awk '{print $1; exit}' || echo "")
  if [ -n "$AUTOCONF_IP" ] && [ "$AUTOCONF_IP" = "$MY_IP" ]; then
    CERT_DOMAINS+=("-d" "autoconfig.${DOMAIN}")
  else
    echo "  Notice: autoconfig.${DOMAIN} does not point to this server (${MY_IP}) - omitting from cert request."
  fi

  # Clear symlink so certbot can create the actual live certificate directory
  if [ -L "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
    rm -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
    rmdir "/etc/letsencrypt/live/${MAIL_HOST}" 2>/dev/null || true
  fi

  certbot certonly --webroot -w /var/www/certbot "${CERT_DOMAINS[@]}" \
    --non-interactive --agree-tos -m "admin@${DOMAIN}" --keep-until-expiring || {
      echo "Warning: Certbot run failed. Restoring origin fallback temporarily..."
      mkdir -p "/etc/letsencrypt/live/${MAIL_HOST}"
      ln -sf /etc/ssl/embeddedindia/origin.crt "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem"
      ln -sf /etc/ssl/embeddedindia/origin.key "/etc/letsencrypt/live/${MAIL_HOST}/privkey.pem"
    }
  
  nginx -t
  systemctl reload nginx
fi

# Print confirmed certificate issuer
if [ -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  ACTIVE_ISSUER=$(openssl x509 -in "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" -noout -issuer 2>/dev/null || echo "Unknown")
  echo "  + Active SSL Issuer: ${ACTIVE_ISSUER}"
fi

# 5. Recreate Docker Containers & Run Database Schema Sync
echo "==> [5/6] Recreating containers and cleaning conflicting networks..."
cd "${MAIL_DIR}"

# Ensure docker-compose.override.yml is synced
if [ -f "${ROOT_DIR}/embed_mail/docker-compose.override.yml" ]; then
  cp "${ROOT_DIR}/embed_mail/docker-compose.override.yml" "${MAIL_DIR}/docker-compose.override.yml"
fi

# Stop and force-remove any lingering mailcow containers to disconnect endpoints
echo "Stopping and disconnecting any existing mailcow containers..."
docker compose down --remove-orphans 2>/dev/null || true
for cid in $(docker ps -a --filter "name=mailcow" -q 2>/dev/null); do
  docker rm -f "$cid" 2>/dev/null || true
done

# Clean up conflicting networks and stale IPAM pools
echo "Cleaning any stale networks on subnet 172.22.1..."
docker network prune -f 2>/dev/null || true
for net in $(docker network ls --format '{{.ID}} {{.Name}}' 2>/dev/null | grep -iE 'mailcow' | awk '{print $1}'); do
  docker network rm "$net" 2>/dev/null || true
done

# Check if any network still holds 172.22.1
STALE_NET=""
for nid in $(docker network ls -q 2>/dev/null); do
  if docker network inspect "$nid" 2>/dev/null | grep -q "172.22.1."; then
    STALE_NET="$nid"
    docker network rm -f "$nid" 2>/dev/null || true
  fi
done

# If an overlapping IPAM network was locked by Docker daemon, restart daemon to clear in-memory IPAM tables
if [ -n "$STALE_NET" ] || docker network ls | grep -qi "mailcow"; then
  echo "Restarting Docker service to flush stuck IPAM address pools..."
  systemctl restart docker
  sleep 3
fi

# Start containers with a clean network pool
echo "Starting Mailcow containers..."
cd "${MAIL_DIR}"
docker compose up -d || {
  echo "Retrying after Docker service restart..."
  systemctl restart docker
  sleep 3
  cd "${MAIL_DIR}"
  docker compose up -d
}

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
echo "Superadmin Access URLs:"
echo "  - Email Admin Dashboard:       https://${DOMAIN}/admin/email"
echo "  - User Webmail (Outlook Web):  https://${DOMAIN}/webmail (or https://${MAIL_HOST})"
echo "  - Raw Mail Engine Backend:     https://${MAIL_HOST}/admin"
echo "  - Admin Username:              admin"
echo "  - Admin Password:              ${TARGET_ADMIN_PASS}"
echo "=================================================================="
