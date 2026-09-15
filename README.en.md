# XUI Reseller Panel

A standalone Persian/RTL reseller management panel for 3x-ui / X-UI deployments. The application uses React, Node.js, Express, tRPC, Drizzle ORM, and MySQL.

> **Current status:** this repository contains a runnable MVP with a real 3x-ui API adapter. It implements reseller management, unique suffix codes, ownership boundaries, quotas, credit accounting, activity logs, multi-node management, inbound synchronization, access grants, and real client creation through the API. Verify the adapter paths against the exact 3x-ui version before production use.

## Quick Install

For a fresh Ubuntu/Debian VPS, the recommended path is the installer. It installs Node.js, pnpm, MySQL, Nginx, Certbot, the database, systemd service, migrations, tests, and the production build:

### One-line installer

```bash
tmp=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/deragon02/xui-reseller-panel-pro/main/scripts/install.sh -o "$tmp" && sudo bash "$tmp"; rc=$?; rm -f "$tmp"; exit $rc
```

The script is downloaded to a temporary file before execution instead of piping `curl` directly into `bash`.

```bash
sudo apt update && sudo apt install -y curl git
git clone https://github.com/deragon02/xui-reseller-panel-pro.git
cd xui-reseller-panel-pro
sudo bash scripts/install.sh
```

The installer asks for the domain and OAuth App ID. Non-interactive use:

```bash
sudo DOMAIN=reseller.example.com \
  VITE_APP_ID=YOUR_MANUS_APP_ID \
  bash scripts/install.sh
```

After installation:

```bash
sudo systemctl status xui-reseller
sudo journalctl -u xui-reseller -f
```

See the [visual installation tutorial](docs/visual-installation-guide.md) for the installer flow and troubleshooting diagram.

## What it does

- Admins can assign a reseller to an authenticated system user.
- Every reseller receives a globally unique suffix such as `AR-07`.
- A reseller entering `sara` gets a final username such as `sara-AR-07`.
- The database enforces unique client usernames.
- Resellers can only query and create their own clients.
- Admins set credit, per-client traffic limits, expiration-day limits, and IP limits.
- Credit is reduced inside a database transaction when a client is created.
- The dashboard is responsive and Persian RTL by default.
- The application exposes its current release version and lets admins check GitHub Releases.
- `scripts/update.sh` performs a guarded VPS update with backup, tests, migration, build, restart, and rollback.

## Recommended deployment

Use a VPS for production. A conventional shared PHP host is not sufficient because the application requires a persistent Node.js process, MySQL/MariaDB, environment variables, HTTPS, and a backend connection to 3x-ui.

Recommended layout:

```text
reseller.example.com  -> Nginx/Caddy -> Node.js reseller panel -> MySQL
panel.example.com     -> 3x-ui
```

A single VPS is acceptable for a test deployment. For production, isolate the reseller panel and 3x-ui when possible and restrict the 3x-ui API to trusted network access.

## Requirements

- Ubuntu Server 22.04 or 24.04
- Node.js 20 or newer
- pnpm
- MySQL 8 or MariaDB
- Nginx or Caddy
- A domain or subdomain
- SSH access with sudo
- HTTPS in production

Official references:

