# Job Board

A full-stack job board application with role-based access control (RBAC), PostgreSQL full-text search, and JWT authentication.

## Stack

- **Backend**: Node.js 20, TypeScript (strict), Express 4, PostgreSQL 16 (pg), bcryptjs, jsonwebtoken, zod
- **Frontend**: React 19, TypeScript, Vite, React Router v7
- **Testing**: Jest 29, ts-jest, supertest (36 tests)
- **Infrastructure**: Docker Compose (3 services)

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:4000

### Local Development

**API**
```bash
cd api
npm install
# Set DATABASE_URL and JWT_SECRET in environment or .env
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## User Roles

| Role      | Capabilities                                                   |
|-----------|----------------------------------------------------------------|
| applicant | Browse jobs, apply, track applications                         |
| employer  | Post jobs, view & manage applications on own jobs              |
| admin     | All employer capabilities + manage all users and any job       |

## API Routes

### Auth
```
POST /auth/register   { email, password, name, role?: 'applicant'|'employer' }
POST /auth/login      { email, password }
POST /auth/logout
```

### Jobs
```
GET    /jobs                  Public — supports ?q=, ?location=, ?page=
GET    /jobs/:id              Public
POST   /jobs                  employer, admin
PUT    /jobs/:id              employer (own jobs), admin
DELETE /jobs/:id              employer (own jobs), admin
```

### Applications
```
POST   /jobs/:jobId/apply                    applicant
GET    /applications/mine                    applicant
GET    /jobs/:jobId/applications             employer (own job), admin
PATCH  /jobs/:jobId/applications/:appId      employer (own job), admin
```

### Admin
```
GET    /admin/users
PUT    /admin/users/:id/role   { role: 'applicant'|'employer'|'admin' }
DELETE /admin/jobs/:id
```

## Full-text Search

Jobs use PostgreSQL `tsvector` generated column with GIN index for fast full-text search:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english', title || ' ' || description || ' ' || COALESCE(location, ''))
) STORED
```

Search via `websearch_to_tsquery` supports multi-word queries, quoted phrases, and negative terms.

## Testing

```bash
cd api
npm test              # run all 36 tests
npm run test:coverage # with coverage report
```

Tests mock `pg` pool and `jsonwebtoken` — no database required.

## Environment Variables

### API
| Variable       | Default                                           | Description          |
|----------------|---------------------------------------------------|----------------------|
| DATABASE_URL   | postgresql://postgres:password@localhost:5432/jobboard | PostgreSQL connection |
| JWT_SECRET     | dev-secret                                        | JWT signing secret   |
| JWT_EXPIRES_IN | 7d                                                | Token expiry         |
| PORT           | 4000                                              | API listen port      |

### Frontend
| Variable      | Default               | Description    |
|---------------|-----------------------|----------------|
| VITE_API_URL  | http://localhost:4000 | API base URL   |

## Project Structure

```
job-board/
├── api/                    Backend Express API
│   ├── src/
│   │   ├── config/         Database + env config
│   │   ├── middleware/     authenticate, requireRole, errorHandler, validate
│   │   ├── modules/        auth, jobs, applications, admin
│   │   └── app.ts          Express app factory
│   ├── __tests__/          36 API tests
│   └── migrations/         SQL migrations (auto-applied via Docker)
├── frontend/               React 19 + Vite SPA
│   └── src/
│       ├── api/            Fetch client wrapper
│       ├── contexts/       AuthContext (JWT decode + localStorage)
│       ├── components/     JobCard, SearchBar, ProtectedRoute
│       └── pages/          Login, Register, Jobs, JobDetail, PostJob, MyApplications, Admin
├── Dockerfile.api          Multi-stage Node build
├── Dockerfile.frontend     Multi-stage Vite build → nginx
└── docker-compose.yml      3-service compose (postgres, api, frontend)
```
