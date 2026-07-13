#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Tiny Magic Studio one-step deploy for a fresh Ubuntu VPS (22.04 / 24.04).
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
# /etc/tinymagic-domain so unattended runs never clobber the HTTPS config.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/ReFxFrank/TinyBiz.git"
BRANCH="main"
APP_DIR="/opt/tinymagic"
DOMAIN_FILE="/etc/tinymagic-domain"
LOCK_FILE="/var/lock/tinymagic-deploy.lock"
CRON_FILE="/etc/cron.d/tinymagic-deploy"
BACKUP_CRON_FILE="/etc/cron.d/tinymagic-backup"
LOG_FILE="/var/log/tinymagic-deploy.log"
SHIM_FILE="/usr/local/bin/redeploy"
API_SERVICE="tinymagic-api"
ENV_FILE="/etc/tinymagic.env"
MAIL_SERVICE="tinymagic-mail"
MAIL_ENV_FILE="/etc/tinymagic-mail.env"
DATA_DIR="/var/lib/tinymagic"

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

migrate_legacy() {
  # One-time rename of everything installed under the old "tinybiz" name.
  # Idempotent: each step fires only when the old artifact exists and the new
  # one doesn't. Data (DB, uploads, backups) is MOVED, never copied or deleted.
  local migrated=0

  if [ -f /etc/systemd/system/tinybiz-api.service ] || [ -f /etc/systemd/system/tinybiz-mail.service ]; then
    echo "──> Migrating tinybiz → tinymagic (services, data, config)…"
    systemctl disable --now tinybiz-api 2>/dev/null || true
    systemctl disable --now tinybiz-mail 2>/dev/null || true
    rm -f /etc/systemd/system/tinybiz-api.service /etc/systemd/system/tinybiz-mail.service
    systemctl daemon-reload
    migrated=1
  fi

  if [ -d /var/lib/tinybiz ] && [ ! -d "$DATA_DIR" ]; then
    mv /var/lib/tinybiz "$DATA_DIR"
    migrated=1
  fi
  if [ -f "$DATA_DIR/tinybiz.db" ] && [ ! -f "$DATA_DIR/tinymagic.db" ]; then
    # The -wal/-shm companions hold recent commits — they MUST move with the db
    mv "$DATA_DIR/tinybiz.db" "$DATA_DIR/tinymagic.db"
    if [ -f "$DATA_DIR/tinybiz.db-wal" ]; then mv "$DATA_DIR/tinybiz.db-wal" "$DATA_DIR/tinymagic.db-wal"; fi
    if [ -f "$DATA_DIR/tinybiz.db-shm" ]; then mv "$DATA_DIR/tinybiz.db-shm" "$DATA_DIR/tinymagic.db-shm"; fi
  fi
  # Repair boxes migrated by the earlier script that left the companions
  # behind. Only swaps automatically when the new WAL is frameless (bare
  # header) — anything bigger means the new API already wrote data, and a
  # human should reconcile instead of a script. Nothing is ever deleted.
  if [ -f "$DATA_DIR/tinybiz.db-wal" ] && [ -f "$DATA_DIR/tinymagic.db" ]; then
    local new_wal_size=0
    if [ -f "$DATA_DIR/tinymagic.db-wal" ]; then new_wal_size=$(stat -c%s "$DATA_DIR/tinymagic.db-wal"); fi
    if [ "$new_wal_size" -lt 1000 ]; then
      echo "──> Restoring the database's stranded WAL companion…"
      systemctl stop tinymagic-api 2>/dev/null || true
      cp -a "$DATA_DIR/tinymagic.db" "$DATA_DIR/tinymagic.db.pre-repair"
      if [ -f "$DATA_DIR/tinymagic.db-wal" ]; then mv "$DATA_DIR/tinymagic.db-wal" "$DATA_DIR/tinymagic.db-wal.empty"; fi
      rm -f "$DATA_DIR/tinymagic.db-shm"
      mv "$DATA_DIR/tinybiz.db-wal" "$DATA_DIR/tinymagic.db-wal"
      rm -f "$DATA_DIR/tinybiz.db-shm"
      migrated=1
    else
      echo "!! Found BOTH an old stranded WAL and a new WAL with data — not auto-merging."
      echo "   Old: $DATA_DIR/tinybiz.db-wal   New: $DATA_DIR/tinymagic.db-wal"
      echo "   The API keeps running; reconcile manually before deleting anything."
    fi
  fi

  if [ -f /etc/tinybiz.env ] && [ ! -f "$ENV_FILE" ]; then
    sed -e 's/^TINYBIZ_/TINYMAGIC_/' \
        -e 's|/var/lib/tinybiz|/var/lib/tinymagic|g' \
        -e 's|tinybiz\.db|tinymagic.db|g' /etc/tinybiz.env > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    rm -f /etc/tinybiz.env
    migrated=1
  fi
  if [ -f /etc/tinybiz-mail.env ] && [ ! -f "$MAIL_ENV_FILE" ]; then
    mv /etc/tinybiz-mail.env "$MAIL_ENV_FILE"
    migrated=1
  fi

  if [ -f /etc/tinybiz-domain ] && [ ! -f "$DOMAIN_FILE" ]; then mv /etc/tinybiz-domain "$DOMAIN_FILE"; fi
  rm -f /etc/cron.d/tinybiz-backup
  if [ -f /etc/cron.d/tinybiz-deploy ]; then
    rm -f /etc/cron.d/tinybiz-deploy
    INSTALL_CRON=1 # keep auto-deploy alive under the new name
  fi
  if [ -f /var/log/tinybiz-deploy.log ] && [ ! -f "$LOG_FILE" ]; then mv /var/log/tinybiz-deploy.log "$LOG_FILE"; fi

  if [ -f /etc/nginx/sites-available/tinybiz ]; then
    sed 's|/opt/tinybiz|/opt/tinymagic|g' /etc/nginx/sites-available/tinybiz > /etc/nginx/sites-available/tinymagic
    rm -f /etc/nginx/sites-available/tinybiz /etc/nginx/sites-enabled/tinybiz
    ln -sf /etc/nginx/sites-available/tinymagic /etc/nginx/sites-enabled/tinymagic
    migrated=1
  fi

  # The clone itself. Safe even while this script runs from the old path —
  # bash parsed the whole file before main() started (see the note at the end).
  if [ -d /opt/tinybiz ] && [ ! -d "$APP_DIR" ]; then
    mv /opt/tinybiz "$APP_DIR"
    migrated=1
  fi

  [ "$migrated" -eq 1 ] && echo "    Done — data moved intact, nothing deleted."
  return 0
}

