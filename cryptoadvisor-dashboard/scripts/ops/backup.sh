#!/usr/bin/env bash
# Nightly AssetAdvisor backup: Postgres dump + app key files, 14-day retention, restore test.
# Cron: 15 2 * * *  (user aielevate). Log: /opt/ai-elevate/backups/assetadvisor/backup.log
set -euo pipefail
B=/opt/ai-elevate/backups/assetadvisor; DATA=/opt/ai-elevate/gigforge/cryptoadvisor-app-data
TS=$(date -u +%Y%m%dT%H%M%SZ); KEEP_DAYS=14
umask 077; mkdir -p "$B"
log() { echo "$(date -u +%FT%TZ) $*" >> "$B/backup.log"; }
alert() { [ -x /home/aielevate/send-alert.py ] && python3 /home/aielevate/send-alert.py "AssetAdvisor backup: $1" >/dev/null 2>&1 || true; }
trap 'log "FAILED (line $LINENO)"; alert "FAILED at line $LINENO"' ERR

docker exec assetadvisor-db pg_dump -U assetadvisor -d assetadvisor -Fc > "$B/db-$TS.dump"
# Files outside the database. Keys are NOT included: they live in /opt/ai-elevate/credentials, kept apart from backups
tar -C "$DATA" -czf "$B/files-$TS.tar.gz" --exclude='./instruments' --exclude='*.db' --exclude='*.key' . 2>/dev/null || \
  docker exec assetadvisor-app tar -C /app/data -czf - --exclude=./instruments --exclude='*.db' --exclude='*.key' . > "$B/files-$TS.tar.gz"
chmod 600 "$B"/db-$TS.dump "$B"/files-$TS.tar.gz

# Restore test: load the dump into a throwaway Postgres and compare row counts with live
T=aa-restore-test-$$
docker run -d --rm --name $T -e POSTGRES_PASSWORD=restoretest -e POSTGRES_DB=r --network none postgres:16-alpine >/dev/null
trap 'docker rm -f '$T' >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 40); do docker exec $T pg_isready -U postgres -d r >/dev/null 2>&1 && break; sleep 2; done
sleep 2
docker exec -i $T pg_restore -U postgres -d r --no-owner < "$B/db-$TS.dump"
LIVE=$(docker exec assetadvisor-db psql -U assetadvisor -d assetadvisor -tAc "select (select count(*) from documents) || '/' || (select count(*) from blobs)")
REST=$(docker exec $T psql -U postgres -d r -tAc "select (select count(*) from documents) || '/' || (select count(*) from blobs)")
[ "$LIVE" = "$REST" ] || { log "RESTORE TEST MISMATCH live=$LIVE restored=$REST"; alert "restore test mismatch"; exit 1; }

find "$B" -maxdepth 1 \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +$KEEP_DAYS -delete
log "ok db-$TS.dump ($(du -h "$B/db-$TS.dump" | cut -f1)) documents/blobs=$LIVE restore-test=passed"
