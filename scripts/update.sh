#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/xui-reseller-panel}"
SERVICE_NAME="${SERVICE_NAME:-xui-reseller}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/xui-reseller}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

CURRENT_COMMIT="$(git rev-parse HEAD)"
CURRENT_VERSION="$(node -p "require('./package.json').version")"

echo "Updating $APP_DIR"
echo "Current version: $CURRENT_VERSION"
echo "Current commit:  $CURRENT_COMMIT"

# Back up runtime configuration before touching the worktree.
if [[ -f .env ]]; then
  install -m 600 .env "$BACKUP_DIR/.env.$STAMP"
fi
printf '%s\n' "$CURRENT_COMMIT" > "$BACKUP_DIR/commit.$STAMP"

rollback() {
  echo "Update failed; restoring previous commit $CURRENT_COMMIT"
  git reset --hard "$CURRENT_COMMIT" || true
  pnpm install --frozen-lockfile=false || true
  pnpm build || true
  sudo systemctl restart "$SERVICE_NAME" || true
}
trap rollback ERR

git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
pnpm install --frozen-lockfile=false
pnpm check
pnpm test
pnpm drizzle-kit migrate
pnpm build
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl is-active --quiet "$SERVICE_NAME"

trap - ERR
NEW_VERSION="$(node -p "require('./package.json').version")"
NEW_COMMIT="$(git rev-parse HEAD)"
echo "Update completed successfully"
echo "New version: $NEW_VERSION"
echo "New commit:  $NEW_COMMIT"
