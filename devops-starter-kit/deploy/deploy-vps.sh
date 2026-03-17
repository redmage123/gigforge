#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:?DEPLOY_HOST env var required}"
USER="${DEPLOY_USER:-ubuntu}"
APP_DIR="${DEPLOY_DIR:-/opt/app}"

echo "Deploying to $USER@$HOST:$APP_DIR"
ssh "$USER@$HOST" "cd $APP_DIR && docker compose pull && docker compose up -d && docker compose ps"
echo "Deployment complete!"
