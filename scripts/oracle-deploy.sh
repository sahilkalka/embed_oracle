#!/usr/bin/env bash
# ==============================================================================
# Oracle Cloud Zero-Downtime Release Deployment Script
# Usage:
#   1. On Oracle Server (called by GitHub Actions or locally on server):
#      bash scripts/oracle-deploy.sh --remote-apply
#   2. From local workstation (direct SSH push to Oracle Server):
#      bash scripts/oracle-deploy.sh
# ==============================================================================
set -Eeuo pipefail

ORACLE_HOST="${ORACLE_HOST:-129.225.79.183}"
ORACLE_USER="${ORACLE_USER:-ubuntu}"
ORACLE_SSH_KEY="${ORACLE_SSH_KEY_PATH:-keys/ssh-key-2026-10-30.key}"
APP_DIR="${APP_DIR:-/var/www/embeddedindia}"
DOMAIN="${DOMAIN:-embeddedindia.in}"

if [ "${1:-}" = "--remote-apply" ]; then
  cd "$APP_DIR"
  echo "==> [Remote 1/6] Provisioning Oracle server if systemd unit is not yet installed..."
  if [ ! -f /etc/systemd/system/embeddedindia.service ]; then
    bash "$APP_DIR/scripts/oracle-setup.sh"
  fi

  echo "==> [Remote 2/6] Ensuring production .env exists..."
  if [ ! -f "$APP_DIR/.env" ]; then
    RAND_SESSION="$(openssl rand -hex 32)"
    RAND_JWT="$(openssl rand -hex 32)"
    cat > "$APP_DIR/.env" <<EOF
PORT=3000
NODE_ENV=production
APP_URL=https://${DOMAIN}
SESSION_SECRET=${RAND_SESSION}
DATABASE_URL="file:./dev.db"
ADMIN_DEFAULT_EMAIL=admin@embeddedindia.in
ADMIN_DEFAULT_PASSWORD=AdminEmbedded@2026!
ADMIN_JWT_SECRET=${RAND_JWT}
EOF
    chmod 600 "$APP_DIR/.env"
    echo "Created initial production .env at $APP_DIR/.env"
  fi

  echo "==> [Remote 3/6] Backing up SQLite database before update..."
  mkdir -p "$APP_DIR/backups" "$APP_DIR/prisma" "$APP_DIR/public/uploads" "$APP_DIR/public/downloads" "$APP_DIR/tmp"
  if [ -f "$APP_DIR/prisma/dev.db" ]; then
    STAMP="$(date -u +%Y%m%d-%H%M%S)"
    sqlite3 "$APP_DIR/prisma/dev.db" ".backup '$APP_DIR/backups/dev.db.$STAMP'" 2>/dev/null || cp -f "$APP_DIR/prisma/dev.db" "$APP_DIR/backups/dev.db.$STAMP"
    # Retain only the 10 most recent database backups to conserve Block Storage
    ls -1t "$APP_DIR/backups"/dev.db.* 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi

  echo "==> [Remote 4/6] Installing production dependencies (better-sqlite3 arm64)..."
  npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

  echo "==> [Remote 5/6] Initializing SQLite schema, indexes, and running smoke check..."
  node scripts/init-db.js
  if [ "$(sqlite3 "$APP_DIR/prisma/dev.db" 'SELECT COUNT(*) FROM User;' 2>/dev/null || echo 0)" -eq 0 ]; then
    node scripts/seed-sqlite.js
  fi
  if [ ! -f "$APP_DIR/public/downloads/embedded-design-checklist.pdf" ]; then
    node scripts/generate-lead-magnet.js
  fi
  node src/deployment-check.js

  echo "==> [Remote 6/6] Restarting embeddedindia.service and verifying health..."
  sudo systemctl daemon-reload
  sudo systemctl restart embeddedindia.service
  sudo systemctl reload nginx || sudo systemctl restart nginx

  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:3000/health | grep -q '"ok"'; then
      echo "==> SUCCESS: Oracle Server is live and healthy at https://${DOMAIN} (and http://${ORACLE_HOST})!"
      exit 0
    fi
    sleep 1
  done
  echo "ERROR: Health check did not pass within 10s. Service logs:" >&2
  sudo journalctl -u embeddedindia.service -n 40 --no-pager >&2
  exit 1
fi

# Local execution mode: build release bundle and push over SSH to Oracle instance
echo "==> [Local 1/3] Building production CSS and release bundle..."
npm run pack

if [ ! -f "$ORACLE_SSH_KEY" ]; then
  echo "ERROR: SSH key not found at $ORACLE_SSH_KEY" >&2
  exit 1
fi

SSH_OPTS=(-i "$ORACLE_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

echo "==> [Local 2/3] Uploading embeddedindia.zip to ${ORACLE_USER}@${ORACLE_HOST}:${APP_DIR}..."
ssh "${SSH_OPTS[@]}" "${ORACLE_USER}@${ORACLE_HOST}" "sudo mkdir -p '${APP_DIR}' && sudo chown -R ${ORACLE_USER}:${ORACLE_USER} '${APP_DIR}'"
scp "${SSH_OPTS[@]}" embeddedindia.zip "${ORACLE_USER}@${ORACLE_HOST}:${APP_DIR}/embeddedindia.zip"
scp "${SSH_OPTS[@]}" scripts/oracle-setup.sh scripts/oracle-deploy.sh "${ORACLE_USER}@${ORACLE_HOST}:${APP_DIR}/"

echo "==> [Local 3/3] Extracting release and applying deployment on Oracle Server..."
ssh "${SSH_OPTS[@]}" "${ORACLE_USER}@${ORACLE_HOST}" "cd '${APP_DIR}' && python3 -c \"
import zipfile, os
with zipfile.ZipFile('embeddedindia.zip', 'r') as z:
    for member in z.namelist():
        if member in ('.env',) or member.startswith(('prisma/dev.db', 'public/uploads/')):
            continue
        z.extract(member, '.')
\" && rm -f embeddedindia.zip && mv -f oracle-setup.sh scripts/oracle-setup.sh && mv -f oracle-deploy.sh scripts/oracle-deploy.sh && bash scripts/oracle-deploy.sh --remote-apply"

