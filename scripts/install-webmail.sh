#!/usr/bin/env bash
# ==============================================================================
# scripts/install-webmail.sh — install / upgrade Embedded India Mail (webmail)
#
#   sudo bash scripts/install-webmail.sh              # install or upgrade to latest 1.6 LTS
#   sudo RC_VERSION=1.6.11 bash scripts/install-webmail.sh
#
# Runs the webmail inside the mail server's own PHP container (served at /rc/ by the
# mail server's nginx; the host proxy publishes it at https://mail.embeddedindia.in/).
# Idempotent: re-running only applies what changed. Secrets are generated once and kept
# in /root/.embeddedindia-webmail.env (mode 600), never in git.
# ==============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/embed_mail/webmail/roundcube"
MAIL_DIR="${MAIL_DIR:-/embed_mail}"
RC_DIR="${MAIL_DIR}/data/web/rc"
STATE_FILE=/root/.embeddedindia-webmail.env
WWW_UID=82   # www-data inside the mail server's PHP container

step() { echo; echo "==> $*"; }
note() { echo "    $*"; }
dce()  { (cd "$MAIL_DIR" && docker compose exec -T "$@" </dev/null); }

# shellcheck disable=SC1091
source "${MAIL_DIR}/mailcow.conf"

# ------------------------------------------------------------------------------
step "1/9 Secrets"
if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"; note "using existing secrets from $STATE_FILE"
fi
if [ -z "${RC_DB_PASS:-}" ] || [ -z "${RC_DES_KEY:-}" ]; then
  RC_DB_PASS="${RC_DB_PASS:-$(openssl rand -hex 24)}"
  RC_DES_KEY="${RC_DES_KEY:-$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)}"
  (umask 077; printf 'RC_DB_PASS=%s\nRC_DES_KEY=%s\n' "$RC_DB_PASS" "$RC_DES_KEY" > "$STATE_FILE")
  note "generated new secrets in $STATE_FILE"
fi

# ------------------------------------------------------------------------------
step "2/9 Release"
if [ -z "${RC_VERSION:-}" ]; then
  RC_VERSION="$(curl -fsS -m 30 'https://api.github.com/repos/roundcube/roundcubemail/releases?per_page=40' \
    | python3 -c 'import sys,json,re
