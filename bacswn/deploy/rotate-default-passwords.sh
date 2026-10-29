#!/usr/bin/env bash
# Run ON THE PROD HOST as aielevate. Backs up the BACSWN DB, then replaces the
# admin and meteorologist passwords with random ones. New passwords are written
# to ~/bacswn-credentials.txt (mode 600) — never printed to the terminal.
# No restart needed: logins check the DB on every request.
set -euo pipefail

CONTAINER=bacswn-skywatch
TS=$(date +%Y%m%d-%H%M%S)

docker exec "$CONTAINER" python -c "
import sqlite3
src = sqlite3.connect('/app/data/bacswn.db')
dst = sqlite3.connect('/app/data/bacswn.db.bak-$TS')
src.backup(dst); dst.close()
"
echo "DB backed up to /app/data/bacswn.db.bak-$TS (volume bacswn_bacswn-data)"

umask 077
docker exec "$CONTAINER" python -c "
import sqlite3, bcrypt, secrets
c = sqlite3.connect('/app/data/bacswn.db')
for user in ('admin', 'meteorologist'):
    pw = secrets.token_urlsafe(18)
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    if c.execute('UPDATE users SET password_hash=? WHERE username=?', (h, user)).rowcount == 1:
        print(f'{user}: {pw}')
c.commit()
" > ~/bacswn-credentials.txt
chmod 600 ~/bacswn-credentials.txt
echo "Rotated $(wc -l < ~/bacswn-credentials.txt) account(s); new passwords in ~/bacswn-credentials.txt"

for pair in admin:admin meteorologist:weather; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8060/api/auth/login \
    -H 'content-type: application/json' \
    -d "{\"username\":\"${pair%%:*}\",\"password\":\"${pair#*:}\"}")
  echo "default login ${pair%%:*}: HTTP $code (expect 401)"
done
