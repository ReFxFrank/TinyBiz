#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TinyBiz one-step deploy for a fresh Ubuntu VPS (22.04 / 24.04).
#
#   First deploy (serve on the server's IP over http):
#     sudo bash deploy.sh
#
#   With a domain + automatic HTTPS (point DNS at the VPS first):
#     sudo bash deploy.sh shop.example.com
#
#   Enable auto-deploy (cron polls the branch every 5 minutes):
#     sudo bash deploy.sh --install-cron [domain]
#
#   Force a rebuild even with no new commits:
#     sudo bash deploy.sh --force
#
#   After the first run, `redeploy` works from anywhere on the server:
#     redeploy            # pull latest + rebuild + publish
#     redeploy --force    # rebuild even with no new commits
#
# Idempotent and cron-safe: when there are no new commits it exits silently;
# concurrent runs are prevented with a lock; the domain is remembered in
# /etc/tinybiz-domain so unattended runs never clobber the HTTPS config.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/ReFxFrank/TinyBiz.git"
BRANCH="claude/small-business-manager-app-7d4twa"
APP_DIR="/opt/tinybiz"
DOMAIN_FILE="/etc/tinybiz-domain"
LOCK_FILE="/var/lock/tinybiz-deploy.lock"
CRON_FILE="/etc/cron.d/tinybiz-deploy"
LOG_FILE="/var/log/tinybiz-deploy.log"
SHIM_FILE="/usr/local/bin/redeploy"
API_SERVICE="tinybiz-api"
ENV_FILE="/etc/tinybiz.env"
DATA_DIR="/var/lib/tinybiz"

FORCE=0
INSTALL_CRON=0
DOMAIN=""
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --install-cron) INSTALL_CRON=1 ;;
    --*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) DOMAIN="$arg" ;;
  esac
done

ensure_packages() {
  export DEBIAN_FRONTEND=noninteractive
  # build-essential + python3 are better-sqlite3's compile fallback for when
  # its prebuilt binary download fails — cheap insurance, idempotent.
  if ! command -v git >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1 \
    || ! command -v curl >/dev/null 2>&1 || ! command -v gcc >/dev/null 2>&1 \
    || ! command -v python3 >/dev/null 2>&1; then
    echo "──> Installing system packages…"
    apt-get update -y -qq
    apt-get install -y -qq git nginx curl ca-certificates build-essential python3
  fi
  # Node 20 via NodeSource, only when node is absent or older than 18
  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 18 ]; then
    echo "──> Installing Node.js 20…"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs
  fi
}

setup_api() {
  mkdir -p "$DATA_DIR"

  # Seed the env file once, never overwrite — operators put Stripe keys here
  if [ ! -f "$ENV_FILE" ]; then
    echo "──> Creating ${ENV_FILE}…"
    cat > "$ENV_FILE" <<ENV
TINYBIZ_DB=${DATA_DIR}/tinybiz.db
PORT=4000
# Uncomment to enable real Stripe payments on the storefront:
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
ENV
    chmod 600 "$ENV_FILE"
  fi

  local unit unit_file="/etc/systemd/system/${API_SERVICE}.service"
  unit="$(cat <<UNIT
[Unit]
Description=TinyBiz API
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/server
ExecStart=/usr/bin/node index.js
EnvironmentFile=${ENV_FILE}
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
)"
  if [ ! -f "$unit_file" ] || [ "$(cat "$unit_file")" != "$unit" ]; then
    echo "──> Installing systemd service (${API_SERVICE})…"
    printf '%s\n' "$unit" > "$unit_file"
    systemctl daemon-reload
  fi
  systemctl enable --now "$API_SERVICE"
  # Restart on every deploy — the process must pick up the freshly built code
  systemctl restart "$API_SERVICE"
}

configure_nginx() {
  local server_name="${DOMAIN:-_}"
  local site="/etc/nginx/sites-available/tinybiz"
  # Never rewrite a config that already targets this server_name — certbot
  # appends TLS blocks to this file and a rewrite would wipe them. Configs
  # from before the API server lack the /api proxy, so inject just that
  # block in place (before every location /assets/, covering the TLS copy).
  if [ -f "$site" ] && grep -q "server_name ${server_name};" "$site"; then
    if ! grep -q "location /api/" "$site"; then
      echo "──> Adding the /api proxy to the existing nginx config…"
      sed -i '/location \/assets\/ {/i\
    location /api/ {\
        proxy_pass http://127.0.0.1:4000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-Proto $scheme;\
    }\
' "$site"
      nginx -t
    fi
    return
  fi
  echo "──> Configuring nginx…"
  cat > "$site" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    root ${APP_DIR}/dist;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # The API server (systemd: ${API_SERVICE}) listens on localhost only
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

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
}

setup_https() {
  [ -n "$DOMAIN" ] || return 0
  # Only run certbot when this domain has no certificate yet
  [ -d "/etc/letsencrypt/live/${DOMAIN}" ] && return 0
  echo "──> Setting up HTTPS for ${DOMAIN} (Let's Encrypt)…"
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect || {
    echo "!! certbot failed — check that DNS for ${DOMAIN} points at this server."
    echo "   The site still works over http://${DOMAIN} in the meantime."
  }
}

