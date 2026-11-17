# AssetAdvisor Operations Runbook

For the people who run AssetAdvisor in production. In the app this document is shown to platform administrators only. It contains no secrets: credentials live only in the files named here.

## 1. System at a glance

| Item | Value |
|---|---|
| Public URL | https://assetadvisor.ai-elevate.ai |
| Host | Hetzner server 78.47.104.139, user `aielevate`, SSH key login |
| Request path | Cloudflare (TLS) → nginx on the host (`/etc/nginx/sites-enabled/ai-elevate`) → app on 127.0.0.1:8050 |
| App container | `assetadvisor-app` (FastAPI + React), image `assetadvisor-app:<name>-<timestamp>` |
| Database container | `assetadvisor-db` (postgres:16-alpine), no published port |
| Docker network | `assetadvisor-net` (subnet 10.207.40.0/28) |
| Source tree on host | `/opt/ai-elevate/gigforge/projects/cryptoadvisor-dashboard` (git repo `gigforge`, branch `master`) |
| App data volume | `/opt/ai-elevate/gigforge/cryptoadvisor-app-data` → `/app/data` (instrument cache and a few legacy files) |
| Database files | `/opt/ai-elevate/gigforge/assetadvisor-pgdata` |
| App environment | `/opt/ai-elevate/credentials/assetadvisor.env` |
| Database credentials | `/opt/ai-elevate/credentials/assetadvisor-db.env` |
| Backups | `/opt/ai-elevate/backups/assetadvisor/` (nightly, 02:15 UTC) |

All user records (users, portfolios, trades, cash, statements, settings) are in Postgres. The relational tables (firms, members, invitations, sign-in identities, SAML settings, audit events, broker connections) are created by numbered migrations in `services/db.py`, which run automatically at startup.

### Environment variables (`assetadvisor.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection. If unset the app falls back to files in `/app/data` (development only) |
| `JWT_SECRET` | Signs session tokens. Changing it signs everyone out |
| `ASSETADVISOR_ENCRYPTION_KEY` | Fernet key that encrypts stored broker credentials and API keys. **Losing it makes those unreadable** |
| `ASSETADVISOR_PUBLIC_URL` | Public base URL, used for SSO redirects and links |
| `CLAUDE_CODE_OAUTH_TOKEN` | Authenticates the AI features (`claude -p` inside the container) |
| `GOOGLE_OIDC_CLIENT_ID`, `GOOGLE_OIDC_CLIENT_SECRET` | Google sign-in (button hidden when unset) |
| `MICROSOFT_OIDC_CLIENT_ID`, `MICROSOFT_OIDC_CLIENT_SECRET` | Microsoft sign-in (button hidden when unset) |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Plaid broker connections ("Coming soon" when unset) |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | SnapTrade broker connections ("Coming soon" when unset) |

Any change to the env file needs the container recreated (section 4); `docker restart` does not reload it.

## 2. Daily checks

Run on the host:

```
docker ps --filter name=assetadvisor --format '{{.Names}} {{.Status}} {{.Image}}'
curl -s -o /dev/null -w '%{http_code}\n' https://assetadvisor.ai-elevate.ai/
tail -3 /opt/ai-elevate/backups/assetadvisor/backup.log
docker logs --since 24h assetadvisor-app 2>&1 | grep -iE 'error|traceback|\[audit\]' | tail -20
```

Expected: both containers `Up`, HTTP `200`, the last backup line ends `restore-test=passed`, and the audit line reports `ok=True, write failures=0`.

### Scheduled jobs inside the app

| Job | Interval | What it does |
|---|---|---|
| alert_checker | 1 min | Price alerts |
| in_play_scanner | 15 min | In-Play scan and news catalysts |
| news_scanner | 15 min | News ingestion |
| sentiment_alerts | 5 min | Sentiment alerts |
| portfolio_snapshots | 1 h | Value snapshots |
| dca_executor | 1 h | DCA plans |
| allocation_drift | 6 h | Drift notifications (at most daily per portfolio) |
| monthly_statements | 6 h | Generates last month's statements once (idempotent) |
| broker_sync | 6 h | Syncs all broker connections |
| instrument_registry | 6 h | Refreshes the instrument list (skips if under 1 day old) |
| audit_integrity | 24 h | Verifies the audit hash chain; notifies platform admins on failure |