rels=[r["tag_name"] for r in json.load(sys.stdin) if not r["prerelease"] and re.fullmatch(r"1\.6\.\d+", r["tag_name"])]
rels.sort(key=lambda v: tuple(map(int, v.split("."))))
print(rels[-1] if rels else "")')"
fi
[ -n "$RC_VERSION" ] || { echo "Could not determine the webmail release; set RC_VERSION." >&2; exit 1; }
INSTALLED="$(grep -oP "RCMAIL_VERSION', '\K[^']+" "${RC_DIR}/program/include/iniset.php" 2>/dev/null || true)"
note "target ${RC_VERSION}, installed ${INSTALLED:-none}"

# ------------------------------------------------------------------------------
step "3/9 Files"
if [ "$INSTALLED" != "$RC_VERSION" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  ASSET="roundcubemail-${RC_VERSION}-complete.tar.gz"
  URL="https://github.com/roundcube/roundcubemail/releases/download/${RC_VERSION}/${ASSET}"
  note "downloading ${ASSET}"
  curl -fsSL -m 300 -o "${TMP}/${ASSET}" "$URL"
  DIGEST="$(curl -fsS -m 30 "https://api.github.com/repos/roundcube/roundcubemail/releases/tags/${RC_VERSION}" \
    | python3 -c "import sys,json; print(next((a.get('digest') or '' for a in json.load(sys.stdin)['assets'] if a['name']=='${ASSET}'),''))" || true)"
  if [ -n "$DIGEST" ]; then
    echo "${DIGEST#sha256:}  ${TMP}/${ASSET}" | sha256sum -c --quiet - || { echo "Checksum mismatch, aborting." >&2; exit 1; }
    note "checksum verified"
  else
    note "WARNING: release has no published checksum; continuing over HTTPS only"
  fi
  STAGE="${MAIL_DIR}/data/web/.rc-${RC_VERSION}"
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  tar -xzf "${TMP}/${ASSET}" --no-same-owner --strip-components=1 -C "$STAGE"
  if [ -z "$INSTALLED" ]; then
    mv "$STAGE" "$RC_DIR"; note "installed fresh copy"
  else
    note "upgrading ${INSTALLED} -> ${RC_VERSION}"
    dce php-fpm-mailcow php "/web/.rc-${RC_VERSION}/bin/installto.sh" -y /web/rc
    rm -rf "$STAGE"
  fi
else
  note "already at ${RC_VERSION}"
fi
rm -rf "${RC_DIR}/installer"

# ------------------------------------------------------------------------------
step "4/9 Database"
dce mysql-mailcow mysql -uroot -p"${DBROOT}" -e "
  CREATE DATABASE IF NOT EXISTS roundcubemail CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'roundcube'@'%' IDENTIFIED BY '${RC_DB_PASS}';
  ALTER USER 'roundcube'@'%' IDENTIFIED BY '${RC_DB_PASS}';
  GRANT ALL PRIVILEGES ON roundcubemail.* TO 'roundcube'@'%';
  FLUSH PRIVILEGES;"
HAS_SCHEMA="$(dce mysql-mailcow mysql -uroot -p"${DBROOT}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='roundcubemail' AND table_name='system';" | tr -d '\r')"
if [ "${HAS_SCHEMA:-0}" = "0" ]; then
  (cd "$MAIL_DIR" && docker compose exec -T mysql-mailcow mysql -uroot -p"${DBROOT}" roundcubemail) < "${RC_DIR}/SQL/mysql.initial.sql"
  note "schema created"
else
  note "schema present"
fi

# ------------------------------------------------------------------------------
step "5/9 Configuration"
sed -e "s|__DB_PASS__|${RC_DB_PASS}|" -e "s|__DES_KEY__|${RC_DES_KEY}|" \
  "${SRC}/config.inc.php.template" > "${RC_DIR}/config/config.inc.php"
chown root:${WWW_UID} "${RC_DIR}/config/config.inc.php"; chmod 640 "${RC_DIR}/config/config.inc.php"
note "config.inc.php written"

# ------------------------------------------------------------------------------
step "6/9 Plugins (contacts, two-factor login, context menu)"
[ -f "${RC_DIR}/composer.json" ] || cp "${RC_DIR}/composer.json-dist" "${RC_DIR}/composer.json"
COMPOSER="env COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1 composer --working-dir=/web/rc --no-interaction"
dce php-fpm-mailcow sh -c "$COMPOSER config --no-plugins allow-plugins.roundcube/plugin-installer true"
dce php-fpm-mailcow sh -c "$COMPOSER require --update-no-dev -o \
  'roundcube/carddav:^5.1' 'johndoh/contextmenu:^3.3' 'alexandregz/twofactor_gauthenticator:dev-master'"
for p in carddav contextmenu twofactor_gauthenticator; do
  [ -d "${RC_DIR}/plugins/$p" ] && note "plugin $p present" || { echo "plugin $p missing after composer" >&2; exit 1; }
done

# Plugin settings
install -m 640 -o root -g ${WWW_UID} "${SRC}/plugins-config/managesieve.config.inc.php" "${RC_DIR}/plugins/managesieve/config.inc.php"
install -m 640 -o root -g ${WWW_UID} "${SRC}/plugins-config/carddav.config.inc.php"     "${RC_DIR}/plugins/carddav/config.inc.php"
sed -e "s|__MC_DBUSER__|${DBUSER}|" -e "s|__MC_DBPASS__|${DBPASS}|" -e "s|__MC_DBNAME__|${DBNAME}|" \
  "${SRC}/plugins-config/password.config.inc.php.template" > "${RC_DIR}/plugins/password/config.inc.php"
chown root:${WWW_UID} "${RC_DIR}/plugins/password/config.inc.php"; chmod 640 "${RC_DIR}/plugins/password/config.inc.php"
TFA="${RC_DIR}/plugins/twofactor_gauthenticator"
install -m 640 -o root -g ${WWW_UID} "${SRC}/plugins-config/twofactor_gauthenticator.config.inc.php" "${TFA}/config.inc.php"

# ------------------------------------------------------------------------------
step "7/9 Branding"
rm -rf "${RC_DIR}/plugins/embedded_branding"
cp -r "${SRC}/plugins/embedded_branding" "${RC_DIR}/plugins/embedded_branding"
cp "${SRC}/plugins/embedded_branding/assets/favicon.svg" "${RC_DIR}/favicon.svg"
SKIN_FILE="${RC_DIR}/config/ei-skin.json"
if [ ! -f "$SKIN_FILE" ]; then
  printf '{"skin":"outlook"}\n' > "$SKIN_FILE"
  note "initialized webmail skin state (outlook)"
fi
note "branding plugin installed"

# ------------------------------------------------------------------------------
step "8/9 Permissions"
chown -R root:root "$RC_DIR"
# Code readable by the web server, writable only by root
find "$RC_DIR" -type d -exec chmod 755 {} +
find "$RC_DIR" -type f -exec chmod 644 {} +
find "$RC_DIR/bin" -type f -name '*.sh' -exec chmod 755 {} +
chown -R ${WWW_UID}:${WWW_UID} "${RC_DIR}/temp" "${RC_DIR}/logs"
chmod 750 "${RC_DIR}/temp" "${RC_DIR}/logs"
# Files holding secrets: readable by the web server group only
for f in "${RC_DIR}/config/config.inc.php" "${RC_DIR}/plugins/password/config.inc.php" \
         "${RC_DIR}/plugins/managesieve/config.inc.php" "${RC_DIR}/plugins/carddav/config.inc.php" "${TFA}/config.inc.php"; do
  [ -f "$f" ] && { chgrp ${WWW_UID} "$f"; chmod 640 "$f"; }
done
# Skin toggle file: writable by the website service user (ubuntu) and readable by php-fpm (www-data)
APP_USER="${APP_USER:-ubuntu}"
if id -u "$APP_USER" >/dev/null 2>&1; then
  chown "${APP_USER}:${WWW_UID}" "$SKIN_FILE"
else
  chown "root:${WWW_UID}" "$SKIN_FILE"
fi
chmod 664 "$SKIN_FILE"

# ------------------------------------------------------------------------------
step "9/9 Mail server web routing"
NGX_DST="${MAIL_DIR}/data/conf/nginx/site.webmail.custom"
if ! cmp -s "${SRC}/nginx-site.webmail.custom" "$NGX_DST"; then
  cp "${SRC}/nginx-site.webmail.custom" "$NGX_DST"
  if dce nginx-mailcow nginx -t >/dev/null 2>&1; then
    dce nginx-mailcow nginx -s reload; note "mail server nginx reloaded"
  else
    dce nginx-mailcow nginx -t || true
    rm -f "$NGX_DST"; echo "nginx rejected the webmail rules; removed them." >&2; exit 1
  fi
else
  note "routing already installed"
fi

# The mail server's PHP runs with opcache timestamp checks off: reload PHP-FPM gracefully
# so new or changed webmail code and config take effect.
dce php-fpm-mailcow sh -c 'kill -USR2 1' && note "PHP-FPM reloaded"
sleep 2

TITLE="$(curl -s -m 20 http://127.0.0.1:${HTTP_PORT:-8088}/rc/ | grep -o '<title>[^<]*' | sed 's/<title>//')"
echo
echo "Webmail ${RC_VERSION} ready on the mail server (page title: '${TITLE:-?}')."
echo "Publish it at https://mail.embeddedindia.in/ with: sudo bash scripts/apply-mail-config.sh"
