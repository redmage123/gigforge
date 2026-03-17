# AI Chat Widget

A RAG (Retrieval-Augmented Generation) chat system with an embeddable vanilla JS widget. Upload documents, then chat with them using semantic search + LLM.

## Stack

- **Runtime**: Node.js 20, TypeScript strict
- **Framework**: Express 4
- **Database**: PostgreSQL 16 + pgvector (cosine similarity search)
- **AI**: OpenAI text-embedding-ada-002 + gpt-4o-mini (mock client when no API key)
- **Auth**: JWT (jsonwebtoken) + bcrypt
- **Validation**: Zod
- **Testing**: Jest 29 + ts-jest + supertest (37 tests, mock-first)

## Quick Start

### With Docker (recommended)

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and OPENAI_API_KEY

docker compose up -d
```

App runs at http://localhost:3000. Widget available at http://localhost:3000/widget.js.

### Without Docker

```bash
npm install

# Start PostgreSQL 16 with pgvector, then:
cp .env.example .env  # fill in DB credentials
npm run dev
```

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | — | Register user |
| POST | /auth/login | — | Login, receive JWT |
| POST | /auth/logout | JWT | Logout (client-side) |
| POST | /documents | JWT | Upload + chunk + embed document |
| GET | /documents | JWT | List your documents |
| GET | /documents/:id | JWT | Get single document |
| DELETE | /documents/:id | JWT | Delete document |
| POST | /chat | JWT | RAG chat query |
| GET | /widget.js | — | Embeddable widget bundle |

## Embedding the Widget

```html
<script
  src="https://your-api.example.com/widget.js"
  data-api-url="https://your-api.example.com"
></script>
```

The widget renders a floating chat button (bottom-right). Users authenticate via the panel and can then chat with their uploaded documents.

## Running Tests

```bash
npm test              # all 37 tests (no DB or OpenAI key required)
npm run test:coverage # with coverage report
```

## Project Structure

```
src/
  config/         # DB pool singleton, OpenAI mock-first client, env parsing
  middleware/     # JWT authenticate, Zod validate, error handler
  lib/            # Pure functions: chunkText, cosineSimilarity, getEmbedding
  modules/
    auth/         # register / login / logout
    documents/    # ingest (chunk + embed + store) / list / get / delete
    chat/         # embed query + pgvector similarity search + LLM call
    widget/       # serves widget/chat-widget.js
widget/
  chat-widget.ts  # TypeScript source (vanilla IIFE)
  chat-widget.js  # Pre-built output served by /widget.js
migrations/
  001_auth.sql
  002_documents_pgvector.sql
__tests__/        # 37 tests across 6 test files
```

## Environment Variables

See `.env.example` for all options. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | _(empty)_ | Leave blank to use deterministic mock client |
| `JWT_SECRET` | _(dev default)_ | **Must change in production** |
| `DATABASE_URL` | _(from DB_* vars)_ | PostgreSQL connection string |
