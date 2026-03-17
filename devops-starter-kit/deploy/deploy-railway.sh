#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-devops-starter-kit}"
echo "Deploying $APP_NAME to Railway..."

if ! command -v railway &>/dev/null; then
  echo "Error: railway CLI not found. Install: npm install -g @railway/cli"
  exit 1
fi

railway up --service "$APP_NAME"
echo "Deployment complete!"
