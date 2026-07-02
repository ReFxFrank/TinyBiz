#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TinyBiz one-step deploy for a fresh Ubuntu VPS (22.04 / 24.04).
#
#   Serve on the server's IP (http):
#     sudo bash deploy.sh
#
#   Serve on a domain with automatic HTTPS (point DNS at the VPS first):
#     sudo bash deploy.sh shop.example.com
#
# Idempotent: re-run the same command any time to pull the latest code,
# rebuild, and reload. Installs: git, nginx, Node 20 (only if missing).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/ReFxFrank/TinyBiz.git"
BRANCH="claude/small-business-manager-app-7d4twa"
APP_DIR="/opt/tinybiz"
DOMAIN="${1:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo bash deploy.sh [domain]" >&2
  exit 1
fi

echo "──> Installing system packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq git nginx curl ca-certificates

# Node 20 via NodeSource, only when node is absent or older than 18
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 18 ]; then
  echo "──> Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "──> Fetching TinyBiz ($BRANCH)…"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR"
fi

echo "──> Building…"
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build

echo "──> Configuring nginx…"
SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/tinybiz <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    root ${APP_DIR}/dist;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Hashed build assets never change — cache hard
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    # SPA routing: every path falls back to index.html
    location / {
        add_header Cache-Control "no-cache";
        try_files \$uri /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/tinybiz /etc/nginx/sites-enabled/tinybiz
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# Open the firewall if ufw is active
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null || true
fi

# Optional automatic HTTPS when a domain was provided
if [ -n "$DOMAIN" ]; then
  echo "──> Setting up HTTPS for ${DOMAIN} (Let's Encrypt)…"
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect || {
    echo "!! certbot failed — check that DNS for ${DOMAIN} points at this server."
    echo "   The site still works over http://${DOMAIN} in the meantime."
  }
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "✓ TinyBiz is live."
if [ -n "$DOMAIN" ]; then
  echo "  → https://${DOMAIN}"
else
  echo "  → http://${IP:-your-server-ip}"
fi
echo "  Re-deploy the latest code anytime with the same command."
