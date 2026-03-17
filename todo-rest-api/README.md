# Todo REST API

A production-ready REST API built with TypeScript, Express 4, PostgreSQL, and JWT authentication.

## Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript 5 (strict mode)
- **Framework**: Express 4
- **Database**: PostgreSQL 16 via `pg`
- **Auth**: JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- **Validation**: Zod
- **Testing**: Jest 29 + ts-jest + Supertest (mock-first, no real DB required)

## Project Structure

```
todo-rest-api/
├── src/
│   ├── config/
│   │   ├── database.ts       # pg.Pool singleton via getPool()
│   │   └── env.ts            # typed env variables with defaults
│   ├── middleware/
│   │   ├── authenticate.ts   # JWT verify + token blacklist check
│   │   ├── errorHandler.ts   # 4-arg Express error handler
│   │   └── validate.ts       # Zod schema factory middleware
│   ├── types/
│   │   ├── errors.ts         # AppError, NotFoundError, ConflictError, etc.
│   │   └── express.d.ts      # Express Request augmentation (req.user)
│   ├── modules/
│   │   ├── auth/             # register, login, logout
│   │   └── todos/            # CRUD with ownership guards
│   ├── app.ts                # createApp() — no listen()
│   └── server.ts             # entry point, calls app.listen()
├── __tests__/                # 29 tests, all mock-first
├── migrations/
│   └── 001_initial.sql       # users, todos, token_blacklist tables
├── Dockerfile                # 3-stage: deps, builder, runner (non-root)
├── docker-compose.yml        # app + postgres services
└── .env.example
```

## Quick Start

### Local development

```bash
# 1. Copy and configure env
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start PostgreSQL and apply migrations
docker compose up postgres -d
psql $DATABASE_URL -f migrations/001_initial.sql

# 4. Start dev server
npm run dev
```

### Docker (full stack)

```bash
docker compose up --build
```

The API will be available at `http://localhost:3000`.

## Environment Variables

| Variable       | Default                                              | Description                    |
|----------------|------------------------------------------------------|--------------------------------|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/todo_api` | PostgreSQL connection string |
| `JWT_SECRET`   | `default-dev-secret-change-in-production`            | Secret for signing JWTs        |
| `PORT`         | `3000`                                               | HTTP port                      |
| `JWT_EXPIRES_IN` | `24h`                                              | JWT expiry duration            |
| `BCRYPT_ROUNDS` | `10`                                               | bcrypt salt rounds             |

## API Endpoints

### Auth

#### `POST /auth/register`
Register a new user.

**Body:**
```json
{ "email": "alice@example.com", "password": "password123", "name": "Alice" }
```

**Response 201:**
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "alice@example.com", "name": "Alice", "created_at": "..." }
}
```

Errors: `422` (validation), `409` (email taken)

---

#### `POST /auth/login`
Authenticate and receive a JWT.

**Body:**
```json
{ "email": "alice@example.com", "password": "password123" }
```

**Response 200:**
```json
{ "token": "<jwt>", "user": { "id": 1, "email": "alice@example.com", "name": "Alice" } }
```

Errors: `422` (validation), `401` (invalid credentials)

---

#### `POST /auth/logout`
Revoke the current JWT (adds to blacklist).

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{ "message": "Logged out successfully" }
```

Errors: `401` (no/invalid token)

---

### Todos

All todo endpoints require `Authorization: Bearer <token>`.

#### `GET /todos`
List all todos for the authenticated user.

**Response 200:** Array of todo objects.

---

#### `POST /todos`
Create a new todo.

**Body:**
```json
{ "title": "Buy groceries" }
```

**Response 201:**
```json
{ "id": 1, "user_id": 1, "title": "Buy groceries", "completed": false, "created_at": "...", "updated_at": "..." }
```

Errors: `422` (missing title, title > 255 chars)

---

#### `GET /todos/:id`
Get a specific todo. Returns `404` if not found **or** belongs to another user (no 403 leakage).

**Response 200:** Todo object.

---

#### `PUT /todos/:id`
Update a todo's `title` and/or `completed` status.

**Body:**
```json
{ "title": "Buy organic groceries", "completed": true }
```

**Response 200:** Updated todo object.

Errors: `422` (invalid body), `404` (not found / wrong owner)

---

#### `DELETE /todos/:id`
Delete a todo.

**Response 204:** No body.

Errors: `404` (not found / wrong owner)

---

## Error Response Format

All errors follow this shape:

```json
{
  "error": {
    "message": "Human-readable message",
    "status": 422,
    "errors": [ { "field": "title", "message": "Required" } ]
  }
}
```

The `errors` array is only present for `422` validation errors.

## Testing

Tests are mock-first — they do not require a running database or JWT secret.

```bash
# Run all 29 tests
npm test

# Run with coverage report
npm run test:coverage

# Run a specific test file
npx jest __tests__/auth.test.ts
```

### Test coverage

| File                           | Tests |
|--------------------------------|-------|
| `__tests__/auth.test.ts`       | 11    |
| `__tests__/todos.test.ts`      | 14    |
| `__tests__/middleware.test.ts` | 4     |
| **Total**                      | **29** |

## Build

```bash
npm run build       # compiles TypeScript to dist/
npm start           # runs dist/server.js
```

## Docker

```bash
# Build image
docker build -t todo-rest-api .

# Run with docker compose (includes postgres)
docker compose up --build

# Stop and remove volumes
docker compose down -v
```

The Dockerfile uses a 3-stage build (deps → builder → runner) with a non-root `appuser` in the final image.

## Database Schema

See `migrations/001_initial.sql` for the full schema. Key tables:

- **`users`** — `id, email (unique), password_hash, name, created_at, updated_at`
- **`todos`** — `id, user_id (FK → users), title, completed, created_at, updated_at`
- **`token_blacklist`** — `id, token (unique), created_at`
