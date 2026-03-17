# saas-billing-api

A production-ready SaaS billing microservice built with Node.js 20, TypeScript strict mode, Express 4, PostgreSQL, and Stripe.

## Features

- JWT authentication (register / login / logout)
- Multi-tenant organizations with role-based membership
- Plan management (Free / Pro / Enterprise) with overage billing
- Usage tracking per billing period
- Invoice generation with automatic overage calculation
- Stripe webhook handling with HMAC signature verification
- Full test suite (46 tests, mock-first — no real DB or Stripe needed)

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Language | TypeScript 5 (strict) |
| Framework | Express 4 |
| Database | PostgreSQL 16 via `pg` |
| Auth | `jsonwebtoken` + `bcryptjs` |
| Validation | `zod` |
| Payments | `stripe` v14 |
| Testing | Jest 29 + ts-jest + supertest |

## Quick Start

### Local development

```bash
cp .env.example .env
# Edit .env with your values

npm install
npm run dev
```

### Docker Compose (with Postgres)

```bash
docker compose up --build
```

Migrations in `migrations/` are automatically run by Postgres on first start via `docker-entrypoint-initdb.d`.

### Run tests

```bash
npm test
# or with coverage
npm run test:coverage
```

## API Reference

### Auth

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/auth/register` | `{ email, password, name }` | None |
| POST | `/auth/login` | `{ email, password }` | None |
| POST | `/auth/logout` | — | Bearer JWT |

### Organizations

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/orgs` | `{ name }` | Bearer JWT |
| GET | `/orgs/:orgId` | — | Bearer JWT (member) |
| POST | `/orgs/:orgId/members` | `{ email }` | Bearer JWT (member) |
| DELETE | `/orgs/:orgId/members/:userId` | — | Bearer JWT (member) |

### Plans

| Method | Path | Body | Auth |
|--------|------|------|------|
| GET | `/plans` | — | None |
| GET | `/orgs/:orgId/plan` | — | Bearer JWT |
| POST | `/orgs/:orgId/plan` | `{ planId }` | Bearer JWT |

### Usage

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/orgs/:orgId/usage` | `{ eventType, count? }` | Bearer JWT (member) |
| GET | `/orgs/:orgId/usage` | — | Bearer JWT (member) |

### Invoices

| Method | Path | Body | Auth |
|--------|------|------|------|
| GET | `/orgs/:orgId/invoices` | — | Bearer JWT (member) |
| GET | `/orgs/:orgId/invoices/:invoiceId` | — | Bearer JWT (member) |
| POST | `/orgs/:orgId/invoices/generate` | — | Bearer JWT (member) |

### Webhooks

| Method | Path | Notes |
|--------|------|-------|
| POST | `/webhooks/stripe` | Raw body, `stripe-signature` header required |

## Plan Limits

| Plan | Price | Monthly Requests | Seats | Overage |
|------|-------|-----------------|-------|---------|
| Free | $0 | 1,000 | 1 | None |
| Pro | $49 | 50,000 | 5 | $0.001 / request |
| Enterprise | $299 | Unlimited | 50 | None |

## Overage Calculation

```
baseAmount    = plan.priceUsd * 100  (cents)
overageAmount = Math.ceil(overRequests * plan.overageRateCents)
total         = baseAmount + overageAmount
```

## Environment Variables

See `.env.example` for all required and optional variables.

## Database Migrations

Run in order:

```bash
psql $DATABASE_URL -f migrations/001_users_orgs.sql
psql $DATABASE_URL -f migrations/002_plans_subscriptions.sql
psql $DATABASE_URL -f migrations/003_usage_events.sql
psql $DATABASE_URL -f migrations/004_invoices.sql
```

## Project Structure

```
src/
  config/       # DB pool, Stripe client, env
  middleware/   # authenticate, errorHandler, validate
  types/        # AppError class hierarchy
  modules/
    auth/       # register, login, logout
    organizations/  # CRUD + membership
    plans/      # plan listing + org plan management
    usage/      # event recording + summary
    invoices/   # generation + listing
    webhooks/   # Stripe event dispatch
__tests__/      # 46 tests across 7 suites
migrations/     # PostgreSQL DDL (run in order)
```
