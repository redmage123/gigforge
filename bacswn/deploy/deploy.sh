#!/usr/bin/env bash
# Run FROM A DEV MACHINE:  deploy/deploy.sh <domain>
# <domain> must already have an A record pointing at the prod host.
#
# 1. Installs the nginx vhost for <domain> and gets a Let's Encrypt cert.
# 2. Syncs the hardened code (admin-only registration, healthcheck fix,
#    localhost-only port binding) and rebuilds the container.
# 3. Verifies: HTTPS health OK, :8060 no longer reachable from outside.
set -euo pipefail

DOMAIN=${1:?usage: deploy/deploy.sh <domain>}
HOST=aielevate@78.47.104.139
REMOTE_DIR=/opt/ai-elevate/gigforge/projects/bacswn
HERE=$(cd "$(dirname "$0")/.." && pwd)

ip=$(dig +short "$DOMAIN" A | tail -1)
[ "$ip" = "78.47.104.139" ] || { echo "DNS for $DOMAIN resolves to '$ip', not 78.47.104.139"; exit 1; }

echo "==> Syncing code"
rsync -av --relative \
  "$HERE/./api/auth.py" \
  "$HERE/./middleware/auth.py" \
  "$HERE/./conftest.py" \
  "$HERE/./tests/test_auth.py" \
  "$HERE/./tests/test_security.py" \
  "$HERE/./docker-compose.yml" \
  "$HERE/./bacswn.nginx.conf" \
  "$HERE/./deploy/" \
  "$HOST:$REMOTE_DIR/"

echo "==> nginx vhost + TLS"
ssh "$HOST" "set -e
  sed 's/__DOMAIN__/$DOMAIN/' $REMOTE_DIR/bacswn.nginx.conf | sudo tee /etc/nginx/sites-available/bacswn >/dev/null
  sudo ln -sf /etc/nginx/sites-available/bacswn /etc/nginx/sites-enabled/bacswn
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect"  # reuses the host's existing certbot account

echo "==> Rebuild container"
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --build"

echo "==> Verify"
for i in $(seq 1 30); do
  curl -sf "https://$DOMAIN/health/" >/dev/null && break
  sleep 2
done
curl -sf "https://$DOMAIN/health/" | head -c 200; echo
code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://78.47.104.139:8060/health/" || true)
echo "public :8060 -> $code (expect 000 = unreachable)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/auth/register" \
  -H 'content-type: application/json' -d '{}')
echo "anonymous register -> $code (expect 401)"
