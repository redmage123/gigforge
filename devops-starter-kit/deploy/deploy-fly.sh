#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-devops-starter-kit}"
REGION="${2:-lhr}"

if ! command -v fly &>/dev/null; then
  echo "Error: fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

fly deploy --app "$APP_NAME" --region "$REGION"
echo "Deployed to Fly.io: $APP_NAME"
