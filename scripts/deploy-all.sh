#!/usr/bin/env bash
# ==============================================================================
# scripts/deploy-all.sh
# Single-Command Unified Deploy: Website, Modern Webmail & SOGo / Mail Server
# ==============================================================================
set -Eeuo pipefail

SERVER_HOST="${SERVER_HOST:-129.225.79.183}"
SERVER_USER="${SERVER_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-keys/ssh-key-2026-10-30.key}"
REMOTE_DIR="/var/www/embeddedindia"

echo "========================================================================"
echo "  Deploying Integrated Platform (Website + Webmail + SOGo/Mailcow)      "
echo "  Target: ${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}                    "
echo "========================================================================"

echo; echo "==> [1/5] Building local assets..."
echo "  -> Compiling Website Tailwind CSS..."
npm run build:css

echo "  -> Compiling Modern Webmail Client..."
cd webmail/client && npm run build && cd ../..

echo "  -> Compiling Modern Webmail Server..."
cd webmail/server && npm run build && cd ../..

echo; echo "==> [2/5] Syncing unified repository to Oracle Cloud Server..."
rsync -avz -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  --exclude "node_modules" \
  --exclude ".git" \
  --exclude "*.db-journal" \
  --exclude "webmail/storage" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/"

echo; echo "==> [3/5] Updating server dependencies & databases..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
set -euo pipefail
cd /var/www/embeddedindia

# 1. Update root website dependencies
npm install --omit=dev
npx prisma generate
npx prisma db push --skip-generate

# 2. Update Webmail dependencies & database
cd webmail/server
npm install --omit=dev
npx prisma generate
npx prisma db push --skip-generate
cd /var/www/embeddedindia

# 3. Ensure storage directories exist with correct permissions
mkdir -p webmail/storage/attachments webmail/storage/eml
EOF

echo; echo "==> [4/5] Updating systemd daemons & Nginx..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
set -euo pipefail

# Install/Update Webmail systemd service
sudo cp /var/www/embeddedindia/webmail/deploy/webmail.service /etc/systemd/system/webmail.service
sudo systemctl daemon-reload

# Restart services
sudo systemctl restart embeddedindia.service
sudo systemctl restart webmail.service

# Update Nginx routing
sudo cp /var/www/embeddedindia/webmail/deploy/nginx-merged-webmail.conf /etc/nginx/sites-available/mail.embeddedindia.in.conf
sudo ln -sf /etc/nginx/sites-available/mail.embeddedindia.in.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
EOF

echo; echo "==> [5/5] Performing live health checks..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
echo "Checking Website (Port 3000)..."
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health || echo "Website health check failed"

echo "Checking Modern Webmail (Port 3005)..."
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3005/health || echo "Webmail health check failed"
EOF

echo; echo "========================================================================"
echo "  DEPLOYMENT COMPLETE!                                                  "
echo "  • Website:         https://embeddedindia.in                           "
echo "  • Modern Webmail:  https://mail.embeddedindia.in                      "
echo "  • Backup Webmail:  https://mail.embeddedindia.in/legacy-rc/           "
echo "  • Phone Sync:      https://mail.embeddedindia.in/Microsoft-Server-ActiveSync"
echo "========================================================================"
