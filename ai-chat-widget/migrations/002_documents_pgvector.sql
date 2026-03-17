-- Migration 002: Documents and vector chunks
-- Requires: pgvector extension (ships with pgvector/pgvector:pg16 image)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  content    TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS document_chunks (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER      NOT NULL,
  content     TEXT         NOT NULL,
  -- text-embedding-ada-002 produces 1536-dimensional vectors
  embedding   vector(1536) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks (document_id);

-- IVFFlat index for approximate nearest-neighbour cosine search.
-- Requires at least ~100 rows to be useful; NOOP on empty table.
-- Rebuild with CREATE INDEX CONCURRENTLY after ingesting initial data.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
