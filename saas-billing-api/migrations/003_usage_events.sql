-- Migration 003: Usage Events

CREATE TABLE IF NOT EXISTS usage_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_id ON usage_events (org_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_created ON usage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events (event_type);

-- Partitioning hint (optional, for high-volume deployments):
-- Consider partitioning usage_events by created_at (monthly) for large orgs.
