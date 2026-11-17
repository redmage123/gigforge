# System description (draft)

## Service
AssetAdvisor is a web application for individual traders and investment firms: portfolio tracking across
stocks, ETFs, futures, forex and crypto; performance (time- and money-weighted), allocation and
rebalancing; client statements; market scanning; an AI assistant; broker connections. Individuals use
personal accounts. Firms are optional team accounts that own portfolios, with role-based access.

## Components (in scope)
| Component | Detail |
|---|---|
| Web app | FastAPI (Python 3.12) + React SPA, one container `assetadvisor-app`, published only on 127.0.0.1:8050 |
| Edge | Cloudflare (TLS, DDoS, Web Analytics page-load beacon) → nginx on the host → app |
| Database | PostgreSQL 16, container `assetadvisor-db` on a private Docker network, no published port |
| Data at rest | Postgres volume; per-user records (JSONB), statements (bytea), audit events, firms, identities, broker connections |
| Secrets | `/opt/ai-elevate/credentials/assetadvisor*.env` (owner-only): DB password, JWT signing key, Fernet encryption key, OAuth/Plaid/SnapTrade keys |
| Backups | Nightly `pg_dump` + restore test, 14-day retention, `/opt/ai-elevate/backups/assetadvisor` (same host: see gaps) |
| AI | Anthropic Claude via the Claude Code CLI inside the container |

## Data handled
- Account data: username, name, password hash (bcrypt), optional email (SSO), sign-in times.
- Financial records: trades, cash movements, portfolios, targets, statements (confidential).
- Broker credentials/tokens: encrypted with Fernet before storage.
- Audit events: actor, action, time, IP, details (append-only, hash-chained).
- No payment card data. No government IDs.

## Third parties (subservice organizations / vendors)
Hetzner (hosting), Cloudflare (edge, web analytics), Anthropic (AI), market data (Binance, Yahoo Finance, CoinGecko),
optional: Google / Microsoft (sign-in), Alpaca, Plaid, SnapTrade (broker data), customers' SAML identity providers.

## Boundaries and current limitation
Production currently shares a host with other company workloads and automation agents. The audit scope
must either include that host's controls or (recommended) move AssetAdvisor to dedicated infrastructure
first: see [hosting-plan.md](hosting-plan.md).
