# Dedicated hosting plan (before the SOC 2 audit)

## Why
Production shares a host with ~25 other databases (two published to the internet), many automation
agents with Docker access, and a shared git checkout. An auditor would have to include all of that in
scope. Moving AssetAdvisor to its own infrastructure makes the scope small and the access story simple.

## Target
| Item | Choice (example) | Approx. cost |
|---|---|---|
| App server | Hetzner CCX13 (2 dedicated vCPU, 8 GB) or CPX31 | EUR 15–30 / month |
| Database | Same server (Postgres container) to start; managed Postgres later | — |
| Encrypted volumes | LUKS on the data volume | — |
| Off-site backups | Hetzner Storage Box or S3-compatible bucket in another region, encrypted (restic/age) | EUR 4–10 / month |
| Edge | Cloudflare (as now); firewall allows HTTP(S) only from Cloudflare IP ranges | — |
| Access | 1–2 named admins, SSH keys + MFA (hardware key), no agents with root/Docker | — |
| Monitoring | External uptime check + log shipping (e.g. Better Stack / Grafana Cloud free tier) | 0–20 / month |
| Staging | Small second server or same server, separate DB | EUR 5–10 / month |

## Steps
1. Provision server(s); harden (unattended upgrades, firewall, fail2ban, SSH keys only, no password login).
2. Install Docker; create `assetadvisor-net`; restore the latest `pg_dump` and test.
3. Copy credentials (env files) through a secure channel; keep keys only there.
4. Deploy the current image; run the test suite in the container against a test database.
5. Lower Cloudflare DNS TTL; switch the A record; watch logs; keep the old host read-only for a week.
6. Enable off-site encrypted backups and a restore drill; set up uptime and log alerts.
7. Move deployment to a protected branch with pull-request review (segregation of duties).
8. Decommission AssetAdvisor data from the shared host (secure delete of volume and backups).
