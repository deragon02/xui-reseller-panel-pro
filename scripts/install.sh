#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="xui-reseller"
APP_DIR="${APP_DIR:-/opt/xui-reseller-panel}"
REPO_URL="${REPO_URL:-https://github.com/deragon02/xui-reseller-panel-pro.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-}"
DB_NAME="${DB_NAME:-xui_reseller}"
DB_USER="${DB_USER:-xui_reseller_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-https://api.manus.im}"
VITE_APP_ID="${VITE_APP_ID:-}"
VITE_OAUTH_PORTAL_URL="${VITE_OAUTH_PORTAL_URL:-https://auth.manus.im}"

log() { printf '\n\033[1;32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
require_root() { [[ "$(id -u)" -eq 0 ]] || fail "Run as root: sudo bash scripts/install.sh"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

require_root
[[ -f /etc/os-release ]] || fail "Unsupported operating system"
. /etc/os-release
[[ "${ID:-}" == "ubuntu" || "${ID_LIKE:-}" == *debian* ]] || fail "This quick installer supports Ubuntu/Debian only"

if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
fi
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"
XUI_TOKEN_ENCRYPTION_KEY="${XUI_TOKEN_ENCRYPTION_KEY:-$(openssl rand -base64 48 | tr -d '\n')}"

if [[ -t 0 ]]; then
  read -r -p "Domain (optional, e.g. reseller.example.com): " DOMAIN_INPUT || true
  [[ -n "${DOMAIN_INPUT:-}" ]] && DOMAIN="$DOMAIN_INPUT"
  read -r -p "Manus OAuth App ID (optional for initial install): " OAUTH_INPUT || true
  [[ -n "${OAUTH_INPUT:-}" ]] && VITE_APP_ID="$OAUTH_INPUT"
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates certbot curl git nginx mysql-server openssl python3-certbot-nginx rsync ufw

if ! command_exists node || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  log "Installing Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
fi

if ! command_exists pnpm; then
  log "Installing pnpm"
  npm install --global pnpm
fi

log "Preparing application directory"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --prune origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

log "Creating least-privilege MySQL database user"
mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \\`$DB_NAME\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \\`$DB_NAME\\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

log "Writing protected runtime configuration"
install -d -m 750 "$APP_DIR"
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL=mysql://$DB_USER:$DB_PASSWORD@127.0.0.1:3306/$DB_NAME
JWT_SECRET=$JWT_SECRET
XUI_TOKEN_ENCRYPTION_KEY=$XUI_TOKEN_ENCRYPTION_KEY
VITE_APP_ID=$VITE_APP_ID
OAUTH_SERVER_URL=$OAUTH_SERVER_URL
VITE_OAUTH_PORTAL_URL=$VITE_OAUTH_PORTAL_URL
OWNER_OPEN_ID=
OWNER_NAME=
ENV
chmod 600 "$APP_DIR/.env"

log "Installing dependencies, testing, migrating, and building"
pnpm install --frozen-lockfile=false
pnpm check
pnpm test
pnpm drizzle-kit migrate
pnpm build

log "Installing systemd service"
cat > /etc/systemd/system/$APP_NAME.service <<SERVICE
[Unit]
Description=XUI Reseller Panel
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $APP_DIR/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
SERVICE

chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable --now "$APP_NAME"

if [[ -n "$DOMAIN" ]]; then
  log "Configuring Nginx for $DOMAIN"
  cat > "/etc/nginx/sites-available/$APP_NAME" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
  ln -sfn "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  if command_exists certbot && [[ "${SKIP_TLS:-0}" != "1" ]]; then
    certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" || warn "TLS was not issued automatically; run certbot --nginx -d $DOMAIN after DNS is ready"
  else
    warn "Install Certbot and run: certbot --nginx -d $DOMAIN"
  fi
else
  warn "No domain supplied. The app is available locally on port 3000; configure Nginx and HTTPS later."
fi

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true

log "Installation completed"
echo "App directory: $APP_DIR"
echo "Service:       systemctl status $APP_NAME"
echo "Logs:          journalctl -u $APP_NAME -f"
echo "Update:        APP_DIR=$APP_DIR SERVICE_NAME=$APP_NAME bash $APP_DIR/scripts/update.sh"
[[ -n "$DOMAIN" ]] && echo "URL:           https://$DOMAIN"
[[ -z "$VITE_APP_ID" ]] && warn "OAuth App ID is empty. Add VITE_APP_ID to $APP_DIR/.env and restart the service."