## 3. Health checks and logs

- App logs: `docker logs --tail 200 -f assetadvisor-app`
- Database logs: `docker logs --tail 100 assetadvisor-db`
- nginx: `/var/log/nginx/error.log`
- Database shell: `docker exec -it assetadvisor-db psql -U assetadvisor -d assetadvisor`
- Database size and row counts:

```
docker exec assetadvisor-db psql -U assetadvisor -d assetadvisor -c \
  "select (select count(*) from documents) docs, (select count(*) from blobs) blobs, (select count(*) from audit_events) audit, pg_size_pretty(pg_database_size('assetadvisor')) size"
```

## 4. Deploying a change

Deployments use two scripts in `scripts/ops/`. `make-bundle.sh` runs on the operator's machine and packs the files changed since the deployed version, each with a checksum of the server's copy it was edited from. `aa-deploy.sh` runs on the host and applies the bundle:

1. **Drift check**: refuses if any file on the server changed since the version the bundle was edited from (another person or agent touched it).
2. Copies the files into the source tree, backing up the replaced ones to `<source>/.pre-<name>-<timestamp>/`.
3. Builds a new image `assetadvisor-app:<name>-<timestamp>`.
4. Optionally runs `<bundle>/pre_start.sh` with the old container stopped (for data migrations).
5. Recreates the container on `assetadvisor-net`, bound to 127.0.0.1:8050 only.
6. Smoke-tests the home page, the path-traversal guard and the page title, and **prints the rollback command**.

```
bash aa-deploy.sh <bundle-dir> <short-name>
```

Before deploying:

- Run the test suite locally (`pytest`), and the frontend build (`npm run build` in `frontend/`).
- After deploying, run the tests inside the production image (section 5).
- Commit the deployed files to `master` and push, then confirm the live tree matches `origin/master`.

Recreating the container with the current image (for example after an env change):

```
IMG=$(docker inspect -f '{{.Config.Image}}' assetadvisor-app)
docker rm -f assetadvisor-app
docker run -d --name assetadvisor-app -p 127.0.0.1:8050:8050 \
  -v /opt/ai-elevate/gigforge/cryptoadvisor-app-data:/app/data \
  --env-file /opt/ai-elevate/credentials/assetadvisor.env \
  --network assetadvisor-net --restart unless-stopped "$IMG"
```

## 5. Running tests in production

The suite runs inside the live container against a separate database `assetadvisor_test` (each test gets a fresh schema; the app database is never touched):

```
docker cp scripts/ops/aa-ctest.sh assetadvisor-app:/tmp/aa-ctest.sh
docker exec assetadvisor-app sh /tmp/aa-ctest.sh
```

`aa-ctest.sh` sets `TEST_DATABASE_URL` to the `assetadvisor_test` database and refuses to run if it equals the app's `DATABASE_URL`. Expected: all tests pass (about 256).

## 6. Rollback

Every deploy prints its rollback command. In general:

```
docker images assetadvisor-app --format '{{.Tag}} {{.CreatedAt}}' | head    # find the previous image
docker rm -f assetadvisor-app
docker run -d --name assetadvisor-app -p 127.0.0.1:8050:8050 \
  -v /opt/ai-elevate/gigforge/cryptoadvisor-app-data:/app/data \
  --env-file /opt/ai-elevate/credentials/assetadvisor.env \
  --network assetadvisor-net --restart unless-stopped assetadvisor-app:<previous-tag>
```

Restore the source files from `<source>/.pre-<name>-<timestamp>/` as well, so the next deploy's drift check matches.

Database migrations only add tables and columns, so an older image runs against a newer schema. Never roll the schema back by hand; restore from backup if data is wrong (section 7).

