#!/usr/bin/env bash
# ==============================================================================
# Oracle Cloud (VM.Standard.A1.Flex - Ubuntu 26.04 aarch64) Server Setup Script
# Optimized for 4 ARM64 OCPUs, 24 GB RAM, Block Storage, and Cloudflare SSL/CDN
# ==============================================================================
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/embeddedindia}"
APP_USER="${APP_USER:-ubuntu}"
DOMAIN="${DOMAIN:-embeddedindia.in}"
PORT="${PORT:-3000}"

echo "==> [1/7] Installing system packages for Ubuntu aarch64..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y \
  curl ca-certificates gnupg build-essential python3 sqlite3 \
  nginx openssl unzip git rsync iptables-persistent netfilter-persistent

echo "==> [2/7] Installing Node.js 22 LTS (arm64)..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node version: $(node -v) ($(uname -m)) | npm: $(npm -v)"

echo "==> [3/7] Applying Linux kernel & Block Storage sysctl optimizations..."
sudo tee /etc/sysctl.d/99-embeddedindia-oracle.conf >/dev/null <<'EOF'
# Network tuning for 4 Gbps OCI NIC
net.core.somaxconn = 8192
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.ip_local_port_range = 10240 65535

# Memory & OCI Paravirtualized Block Storage tuning (24 GB RAM)
vm.swappiness = 10
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
fs.file-max = 524288
EOF
sudo sysctl --system >/dev/null

echo "==> [4/7] Opening HTTP (80) & HTTPS (443) in Oracle Ubuntu iptables..."
if ! sudo iptables -C INPUT -p tcp -m tcp --dport 80 -m state --state NEW -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 80 -m state --state NEW -j ACCEPT
fi
if ! sudo iptables -C INPUT -p tcp -m tcp --dport 443 -m state --state NEW -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 443 -m state --state NEW -j ACCEPT
fi
sudo netfilter-persistent save || true

echo "==> [5/7] Preparing application directories & Cloudflare Origin SSL..."
sudo mkdir -p "$APP_DIR" "$APP_DIR/prisma" "$APP_DIR/backups" "$APP_DIR/public/uploads" "$APP_DIR/public/downloads" "$APP_DIR/tmp"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Generate self-signed SSL certificate for Cloudflare Full SSL mode if not already present
sudo mkdir -p /etc/ssl/embeddedindia
if [ ! -f /etc/ssl/embeddedindia/origin.crt ] || [ ! -f /etc/ssl/embeddedindia/origin.key ]; then
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/embeddedindia/origin.key \
    -out /etc/ssl/embeddedindia/origin.crt \
    -subj "/C=IN/ST=Telangana/L=Hyderabad/O=Embedded India/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},IP:129.225.79.183"
  sudo chmod 600 /etc/ssl/embeddedindia/origin.key
fi

echo "==> [6/7] Configuring Nginx reverse proxy with Cloudflare Real-IP & RAM file cache..."
sudo tee /etc/nginx/conf.d/cloudflare-realip.conf >/dev/null <<'EOF'
# Restore real visitor IPs from Cloudflare
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;

# Open file descriptor cache in RAM to avoid Block Storage IOPS on static assets
open_file_cache max=4096 inactive=60s;
open_file_cache_valid 120s;
open_file_cache_min_uses 2;
open_file_cache_errors on;
EOF

sudo tee /etc/nginx/sites-available/embeddedindia >/dev/null <<EOF
upstream embeddedindia_cluster {
    server 127.0.0.1:${PORT};
    keepalive 64;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;

    server_name ${DOMAIN} www.${DOMAIN} 129.225.79.183 _;

    ssl_certificate /etc/ssl/embeddedindia/origin.crt;
    ssl_certificate_key /etc/ssl/embeddedindia/origin.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 10M;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;

    # Offload static assets directly from OS RAM page cache without hitting Node.js
    location ~ ^/(css|js|assets|downloads|uploads)/ {
        root ${APP_DIR}/public;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, stale-while-revalidate=86400";
        try_files \$uri @node_backend;
    }

    location = /favicon.svg {
        root ${APP_DIR}/public;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        try_files \$uri @node_backend;
    }

    location / {
        proxy_pass http://embeddedindia_cluster;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location @node_backend {
        proxy_pass http://embeddedindia_cluster;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/embeddedindia /etc/nginx/sites-enabled/embeddedindia
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> [7/7] Configuring systemd multi-worker service (embeddedindia.service)..."
sudo tee /etc/systemd/system/embeddedindia.service >/dev/null <<EOF
[Unit]
Description=Embedded India Web Portal (ARM64 Multi-Worker Cluster)
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=WEB_CONCURRENCY=4
Environment=NODE_OPTIONS=--max-old-space-size=1024
ExecStart=/usr/bin/node ${APP_DIR}/src/cluster.js
Restart=always
RestartSec=3
LimitNOFILE=65535
MemoryMax=4G
StandardOutput=journal
StandardError=journal
SyslogIdentifier=embeddedindia

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable embeddedindia.service
echo "==> Oracle Cloud Ubuntu aarch64 setup complete!"