setup_api() {
  mkdir -p "$DATA_DIR"

  # Seed the env file once, never overwrite — operators put Stripe keys here
  if [ ! -f "$ENV_FILE" ]; then
    echo "──> Creating ${ENV_FILE}…"
    cat > "$ENV_FILE" <<ENV
TINYMAGIC_DB=${DATA_DIR}/tinymagic.db
PORT=4000
# Canonical public URL. Pins every link built in emails (password reset,
# receipts), OAuth redirects, and SEO output to this host regardless of
# inbound request headers — closes reset-link poisoning. Set it for a domain.
PUBLIC_URL=${DOMAIN:+https://${DOMAIN}}
# Uncomment to enable real Stripe payments on the storefront:
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# Uncomment to enable PayPal at checkout (developer.paypal.com → My apps):
# PAYPAL_CLIENT_ID=...
# PAYPAL_CLIENT_SECRET=...
# PAYPAL_ENV=live
# Optional off-site backup push, run after each nightly backup with
# BACKUP_DB_FILE and BACKUP_FILES_FILE set to the fresh snapshot paths, e.g.:
# BACKUP_PUSH_CMD=rclone copy "\$BACKUP_DB_FILE" b2:my-bucket/tinymagic/
ENV
    chmod 600 "$ENV_FILE"
  fi

  local unit unit_file="/etc/systemd/system/${API_SERVICE}.service"
  unit="$(cat <<UNIT
[Unit]
Description=Tiny Magic Studio API
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

  # Nightly database backup (server/backup.js gzips a consistent snapshot
  # into <db dir>/backups and keeps the newest 14)
  local backup_cron
  backup_cron="$(cat <<CRON
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root sh -c 'set -a; . ${ENV_FILE}; node ${APP_DIR}/server/backup.js' >>/var/log/tinymagic-backup.log 2>&1
CRON
)"
  if [ ! -f "$BACKUP_CRON_FILE" ] || [ "$(cat "$BACKUP_CRON_FILE")" != "$backup_cron" ]; then
    echo "──> Installing nightly backup cron (3:17 AM, keeps 14 days)…"
    printf '%s\n' "$backup_cron" > "$BACKUP_CRON_FILE"
    chmod 644 "$BACKUP_CRON_FILE"
  fi

  # Deploy/backup logs grow forever without this
  local logrotate_file="/etc/logrotate.d/tinymagic"
  local logrotate_conf
  logrotate_conf="$(cat <<'CONF'
/var/log/tinymagic-*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
CONF
)"
  if [ ! -f "$logrotate_file" ] || [ "$(cat "$logrotate_file")" != "$logrotate_conf" ]; then
    echo "──> Installing logrotate config for /var/log/tinymagic-*.log…"
    printf '%s\n' "$logrotate_conf" > "$logrotate_file"
  fi
}

