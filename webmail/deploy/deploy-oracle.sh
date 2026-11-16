#!/usr/bin/env bash
# ==============================================================================
# Deploy Modern Fluid Webmail to Oracle Cloud VM (129.225.79.183)
# ==============================================================================
set -Eeuo pipefail

SERVER_HOST="${SERVER_HOST:-129.225.79.183}"
SERVER_USER="${SERVER_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-../keys/ssh-key-2026-10-30.key}"
REMOTE_DIR="/var/www/webmail"

echo "==> [1/5] Building local assets..."
npm run build

echo "==> [2/5] Creating remote directory structure on ${SERVER_HOST}..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "sudo mkdir -p ${REMOTE_DIR} ${REMOTE_DIR}/storage ${REMOTE_DIR}/storage/attachments ${REMOTE_DIR}/storage/eml && sudo chown -R ${SERVER_USER}:${SERVER_USER} ${REMOTE_DIR}"

echo "==> [3/5] Syncing application bundle to Oracle Cloud server..."
rsync -avz -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  --exclude "node_modules" \
  --exclude ".git" \
  --exclude "*.db" \
  --exclude "storage" \
  ./ "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/"

echo "==> [4/5] Installing production dependencies & migrating database..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
cd /var/www/webmail
npm install --omit=dev
cd server
npx prisma generate
npx prisma db push
EOF

echo "==> [5/5] Configuring systemd & Nginx reverse proxy..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" << 'EOF'
# Install Systemd service
sudo cp /var/www/webmail/deploy/webmail.service /etc/systemd/system/webmail.service
sudo systemctl daemon-reload
sudo systemctl enable webmail.service
sudo systemctl restart webmail.service

# Install Nginx virtual host configuration
if [ -d "/etc/nginx/sites-available" ]; then
  sudo cp /var/www/webmail/deploy/nginx-webmail.conf /etc/nginx/sites-available/webmail
  sudo ln -sf /etc/nginx/sites-available/webmail /etc/nginx/sites-enabled/webmail
  sudo nginx -t && sudo systemctl reload nginx
fi
EOF

echo "==> Deployment Complete! Modern Webmail is live at https://mail.embeddedindia.in"