- [Ubuntu Server Documentation](https://documentation.ubuntu.com/server/)
- [OpenSSH on Ubuntu](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
- [Ubuntu UFW Firewall](https://documentation.ubuntu.com/server/how-to/security/firewalls/)
- [Node.js Downloads](https://nodejs.org/en/download)
- [Node.js API Documentation](https://nodejs.org/docs/latest/api/)
- [pnpm Installation](https://pnpm.io/installation)
- [MySQL Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- [MySQL Access Control](https://dev.mysql.com/doc/refman/8.0/en/access-control.html)
- [Nginx Beginner's Guide](https://nginx.org/en/docs/beginners_guide.html)
- [Nginx Proxy Module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot Instructions](https://certbot.eff.org/instructions)
- [Official 3x-ui repository](https://github.com/MHSanaei/3x-ui)

## VPS installation

### 1. Install system packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx mysql-server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm
node --version
pnpm --version
```

Always verify external installation commands against the official documentation for your distribution before running them.

### 2. Create the database

```bash
sudo mysql
```

```sql
CREATE DATABASE xui_reseller CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'xui_reseller_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON xui_reseller.* TO 'xui_reseller_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Do not expose MySQL publicly. Use a dedicated application account rather than `root`.

### 3. Clone and build

```bash
cd /opt
sudo git clone https://github.com/deragon02/xui-reseller-panel-pro.git xui-reseller-panel
sudo chown -R "$USER":"$USER" /opt/xui-reseller-panel
cd /opt/xui-reseller-panel
pnpm install --frozen-lockfile=false
pnpm check
pnpm test
pnpm build
```

The repository is private. Use a deploy key or a GitHub credential with the minimum required access; never place a personal access token in a committed file.

### 4. Configure environment variables

```bash
cp docs/env.template .env
chmod 600 .env
nano .env
```

Required values include:

```env
DATABASE_URL=mysql://xui_reseller_app:YOUR_PASSWORD@127.0.0.1:3306/xui_reseller
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
XUI_TOKEN_ENCRYPTION_KEY=GENERATE_ANOTHER_LONG_RANDOM_SECRET
VITE_APP_ID=YOUR_MANUS_OAUTH_APP_ID
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
```

Generate a session secret with:

```bash
openssl rand -base64 48
```

Never commit `.env`, database passwords, 3x-ui credentials, subscription links, or API tokens.

### 5. Apply the database migration

```bash
pnpm drizzle-kit migrate
```

Review migration files before applying them in production. Do not use destructive schema commands without a verified backup.

### 6. Run a local smoke test

```bash
pnpm dev
```

Open `http://SERVER_IP:3000` temporarily for testing. Stop it with `Ctrl+C` after verification.

## Run with systemd

Create `/etc/systemd/system/xui-reseller.service`:

```ini
[Unit]
Description=XUI Reseller Panel
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/xui-reseller-panel
EnvironmentFile=/opt/xui-reseller-panel/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/xui-reseller-panel/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/xui-reseller-panel

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/xui-reseller-panel
sudo systemctl daemon-reload
sudo systemctl enable --now xui-reseller
sudo systemctl status xui-reseller
sudo journalctl -u xui-reseller -f
```

## Nginx and HTTPS

Create an Nginx site for `reseller.example.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name reseller.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/xui-reseller /etc/nginx/sites-enabled/xui-reseller
sudo nginx -t
sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d reseller.example.com
```

Only expose the HTTPS endpoint to end users.

## Versioning and updates

The current release is defined in both `package.json` and `shared/version.ts`. The current feature release is `1.2.0`; the starting release was `1.0.0`. Use Semantic Versioning:

```text
1.0.0 -> initial release
1.2.0 -> backward-compatible feature
1.2.1 -> bug/security fix
2.0.0 -> breaking change
```

The dashboard shows the current version. Admins can check GitHub Releases. An in-dashboard automatic update is intentionally not enabled: a server update must be backed up, tested, migrated, built, and health-checked.

### Publish a release

```bash
npm version patch
pnpm check
pnpm test
pnpm build
git add package.json shared/version.ts
git commit -m "release: v1.0.1"
git tag v1.0.1
git push origin main --tags
```

Create a GitHub Release using the same tag, for example `v1.0.1`.

### Update a VPS

```bash
cd /opt/xui-reseller-panel
sudo APP_DIR=/opt/xui-reseller-panel SERVICE_NAME=xui-reseller bash scripts/update.sh
```

The script backs up `.env` and the current commit, fast-forwards from `main`, installs dependencies, runs TypeScript checks and tests, applies migrations, builds, restarts systemd, and attempts to restore the previous commit if a step fails.

Take a separate database backup before important updates:

```bash
sudo mkdir -p /var/backups/xui-reseller
sudo mysqldump --single-transaction xui_reseller \
  | gzip | sudo tee /var/backups/xui-reseller/db-$(date -u +%Y%m%d-%H%M%S).sql.gz >/dev/null
```

## 3x-ui integration

An admin can add one or more 3x-ui nodes from the dashboard by entering a name, HTTPS base URL, and API token. The backend tests the connection and synchronizes the available inbounds. The admin then selects which nodes and inbounds each reseller may use.

When a reseller creates a client, the backend checks the reseller status, confirms that the selected inbound belongs to the selected node, verifies the reseller grant and quota, calls the 3x-ui API, and stores the returned external client identifier locally. API tokens are encrypted with AES-256-GCM and never returned to the frontend.

The current adapter targets the latest official release verified during this update, **3x-ui v3.8.0**: `Authorization: Bearer`, `/panel/api/inbounds/list`, and `/panel/api/clients/add` with the `client + inboundIds` payload. Endpoint and token behavior can vary by release, so verify them in the authenticated API Docs for the deployed version before production use.

### Client lifecycle and traffic

From the reseller client table, a reseller can renew a client for a selected number of days and optionally purchase additional traffic; any additional traffic is deducted from reseller credit. The same table provides enable/disable, deletion from 3x-ui, and manual traffic synchronization. 3x-ui returns traffic counters in bytes, so the panel converts them to GB and stores the last synchronization timestamp locally.

## Security checklist

- Keep MySQL bound to localhost or a private network.
- Expose only SSH and Nginx/HTTPS through UFW.
- Use SSH keys and disable root/password SSH login where practical.
- Keep `.env` outside Git history and use file mode `600`.
- Do not expose port 3000 publicly in production.
- Back up the database away from the VPS.
- Run `pnpm check`, `pnpm test`, and `pnpm build` before deployment.
- Restrict the 3x-ui API to trusted network access.

## Visual installation tutorial

See [docs/visual-installation-guide.md](docs/visual-installation-guide.md) for a step-by-step visual flow, architecture diagram, and update sequence.
