#!/usr/bin/env bash
# AssetAdvisor deploy: apply a file bundle to the server source tree, rebuild, recreate the container.
#   bash aa-deploy.sh <bundle-dir> <tag-suffix>
# <bundle-dir>/MANIFEST lines: "<sha256-of-server-file-before|new> <relative path>"; files under <bundle-dir>/files/.
# Refuses to run if any server file differs from the base it was edited from (someone else changed it).
set -euo pipefail
B=$1; NAME=$2
SRC=/opt/ai-elevate/gigforge/projects/cryptoadvisor-dashboard   # folder keeps its name (shared repo)
DATA=/opt/ai-elevate/gigforge/cryptoadvisor-app-data
ENV_OLD=/opt/ai-elevate/credentials/cryptoadvisor.env
ENV_NEW=/opt/ai-elevate/credentials/assetadvisor.env
TS=$(date -u +%Y%m%dT%H%M); TAG=assetadvisor-app:$NAME-$TS; BK=$SRC/.pre-$NAME-$TS

echo "== drift check =="
while read -r sha rel; do
  [ -z "$rel" ] && continue
  if [ "$sha" = new ]; then [ -e "$SRC/$rel" ] && { echo "DRIFT: $rel exists but bundle expects new"; exit 1; }; continue; fi
  now=$(sha256sum "$SRC/$rel" | cut -d' ' -f1)
  [ "$now" = "$sha" ] || { echo "DRIFT: $rel changed on the server since the edit base"; exit 1; }
done < "$B/MANIFEST"
echo "ok"

echo "== apply bundle (backup in $BK) =="
while read -r sha rel; do
  [ -z "$rel" ] && continue
  if [ "$sha" != new ]; then mkdir -p "$BK/$(dirname "$rel")"; cp -p "$SRC/$rel" "$BK/$rel"; fi
  mkdir -p "$SRC/$(dirname "$rel")"; cp "$B/files/$rel" "$SRC/$rel"
done < "$B/MANIFEST"
[ -f "$B/DELETE" ] && while read -r rel; do [ -n "$rel" ] && { mkdir -p "$BK/$(dirname "$rel")"; mv "$SRC/$rel" "$BK/$rel"; }; done < "$B/DELETE"

echo "== env file =="
if [ ! -f "$ENV_NEW" ]; then cp -p "$ENV_OLD" "$ENV_NEW"; echo "created $ENV_NEW from the old one"; fi
python3 -I - "$ENV_NEW" <<'EOF'
import sys
p = sys.argv[1]; lines = open(p).read().splitlines()
if not any(l.startswith("ASSETADVISOR_PUBLIC_URL=") for l in lines):
    lines.append("ASSETADVISOR_PUBLIC_URL=https://assetadvisor.ai-elevate.ai")
    open(p, "w").write("\n".join(lines) + "\n"); print("added ASSETADVISOR_PUBLIC_URL")
EOF

echo "== build $TAG =="
cd "$SRC" && docker build -q -t "$TAG" . 2>&1 | grep -v -i "deprecated\|buildx\|BuildKit\|^ *$" || true
docker image inspect "$TAG" >/dev/null

echo "== recreate container =="
OLD_NAME=$(docker ps --format '{{.Names}}' | grep -x -E 'assetadvisor-app|cryptoadvisor-app' | head -1 || true)
OLD_IMG=$( [ -n "$OLD_NAME" ] && docker inspect -f '{{.Config.Image}}' "$OLD_NAME" || echo none)
# Private network shared with the assetadvisor-db Postgres container
NET_ARGS=""
docker network inspect assetadvisor-net >/dev/null 2>&1 && NET_ARGS="--network assetadvisor-net"
# Optional one-off step with the new image while the old container is stopped (e.g. a data migration)
if [ -f "$B/pre_start.sh" ]; then
  echo "== pre-start step (old container stopped) =="
  [ -n "$OLD_NAME" ] && docker stop "$OLD_NAME" >/dev/null
  if ! TAG="$TAG" DATA="$DATA" ENV_FILE="$ENV_NEW" NET_ARGS="$NET_ARGS" bash "$B/pre_start.sh"; then
    echo "PRE-START FAILED: restarting the old container unchanged"
    [ -n "$OLD_NAME" ] && docker start "$OLD_NAME" >/dev/null
    exit 1
  fi
fi
if [ "$OLD_NAME" = cryptoadvisor-app ]; then
  docker stop cryptoadvisor-app >/dev/null
  docker rm -f cryptoadvisor-app-pre-rename >/dev/null 2>&1 || true
  docker rename cryptoadvisor-app cryptoadvisor-app-pre-rename   # kept (stopped) for rollback
elif [ "$OLD_NAME" = assetadvisor-app ]; then
  docker rm -f assetadvisor-app >/dev/null
fi
# Localhost only: the public way in is https://assetadvisor.ai-elevate.ai (Cloudflare -> nginx)
docker run -d --name assetadvisor-app -p 127.0.0.1:8050:8050 -v "$DATA":/app/data --env-file "$ENV_NEW" $NET_ARGS \
  --restart unless-stopped "$TAG" >/dev/null
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:8050/ && break; sleep 2; done
curl -s -o /dev/null -w "home %{http_code}\n" http://127.0.0.1:8050/
printf 'traversal -> '; curl -s --path-as-is http://127.0.0.1:8050/../../../../proc/self/environ | head -c 15; echo
printf 'title -> '; curl -s http://127.0.0.1:8050/ | grep -o '<title>[^<]*</title>'
echo "image $OLD_IMG -> $TAG"
echo "Rollback: docker rm -f assetadvisor-app && docker run -d --name assetadvisor-app -p 127.0.0.1:8050:8050 -v $DATA:/app/data --env-file $ENV_NEW $NET_ARGS --restart unless-stopped $OLD_IMG   (source backup: $BK)"