## 7. Backups and restore

`/opt/ai-elevate/backups/assetadvisor/backup.sh` (a copy is in `scripts/ops/backup.sh`) runs from the `aielevate` crontab at 02:15 UTC:

1. `pg_dump` of the database to `db-<timestamp>.dump`.
2. A tarball of `/app/data` (without key files) to `files-<timestamp>.tar.gz`.
3. **Restore test**: loads the dump into a throwaway Postgres and compares row counts with live.
4. Deletes backups older than 14 days. Logs to `backup.log`; sends an alert on failure.

Encryption keys are deliberately not in the backups. Keep a copy of `assetadvisor.env` and `assetadvisor-db.env` in a separate secure place; without `ASSETADVISOR_ENCRYPTION_KEY` restored broker credentials cannot be decrypted (users would have to reconnect).

**Known gap:** backups are on the same host. Copy them off-site until automated off-site storage is set up.

### Restoring the database

1. Stop the app: `docker stop assetadvisor-app`
2. Take a safety dump of the current state: `docker exec assetadvisor-db pg_dump -U assetadvisor -d assetadvisor -Fc > /opt/ai-elevate/backups/assetadvisor/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump`
3. Restore:

```
docker exec -i assetadvisor-db pg_restore -U assetadvisor -d assetadvisor --clean --if-exists --no-owner \
  < /opt/ai-elevate/backups/assetadvisor/db-<timestamp>.dump
```

4. Start the app: `docker start assetadvisor-app`, then check sign-in and a portfolio page.
5. Check the audit chain (section 9). A restore to an earlier point is consistent, but record the restore as an incident.

### Exporting all records to files

`python scripts/migrate_to_postgres.py export --out <dir>` (inside the container) writes every stored record back to the file layout. `verify` compares a file tree with the database.

## 8. Common support tasks

### Reset a user's password

There is no self-service reset. Confirm the person's identity first, then:

```
docker exec -i assetadvisor-app python - <<'PY'
import secrets
from services import auth, store
USER = "the-username"
tmp = secrets.token_urlsafe(12)
def fn(users):
    for u in users:
        if u["username"] == USER:
            u["password_hash"] = auth.hash_password(tmp)
    return users
store.update(store.SHARED, "users", fn, default=[])
print("temporary password:", tmp)
PY
```

Users are stored in the shared `users` document (`services/auth.py` `load_users` / `save_users`). Send the temporary password through a different channel than the request came in on, and ask the user to change it at once.

### Unlock a user

Lockouts are held in the app's memory and clear by themselves after 5 minutes. Restarting the app (`docker restart assetadvisor-app`) clears all of them at once.

### Make someone a platform administrator

Set `"role": "admin"` on their user record (same pattern as the password reset). Platform admins receive security notifications (audit chain problems) and can read this runbook in the app. Keep this to named operators.

### Remove a user's access urgently