install_shim() {
  # A `redeploy` command on the PATH so nobody has to remember this script's
  # location. Re-execs itself under sudo, so plain `redeploy` works too.
  local shim
  shim="$(cat <<SHIM
#!/usr/bin/env bash
# TinyBiz: pull latest, rebuild, publish. Installed by ${APP_DIR}/deploy.sh.
[ "\$(id -u)" -eq 0 ] || exec sudo "\$0" "\$@"
exec bash ${APP_DIR}/deploy.sh "\$@"
SHIM
)"
  if [ ! -f "$SHIM_FILE" ] || [ "$(cat "$SHIM_FILE")" != "$shim" ]; then
    printf '%s\n' "$shim" > "$SHIM_FILE"
    chmod 755 "$SHIM_FILE"
    echo "──> Installed the \`redeploy\` command (${SHIM_FILE})."
  fi
}

install_cron() {
  echo "──> Installing auto-deploy cron (polls every 5 minutes)…"
  cat > "$CRON_FILE" <<CRON
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=/root
*/5 * * * * root bash ${APP_DIR}/deploy.sh >>${LOG_FILE} 2>&1
CRON
  chmod 644 "$CRON_FILE"
  touch "$LOG_FILE"
  echo "    Watching ${BRANCH} — new pushes go live within 5 minutes."
  echo "    Deploy history: ${LOG_FILE}"
}

main() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Please run with sudo: sudo bash deploy.sh [--install-cron|--force] [domain]" >&2
    exit 1
  fi

  # One deploy at a time — cron ticks must never overlap a manual run
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another deploy is already running — skipping."
    exit 0
  fi

  # Remember/recall the domain so unattended runs keep the HTTPS setup
  if [ -z "$DOMAIN" ] && [ -f "$DOMAIN_FILE" ]; then
    DOMAIN="$(cat "$DOMAIN_FILE")"
  elif [ -n "$DOMAIN" ]; then
    echo "$DOMAIN" > "$DOMAIN_FILE"
  fi

  install_shim

  # Cron fast path: exit silently when there is nothing new to deploy
  if [ "$FORCE" -eq 0 ] && [ -d "$APP_DIR/.git" ] && [ -f "$APP_DIR/dist/index.html" ]; then
    git -C "$APP_DIR" fetch -q origin "$BRANCH" || { echo "[$(date '+%F %T')] fetch failed"; exit 1; }
    local local_rev remote_rev
    local_rev="$(git -C "$APP_DIR" rev-parse HEAD)"
    remote_rev="$(git -C "$APP_DIR" rev-parse "origin/${BRANCH}")"
    if [ "$local_rev" = "$remote_rev" ]; then
      [ "$INSTALL_CRON" -eq 1 ] && install_cron
      exit 0
    fi
    echo "[$(date '+%F %T')] New commits on ${BRANCH} — deploying ${remote_rev:0:9}"
  fi

  ensure_packages

  local self_before=""
  [ -f "$APP_DIR/deploy.sh" ] && self_before="$(sha256sum "$APP_DIR/deploy.sh" | cut -d' ' -f1)"

  echo "──> Fetching TinyBiz (${BRANCH})…"
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
  else
    git clone --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR"
  fi

  # If the pull updated THIS script, hand the deploy over to the new version
  # so its improvements apply this run, not next run. Guarded against loops;
  # the flock on FD 9 survives exec, so no second deploy can slip in.
  if [ -z "${TINYBIZ_REEXEC:-}" ] && [ -n "$self_before" ] &&
     [ "$(sha256sum "$APP_DIR/deploy.sh" | cut -d' ' -f1)" != "$self_before" ]; then
    echo "──> deploy.sh was updated — continuing with the new version…"
    local args=(--force)
    [ "$INSTALL_CRON" -eq 1 ] && args+=(--install-cron)
    TINYBIZ_REEXEC=1 exec bash "$APP_DIR/deploy.sh" "${args[@]}"
  fi

  echo "──> Building…"
  cd "$APP_DIR"
  npm ci --no-audit --no-fund
  npm run build

  echo "──> Installing API server dependencies…"
  (cd "$APP_DIR/server" && npm ci --no-audit --no-fund)

  setup_api
  configure_nginx
  systemctl reload nginx

  # Open the firewall if ufw is active
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null || true
  fi

  setup_https
  [ "$INSTALL_CRON" -eq 1 ] && install_cron

  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  echo "✓ [$(date '+%F %T')] TinyBiz deployed ($(git -C "$APP_DIR" rev-parse --short HEAD))."
  if [ -n "$DOMAIN" ]; then
    echo "  → https://${DOMAIN}"
  else
    echo "  → http://${ip:-your-server-ip}"
  fi
  # Health check — informational only, a slow API start must not fail the deploy
  local health
  if health="$(curl -fsS --max-time 5 --retry 5 --retry-delay 1 --retry-connrefused \
      http://127.0.0.1:4000/api/health 2>/dev/null)"; then
    if printf '%s' "$health" | grep -q '"stripe":true'; then
      echo "  API: running (Stripe enabled)"
    else
      echo "  API: running (mock checkout)"
    fi
  else
    echo "  !! API health check failed — debug with: journalctl -u ${API_SERVICE} -n 20"
  fi
  echo "  Next time, just run: redeploy"
  if [ ! -f "$CRON_FILE" ]; then
    echo "  Tip: \`redeploy --install-cron\` makes every push go live automatically (5-min poll)."
  fi
}

# The whole script is parsed before main runs, so `git reset --hard` replacing
# this very file mid-deploy can't corrupt the running copy.
main "$@"