setup_mail_bridge() {
  # Seed the env file once, never overwrite — operators put mail credentials
  # here (e.g. a Resend API key). Without SMTP_* set the bridge stays in demo
  # mode: sends are logged, nothing real goes out.
  if [ ! -f "$MAIL_ENV_FILE" ]; then
    echo "──> Creating ${MAIL_ENV_FILE}…"
    local base token
    token="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
    if [ -n "$DOMAIN" ]; then
      base="https://${DOMAIN}/mail"
    else
      base="http://$(hostname -I 2>/dev/null | awk '{print $1}')/mail"
    fi
    cat > "$MAIL_ENV_FILE" <<ENV
PORT=7071
SEND_TOKEN=${token}
PUBLIC_URL=${base}
# Uncomment + fill in to send real email. For Resend (resend.com): verify your
# domain there first; SMTP_USER is the literal word "resend" and SMTP_PASS is
# your re_... API key.
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=resend
# SMTP_PASS=re_your_api_key
# Downtime alerts: the bridge pings the API every 5 minutes and emails you if
# it stops answering (needs the SMTP settings above). WATCHDOG_FROM must be a
# sender your provider accepts (same domain as your newsletter from-address).
# WATCHDOG_EMAIL=you@example.com
# WATCHDOG_FROM=alerts@yourdomain.ca
ENV
    chmod 600 "$MAIL_ENV_FILE"
    echo "    Mail bridge URL for Settings → Newsletter: ${base}"
    echo "    Send token (paste it there too): ${token}"
  fi

  echo "──> Installing mail bridge dependencies…"
  (cd "$APP_DIR/mail-bridge" && npm install --no-audit --no-fund --loglevel=error)

  local unit unit_file="/etc/systemd/system/${MAIL_SERVICE}.service"
  unit="$(cat <<UNIT
[Unit]
Description=Tiny Magic Studio Mail Bridge
After=network.target

[Service]
WorkingDirectory=${APP_DIR}/mail-bridge
ExecStart=/usr/bin/node index.js
EnvironmentFile=${MAIL_ENV_FILE}
# Tracking store lives with the data (and inside the nightly files backup),
# not next to the code where a re-clone would erase it
Environment=TRACKING_FILE=${DATA_DIR}/mail-tracking.json
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
)"
  if [ ! -f "$unit_file" ] || [ "$(cat "$unit_file")" != "$unit" ]; then
    echo "──> Installing systemd service (${MAIL_SERVICE})…"
    printf '%s\n' "$unit" > "$unit_file"
    systemctl daemon-reload
  fi
  systemctl enable --now "$MAIL_SERVICE"
  systemctl restart "$MAIL_SERVICE"
}

configure_nginx() {
  local server_name="${DOMAIN:-_}"
  local site="/etc/nginx/sites-available/tinymagic"
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
    if ! grep -q "location /uploads/" "$site"; then
      echo "──> Adding the /uploads proxy to the existing nginx config…"
      sed -i '/location \/assets\/ {/i\
    location /uploads/ {\
        proxy_pass http://127.0.0.1:4000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
    }\
' "$site"
      nginx -t
    fi
    if ! grep -q "location /mail/" "$site"; then
      echo "──> Adding the /mail proxy to the existing nginx config…"
      sed -i '/location \/assets\/ {/i\
    location /mail/ {\
        proxy_pass http://127.0.0.1:7071/;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
    }\
