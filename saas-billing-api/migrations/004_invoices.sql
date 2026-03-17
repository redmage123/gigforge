-- Migration 004: Invoices

CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plan_id        TEXT NOT NULL,
  base_amount    INTEGER NOT NULL DEFAULT 0,   -- in cents
  overage_amount INTEGER NOT NULL DEFAULT 0,   -- in cents
  total          INTEGER NOT NULL DEFAULT 0,   -- in cents
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid', 'void', 'uncollectible')),
  stripe_invoice_id TEXT,
  period_start   TIMESTAMPTZ NOT NULL,
  period_end     TIMESTAMPTZ NOT NULL,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON invoices (org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_created ON invoices (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices (stripe_invoice_id);
