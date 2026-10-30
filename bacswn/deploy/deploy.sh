#!/usr/bin/env bash
# Run FROM A DEV MACHINE, from a clean checkout of master:  deploy/deploy.sh <domain>
# <domain> must already have an A record pointing at the prod host.
#
# 1. Pre-flight: DNS, prod .env has JWT_SECRET, clean checkout.
# 2. Backup: SQLite snapshot inside the data volume + tag the running image
#    as bacswn-bacswn:rollback-<ts>.
# 3. Syncs the full app (never .env, data/, venvs or build output) and rebuilds.
# 4. nginx vhost + Let's Encrypt cert for <domain>.
# 5. Verifies HTTPS health, new routes, :8060 closed to the internet, anonymous
#    registration refused — and rotates the default passwords if they still work.
#
# Rollback:  ssh $HOST 'docker tag bacswn-bacswn:rollback-<ts> bacswn-bacswn &&
#            cd $REMOTE_DIR && docker compose up -d --no-build'
set -euo pipefail

DOMAIN=${1:?usage: deploy/deploy.sh <domain>}
HOST=aielevate@78.47.104.139
REMOTE_DIR=/opt/ai-elevate/gigforge/projects/bacswn
HERE=$(cd "$(dirname "$0")/.." && pwd)
TS=$(date +%Y%m%d-%H%M%S)

echo "==> Pre-flight"
ip=$(dig +short "$DOMAIN" A | tail -1)
[ "$ip" = "78.47.104.139" ] || { echo "DNS for $DOMAIN resolves to '$ip', not 78.47.104.139"; exit 1; }
ssh "$HOST" "grep -Eq '^JWT_SECRET=.{16,}' $REMOTE_DIR/.env" \
  || { echo "prod $REMOTE_DIR/.env has no JWT_SECRET (>=16 chars)"; exit 1; }
git -C "$HERE" diff --quiet HEAD -- . || { echo "uncommitted changes in $HERE — deploy from a clean checkout"; exit 1; }
echo "deploying $(git -C "$HERE" log -1 --format='%h %s')"

echo "==> Backup"
ssh "$HOST" "set -e
  if docker ps -q --filter name=^bacswn-skywatch\$ | grep -q .; then
    docker exec bacswn-skywatch python -c \"
import sqlite3
src = sqlite3.connect('/app/data/bacswn.db'); dst = sqlite3.connect('/app/data/bacswn.db.bak-$TS')
src.backup(dst); dst.close()\"
    echo 'DB snapshot: /app/data/bacswn.db.bak-$TS (in the bacswn_bacswn-data volume)'
  fi
  if docker image inspect bacswn-bacswn >/dev/null 2>&1; then
    docker tag bacswn-bacswn bacswn-bacswn:rollback-$TS && echo 'image tagged bacswn-bacswn:rollback-$TS'
  fi"

echo "==> Syncing code"
rsync -a --itemize-changes \
  --exclude .git --exclude .env --exclude data/ --exclude .venv/ --exclude node_modules/ \
  --exclude frontend/dist/ --exclude static/react/ --exclude __pycache__/ --exclude .pytest_cache/ \
  --exclude .coverage --exclude coverage.xml --exclude .claude/ --exclude memory-bank/ \
  "$HERE/" "$HOST:$REMOTE_DIR/" | grep -v '^\.' || true

echo "==> Rebuild container"
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --build"
for i in $(seq 1 60); do
  ssh "$HOST" "curl -sf http://127.0.0.1:8060/health/ >/dev/null" && break
  sleep 3
done
ssh "$HOST" "curl -sf http://127.0.0.1:8060/health/" >/dev/null || { echo "container not healthy — see: docker logs bacswn-skywatch"; exit 1; }

echo "==> nginx vhost + TLS"
ssh "$HOST" "set -e
  sed 's/__DOMAIN__/$DOMAIN/' $REMOTE_DIR/bacswn.nginx.conf | sudo tee /etc/nginx/sites-available/bacswn >/dev/null
  sudo ln -sf /etc/nginx/sites-available/bacswn /etc/nginx/sites-enabled/bacswn
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect --reinstall"  # reuses the host's existing certbot account

echo "==> Verify"
for i in $(seq 1 30); do
  curl -sf "https://$DOMAIN/health/" >/dev/null && break
  sleep 2
done
curl -sf "https://$DOMAIN/health/" | head -c 200; echo
ssh "$HOST" "curl -s http://127.0.0.1:8060/openapi.json" | python3 -c '
import sys, json
paths = json.load(sys.stdin)["paths"]
for prefix in ("/api/trading/", "/api/mesh/scenario"):
    n = sum(p.startswith(prefix) for p in paths)
    print(f"routes {prefix}*: {n}")
    assert n, f"no {prefix} routes — old build still running?"'
code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://78.47.104.139:8060/health/" || true)
echo "public :8060 -> $code (expect 000 = unreachable)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/auth/register" \
  -H 'content-type: application/json' -d '{}')
echo "anonymous register -> $code (expect 401)"

echo "==> Default passwords"
code=$(ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8060/api/auth/login \
  -H 'content-type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin\"}'")
if [ "$code" = "200" ]; then
  echo "admin/admin still works — rotating"
  ssh "$HOST" "bash $REMOTE_DIR/deploy/rotate-default-passwords.sh"
else
  echo "admin/admin refused (HTTP $code) — already rotated"
fi
echo "Done: https://$DOMAIN"