' "$site"
      nginx -t
    fi
    if ! grep -q "X-Forwarded-For" "$site"; then
      echo "──> Adding X-Forwarded-For to the nginx config (real per-IP rate limits)…"
      # Deliberately \$remote_addr, NOT \$proxy_add_x_forwarded_for: appending
      # would let clients spoof a fresh IP per request and dodge every limit.
      sed -i 's|proxy_set_header X-Real-IP \$remote_addr;|proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $remote_addr;|' "$site"
      nginx -t && systemctl reload nginx
    fi
    if ! grep -q "location /product/" "$site"; then
      echo "──> Adding the /product proxy (link previews) to the existing nginx config…"
      sed -i '/location \/assets\/ {/i\
    location /product/ {\
        proxy_pass http://127.0.0.1:4000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Forwarded-Proto $scheme;\
    }\
' "$site"
      nginx -t
    fi
    if ! grep -q "@asset_missing" "$site"; then
      echo "──> Teaching nginx to answer missing assets with no-store (Cloudflare caches bare 404s)…"
      sed -i 's|try_files \$uri =404;|try_files $uri @asset_missing;|' "$site"
      sed -i '/location \/assets\/ {/i\
    location @asset_missing {\
        add_header Cache-Control "no-store" always;\
        return 404;\
    }\
' "$site"
      nginx -t
    fi
    if ! grep -q "location = /sitemap.xml" "$site"; then
      echo "──> Adding robots/sitemap proxies to the existing nginx config…"
      sed -i '/location \/assets\/ {/i\
    location = /robots.txt {\
        proxy_pass http://127.0.0.1:4000;\
        proxy_set_header Host $host;\
        proxy_set_header X-Forwarded-Proto $scheme;\
    }\
    location = /sitemap.xml {\
        proxy_pass http://127.0.0.1:4000;\
        proxy_set_header Host $host;\
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

    # The API server (systemd: ${API_SERVICE}) listens on localhost only.
    # X-Forwarded-For is \$remote_addr on purpose — never trust an inbound one.
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Product photos live next to the database, served by the API
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    # Mail bridge (systemd: tinybiz-mail): newsletter sends + email tracking.
    # The trailing slash strips the /mail prefix so the bridge sees root paths.
    location /mail/ {
        proxy_pass http://127.0.0.1:7071/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    # Product pages go through the API so link previews (Discord, iMessage,
    # socials) get per-product og: tags. Browsers get the same SPA shell.
    location /product/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # SEO: the API renders these from live catalog data
    location = /robots.txt {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location = /sitemap.xml {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Hashed build assets never change — cache hard. A MISSING asset must
    # answer no-store: Cloudflare caches bare 404s for ~5 minutes, which used
    # to keep freshly deployed chunks "missing" long after the deploy.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri @asset_missing;
    }
    location @asset_missing {
        add_header Cache-Control "no-store" always;
        return 404;
    }

    # SPA routing: every path falls back to index.html
    location / {
        add_header Cache-Control "no-cache";
        try_files \$uri /index.html;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/tinymagic /etc/nginx/sites-enabled/tinymagic
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
# Tiny Magic Studio: pull latest, rebuild, publish. Installed by ${APP_DIR}/deploy.sh.
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

  migrate_legacy

  # Remember/recall the domain so unattended runs keep the HTTPS setup
  if [ -z "$DOMAIN" ] && [ -f "$DOMAIN_FILE" ]; then
    DOMAIN="$(cat "$DOMAIN_FILE")"
  elif [ -n "$DOMAIN" ]; then
    echo "$DOMAIN" > "$DOMAIN_FILE"
  fi

  install_shim

  # The clone may be --single-branch on an older branch — make sure the
  # deploy branch is fetchable before any rev-parse against origin/${BRANCH}.
  [ -d "$APP_DIR/.git" ] && git -C "$APP_DIR" remote set-branches origin "$BRANCH"

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

  echo "──> Fetching Tiny Magic Studio (${BRANCH})…"
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch origin "$BRANCH"
    # -B: create/reset the local branch — handles switching deploy branches
    git -C "$APP_DIR" checkout -B "$BRANCH" "origin/${BRANCH}"
    git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
  else
    git clone --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR"
  fi

  # If the pull updated THIS script, hand the deploy over to the new version
  # so its improvements apply this run, not next run. Guarded against loops;
  # the flock on FD 9 survives exec, so no second deploy can slip in.
  if [ -z "${TINYMAGIC_REEXEC:-}" ] && [ -n "$self_before" ] &&
     [ "$(sha256sum "$APP_DIR/deploy.sh" | cut -d' ' -f1)" != "$self_before" ]; then
    echo "──> deploy.sh was updated — continuing with the new version…"
    local args=(--force)
    [ "$INSTALL_CRON" -eq 1 ] && args+=(--install-cron)
    TINYMAGIC_REEXEC=1 exec bash "$APP_DIR/deploy.sh" "${args[@]}"
  fi

  echo "──> Building…"
  cd "$APP_DIR"
  npm ci --no-audit --no-fund
  # Build into a staging dir and swap. nginx keeps serving the COMPLETE old
  # build during the ~10s build — before this, dist was emptied first, every
  # request 404'd, and Cloudflare cached those 404s for ~5 minutes, so each
  # deploy broke page loads well after it finished.
  rm -rf dist-next dist-old
  npm run build -- --outDir dist-next
  # Previous build's hashed chunks ride along so tabs opened before this
  # deploy still lazy-load their pages; age-pruned so they don't pile up.
  if [ -d dist/assets ]; then
    mkdir -p dist-next/assets
    cp -an dist/assets/. dist-next/assets/ 2>/dev/null || true
    find dist-next/assets -type f -mtime +14 -delete 2>/dev/null || true
  fi
  if [ -d dist ]; then mv dist dist-old; fi
  mv dist-next dist
  rm -rf dist-old

  echo "──> Installing API server dependencies…"
  (cd "$APP_DIR/server" && npm ci --no-audit --no-fund)

  setup_api
  setup_mail_bridge
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
  echo "✓ [$(date '+%F %T')] Tiny Magic Studio deployed ($(git -C "$APP_DIR" rev-parse --short HEAD))."
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