- Firm member: a firm admin suspends them on the firm page (immediate).
- Any account: reset their password as above. Note that a session already issued stays valid until it expires (default 24 hours, or the firm's session length): there is no per-session revocation yet. To cut off every session immediately, rotate `JWT_SECRET` (signs out everyone).

### Delete an account on request

The user can do it from Settings. As an operator: `docker exec assetadvisor-app python -c "import asyncio; from services import account; print(asyncio.run(account.delete_account('<username>')))"`. Audit events are kept with the actor anonymized.

## 9. Audit trail

The `audit_events` table is append-only: a database trigger blocks UPDATE, DELETE and TRUNCATE, and each row carries a SHA-256 hash chained to the previous one.

Verify the chain on demand:

```
docker exec assetadvisor-app python -c "from services import audit_events; print(audit_events.verify_chain())"
```

`ok: True` means intact. If `ok` is False, `first_problem` names the first bad event. Treat that as a security incident (section 10): do not try to "fix" the rows.

## 10. Incident playbooks

### Site down (502 or timeout)

1. `docker ps -a --filter name=assetadvisor`: if the app is not running, `docker logs --tail 100 assetadvisor-app` for the cause, then `docker start assetadvisor-app`.
2. If the app is crash-looping after a deploy, roll back (section 6).
3. If the app is up but the site is not: `curl -I http://127.0.0.1:8050/` on the host, then `sudo nginx -t` and the nginx error log, then Cloudflare status.

### Database unavailable

Symptoms: errors mentioning the database; firm pages report that the database isn't available.

1. `docker ps -a --filter name=assetadvisor-db` and `docker logs --tail 100 assetadvisor-db`.
2. `docker start assetadvisor-db`; check disk space with `df -h /opt`.
3. Once healthy, restart the app: `docker restart assetadvisor-app`.

### AI features fail

Usually an expired `CLAUDE_CODE_OAUTH_TOKEN`. Create a new token with `claude setup-token` on an operator machine, replace it in `assetadvisor.env`, and recreate the container (section 4). Test with the chat assistant.

### Broker syncs failing for everyone

Check the app log for `broker` errors. For Alpaca, check https://status.alpaca.markets. For Plaid or SnapTrade, check that their keys in the env file are still valid. Individual failures are usually revoked user keys; the user reconnects.

### Suspected compromise

1. **Contain**: suspend affected accounts; block offending IPs at Cloudflare; if a secret may have leaked, rotate it (below).
2. **Assess**: query `audit_events` for the actors and time range; check nginx and app logs.
3. **Notify** affected customers without undue delay, and regulators where required (GDPR: 72 hours).
4. **Recover**: restore data from backup if it was altered.
5. **Review**: write up the incident, timeline and actions in the incident log.

### Rotating secrets

| Secret | How | Effect |
|---|---|---|
| `JWT_SECRET` | New random 64-character value in the env file; recreate the container | Everyone is signed out |
| `ASSETADVISOR_ENCRYPTION_KEY` | Needs a re-encryption step: decrypt all stored credentials with the old key and encrypt with the new one before switching. Do not simply replace it | Without re-encryption, all broker connections and stored API keys stop working |
| Database password | `ALTER USER assetadvisor PASSWORD '…'` in psql, update both env files, recreate the app | Brief downtime |
| `CLAUDE_CODE_OAUTH_TOKEN` | See "AI features fail" | None |
| OIDC, Plaid, SnapTrade keys | Rotate at the provider, update the env file, recreate the app | None |

## 11. Switching on optional integrations

### Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
2. Authorized redirect URI: `https://assetadvisor.ai-elevate.ai/api/sso/oidc/google/callback`
3. Put the ID and secret in `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET`; recreate the app.

### Microsoft sign-in

1. Microsoft Entra admin center → App registrations → New registration (multi-tenant if any organization's users should sign in).
2. Redirect URI (Web): `https://assetadvisor.ai-elevate.ai/api/sso/oidc/microsoft/callback`
3. Create a client secret. Set `MICROSOFT_OIDC_CLIENT_ID` / `MICROSOFT_OIDC_CLIENT_SECRET`; recreate the app.

### Plaid and SnapTrade

Set the variables in section 1 and recreate the app. The "Coming soon" note on Broker Connections is replaced by the connect buttons. Start Plaid with `PLAID_ENV=sandbox` and test before switching to `production`.

### SAML for a firm

Firm admins do this themselves on their firm page. Support: the service provider metadata URL is `https://assetadvisor.ai-elevate.ai/api/sso/saml/<firm-slug>/metadata`.

## 12. Known gaps

Tracked in `docs/soc2/controls.md`:

- Multi-factor authentication for sign-in (deferred).
- Dedicated host, disk encryption, off-site encrypted backups (`docs/soc2/hosting-plan.md`).
- Centralized log retention and uptime monitoring.
- Pull-request review before deploys; staging environment.
- `@walletconnect` dependency advisories (needs a major upgrade of the wallet feature).
- Market data from free sources (Yahoo Finance is unofficial and delayed); licensed data needed before commercial launch.
