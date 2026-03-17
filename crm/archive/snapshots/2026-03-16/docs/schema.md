# CRM Platform — Database Schema

**Platform:** GigForge + TechUni CRM
**Database:** PostgreSQL 16
**ORM:** SQLAlchemy 2.x async
**Tenancy Model:** Row-level isolation via `org_id` on every tenant-scoped table
**Date:** 2026-03-15

---

## Table of Contents

1. [Extensions](#extensions)
2. [Schema Definitions](#schema-definitions)
   - [organizations](#organizations)
   - [users](#users)
   - [companies](#companies)
   - [contacts](#contacts)
   - [pipeline_stages](#pipeline_stages)
   - [deals](#deals)
   - [deal_stage_history](#deal_stage_history)
   - [activities](#activities)
   - [tasks](#tasks)
   - [tags](#tags)
   - [contact_tags](#contact_tags)
   - [deal_tags](#deal_tags)
   - [custom_field_definitions](#custom_field_definitions)
   - [custom_field_values](#custom_field_values)
   - [webhooks](#webhooks)
   - [webhook_events](#webhook_events)
   - [audit_log](#audit_log)
3. [Entity Relationship Summary](#entity-relationship-summary)
4. [Multi-Tenancy Pattern](#multi-tenancy-pattern)
5. [Indexing Rationale](#indexing-rationale)
6. [Migration Strategy (Alembic)](#migration-strategy-alembic)

---

## Extensions

```sql
-- Required PostgreSQL extensions — created in the first Alembic migration
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram indexes for full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- GIN index support for composite searches
```

### Shared Trigger Function

Used by every table that carries an `updated_at` column.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Schema Definitions

### organizations

Root tenant record. Every other tenant-scoped table references this via `org_id`. There is no multi-tenancy at the database level; isolation is enforced by the application layer (see [Multi-Tenancy Pattern](#multi-tenancy-pattern)).

```sql
CREATE TABLE organizations (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    plan        VARCHAR(50)  NOT NULL DEFAULT 'standard',
    settings    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT organizations_slug_unique
        UNIQUE (slug),

    CONSTRAINT organizations_plan_check
        CHECK (plan IN ('standard', 'professional', 'enterprise'))
);

CREATE INDEX idx_organizations_slug ON organizations (slug);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**`settings` JSONB schema (example):**
```json
{
  "currency":           "USD",
  "date_format":        "YYYY-MM-DD",
  "timezone":           "America/New_York",
  "webhook_signing":    true,
  "max_users":          50
}
```

**Seed data:**
```sql
INSERT INTO organizations (name, slug, plan) VALUES
    ('GigForge', 'gigforge', 'professional'),
    ('TechUni',  'techuni',  'standard');
```

---

### users

Both human users and AI agent users share this table. Agent users set `is_agent = true` and may have `password_hash = NULL` — they authenticate via system-issued JWTs rather than password-based login.

```sql
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),             -- nullable; agents authenticate via JWT
    role            VARCHAR(50)  NOT NULL DEFAULT 'agent',
    is_agent        BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT users_org_email_unique
        UNIQUE (org_id, email),

    CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'manager', 'agent', 'viewer'))
);

CREATE INDEX idx_users_org_email  ON users (org_id, email);
CREATE INDEX idx_users_org_role   ON users (org_id, role);
CREATE INDEX idx_users_org_active ON users (org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_users_agents     ON users (org_id, is_agent) WHERE is_agent = true;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Role definitions:**

| Role | Permissions |
|------|------------|
| `admin` | Full org access — manage users, settings, all records |
| `manager` | All records in org; cannot manage users or settings |
| `agent` | Own records plus assigned records; cannot see other agents' private data |
| `viewer` | Read-only across all org records |

**AI agent users (example seeds):**
```sql
-- AI agents are created as users with is_agent = true
INSERT INTO users (org_id, email, name, role, is_agent) VALUES
    (:gigforge_org_id, 'gigforge-sales@agents.internal',   'GigForge Sales Agent',   'agent', true),
    (:gigforge_org_id, 'gigforge-pm@agents.internal',      'GigForge PM Agent',      'manager', true),
    (:gigforge_org_id, 'gigforge-scout@agents.internal',   'GigForge Scout Agent',   'agent', true);
```

---

### companies

Companies that contacts belong to. A contact can belong to one company; a company can have many contacts and deals.

```sql
CREATE TABLE companies (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    domain      VARCHAR(255),
    industry    VARCHAR(100),
    size        VARCHAR(50),
    website     VARCHAR(500),
    phone       VARCHAR(50),
    address     JSONB        NOT NULL DEFAULT '{}',
    notes       TEXT,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT companies_size_check
        CHECK (size IS NULL OR size IN ('1-10', '11-50', '51-200', '201-1000', '1000+'))
);

CREATE INDEX idx_companies_org        ON companies (org_id);
CREATE INDEX idx_companies_org_domain ON companies (org_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_companies_org_name   ON companies (org_id, name);

-- Trigram full-text search on company name
CREATE INDEX idx_companies_name_trgm ON companies USING GIN (name gin_trgm_ops);

CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**`address` JSONB schema:**
```json
{
  "street":  "123 Market Street",
  "city":    "San Francisco",
  "state":   "CA",
  "zip":     "94105",
  "country": "US"
}
```

---

### contacts

Individual people tracked in the CRM. Every contact belongs to an org and optionally to a company.

```sql
CREATE TABLE contacts (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id        UUID         REFERENCES users(id) ON DELETE SET NULL,
    first_name      VARCHAR(255),
    last_name       VARCHAR(255),
    email           VARCHAR(255),
    phone           VARCHAR(50),
    company_id      UUID         REFERENCES companies(id) ON DELETE SET NULL,
    contact_type    VARCHAR(50)  NOT NULL DEFAULT 'lead',
    status          VARCHAR(50)  NOT NULL DEFAULT 'active',
    source          VARCHAR(100),
    notes           TEXT,
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT contacts_type_check
        CHECK (contact_type IN ('lead', 'customer', 'partner', 'prospect')),

    CONSTRAINT contacts_status_check
        CHECK (status IN ('active', 'inactive', 'archived')),

    -- PostgreSQL UNIQUE treats two NULLs as distinct, so this constraint
    -- correctly allows multiple contacts with no email but prevents duplicate emails.
    CONSTRAINT contacts_org_email_unique
        UNIQUE (org_id, email)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_contacts_org_owner   ON contacts (org_id, owner_id);
CREATE INDEX idx_contacts_org_company ON contacts (org_id, company_id);
CREATE INDEX idx_contacts_org_type    ON contacts (org_id, contact_type);
CREATE INDEX idx_contacts_org_status  ON contacts (org_id, status);

-- Full-text trigram search: concatenates first_name + last_name + email into one searchable string
CREATE INDEX idx_contacts_search_trgm ON contacts USING GIN (
    (
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name,  '') || ' ' ||
        coalesce(email,      '')
    ) gin_trgm_ops
);

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Column notes:**

| Column | Notes |
|--------|-------|
| `contact_type` | `lead` — unqualified inbound; `prospect` — qualified, not yet a customer; `customer` — paying; `partner` — integration or referral partner |
| `source` | Free-form. Examples: `upwork`, `referral`, `website`, `gigforge-scout`, `linkedin`, `cold-outreach` |
| `owner_id` | The assigned sales rep or AI agent responsible for this contact |

---

### pipeline_stages

Defines the deal pipeline for each org. Each org maintains its own independent stage list with custom names, colours, and win probabilities.

```sql
CREATE TABLE pipeline_stages (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    position    INTEGER      NOT NULL,
    probability INTEGER      NOT NULL DEFAULT 0,
    stage_type  VARCHAR(50)  NOT NULL DEFAULT 'active',
    color       VARCHAR(7),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pipeline_stages_org_position_unique
        UNIQUE (org_id, position),

    CONSTRAINT pipeline_stages_probability_check
        CHECK (probability BETWEEN 0 AND 100),

    CONSTRAINT pipeline_stages_type_check
        CHECK (stage_type IN ('active', 'won', 'lost')),

    CONSTRAINT pipeline_stages_color_check
        CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX idx_pipeline_stages_org_position ON pipeline_stages (org_id, position);

CREATE TRIGGER trg_pipeline_stages_updated_at
    BEFORE UPDATE ON pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Example seed per org:**
```sql
INSERT INTO pipeline_stages (org_id, name, position, probability, stage_type, color) VALUES
    (:org_id, 'Lead In',        1,  10,  'active', '#6B7280'),
    (:org_id, 'Qualified',      2,  25,  'active', '#3B82F6'),
    (:org_id, 'Proposal Sent',  3,  50,  'active', '#F59E0B'),
    (:org_id, 'Negotiation',    4,  75,  'active', '#8B5CF6'),
    (:org_id, 'Won',            5, 100,  'won',    '#10B981'),
    (:org_id, 'Lost',           6,   0,  'lost',   '#EF4444');
```

---

### deals

The core revenue object. A deal represents a sales opportunity moving through the pipeline.

```sql
CREATE TABLE deals (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title               VARCHAR(500)  NOT NULL,
    contact_id          UUID          REFERENCES contacts(id) ON DELETE SET NULL,
    company_id          UUID          REFERENCES companies(id) ON DELETE SET NULL,
    owner_id            UUID          REFERENCES users(id) ON DELETE SET NULL,
    stage_id            UUID          NOT NULL REFERENCES pipeline_stages(id),
    value               DECIMAL(15,2),
    currency            CHAR(3)       NOT NULL DEFAULT 'USD',
    probability         INTEGER       NOT NULL DEFAULT 0,
    expected_close_date DATE,
    actual_close_date   DATE,
    status              VARCHAR(50)   NOT NULL DEFAULT 'open',
    notes               TEXT,
    created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT deals_probability_check
        CHECK (probability BETWEEN 0 AND 100),

    CONSTRAINT deals_status_check
        CHECK (status IN ('open', 'won', 'lost')),

    CONSTRAINT deals_currency_format
        CHECK (currency ~ '^[A-Z]{3}$'),

    CONSTRAINT deals_value_non_negative
        CHECK (value IS NULL OR value >= 0)
);

CREATE INDEX idx_deals_org_stage    ON deals (org_id, stage_id);
CREATE INDEX idx_deals_org_owner    ON deals (org_id, owner_id);
CREATE INDEX idx_deals_org_status   ON deals (org_id, status);
CREATE INDEX idx_deals_org_close    ON deals (org_id, expected_close_date);
CREATE INDEX idx_deals_org_contact  ON deals (org_id, contact_id);
CREATE INDEX idx_deals_org_company  ON deals (org_id, company_id);

-- Partial index for open deals — the dominant query path
CREATE INDEX idx_deals_open ON deals (org_id, stage_id, owner_id)
    WHERE status = 'open';

CREATE TRIGGER trg_deals_updated_at
    BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### deal_stage_history

Immutable append-only audit trail of every stage transition. Powers time-in-stage analytics, funnel velocity reports, and stage change event webhooks.

```sql
CREATE TABLE deal_stage_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id         UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    from_stage_id   UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id     UUID        NOT NULL REFERENCES pipeline_stages(id),
    changed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_stage_history_deal     ON deal_stage_history (deal_id);
CREATE INDEX idx_deal_stage_history_deal_at  ON deal_stage_history (deal_id, changed_at DESC);
CREATE INDEX idx_deal_stage_history_to_stage ON deal_stage_history (to_stage_id, changed_at DESC);
```

**Note:** This table is append-only. No `updated_at` column and no update trigger. Records are never modified after insertion.

---

### activities

Log of all interactions — calls, emails, meetings, notes — linked to contacts, deals, and/or companies.

```sql
CREATE TABLE activities (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    activity_type     VARCHAR(50)  NOT NULL,
    subject           VARCHAR(500) NOT NULL,
    body              TEXT,
    contact_id        UUID         REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id           UUID         REFERENCES deals(id) ON DELETE SET NULL,
    company_id        UUID         REFERENCES companies(id) ON DELETE SET NULL,
    owner_id          UUID         REFERENCES users(id) ON DELETE SET NULL,
    occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    duration_minutes  INTEGER,
    outcome           VARCHAR(100),
    created_by        UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT activities_type_check
        CHECK (activity_type IN (
            'call', 'email', 'meeting', 'note',
            'task_complete', 'demo', 'trial', 'other'
        )),

    CONSTRAINT activities_duration_positive
        CHECK (duration_minutes IS NULL OR duration_minutes > 0),

    CONSTRAINT activities_has_entity
        CHECK (
            contact_id IS NOT NULL OR
            deal_id    IS NOT NULL OR
            company_id IS NOT NULL
        )
);

CREATE INDEX idx_activities_org_contact ON activities (org_id, contact_id);
CREATE INDEX idx_activities_org_deal    ON activities (org_id, deal_id);
CREATE INDEX idx_activities_org_owner   ON activities (org_id, owner_id);
CREATE INDEX idx_activities_org_at      ON activities (org_id, occurred_at DESC);
CREATE INDEX idx_activities_org_type    ON activities (org_id, activity_type);

CREATE TRIGGER trg_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### tasks

Actionable to-do items linked to contacts and/or deals. Supports both human users and AI agents as assignees.

```sql
CREATE TABLE tasks (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title         VARCHAR(500) NOT NULL,
    description   TEXT,
    contact_id    UUID         REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id       UUID         REFERENCES deals(id) ON DELETE SET NULL,
    assigned_to   UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
    due_date      TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    is_completed  BOOLEAN      NOT NULL DEFAULT false,
    priority      VARCHAR(20)  NOT NULL DEFAULT 'normal',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT tasks_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    CONSTRAINT tasks_completion_consistency
        CHECK (
            (is_completed = false AND completed_at IS NULL) OR
            (is_completed = true  AND completed_at IS NOT NULL)
        )
);

CREATE INDEX idx_tasks_org_assigned_open ON tasks (org_id, assigned_to, is_completed);
CREATE INDEX idx_tasks_org_due_open      ON tasks (org_id, due_date)
    WHERE is_completed = false;
CREATE INDEX idx_tasks_org_contact       ON tasks (org_id, contact_id);
CREATE INDEX idx_tasks_org_deal          ON tasks (org_id, deal_id);
CREATE INDEX idx_tasks_overdue           ON tasks (org_id, due_date)
    WHERE is_completed = false AND due_date IS NOT NULL;

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### tags

Org-scoped labels that can be applied to contacts and deals via join tables.

```sql
CREATE TABLE tags (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    color      VARCHAR(7),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT tags_org_name_unique UNIQUE (org_id, name),
    CONSTRAINT tags_color_check
        CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX idx_tags_org ON tags (org_id);
```

---

### contact_tags

Many-to-many join between contacts and tags.

```sql
CREATE TABLE contact_tags (
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, tag_id)
);

-- Reverse lookup: find all contacts for a given tag
CREATE INDEX idx_contact_tags_tag ON contact_tags (tag_id);
```

---

### deal_tags

Many-to-many join between deals and tags.

```sql
CREATE TABLE deal_tags (
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, tag_id)
);

-- Reverse lookup: find all deals for a given tag
CREATE INDEX idx_deal_tags_tag ON deal_tags (tag_id);
```

---

### custom_field_definitions

Org-configurable field definitions. Admins can extend the data model for contacts, companies, and deals without requiring schema migrations.

```sql
CREATE TABLE custom_field_definitions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type  VARCHAR(50)  NOT NULL,
    field_name   VARCHAR(100) NOT NULL,
    field_label  VARCHAR(255) NOT NULL,
    field_type   VARCHAR(50)  NOT NULL,
    options      JSONB,
    is_required  BOOLEAN      NOT NULL DEFAULT false,
    position     INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT cfd_org_entity_name_unique
        UNIQUE (org_id, entity_type, field_name),

    CONSTRAINT cfd_entity_type_check
        CHECK (entity_type IN ('contact', 'company', 'deal')),

    CONSTRAINT cfd_field_type_check
        CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'multi_select')),

    CONSTRAINT cfd_select_requires_options
        CHECK (
            field_type NOT IN ('select', 'multi_select') OR
            (options IS NOT NULL AND jsonb_array_length(options) > 0)
        )
);

CREATE INDEX idx_cfd_org_entity ON custom_field_definitions (org_id, entity_type);

CREATE TRIGGER trg_cfd_updated_at
    BEFORE UPDATE ON custom_field_definitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**`options` JSONB schema** (for `select` / `multi_select`):
```json
["Option A", "Option B", "Option C"]
```

---

### custom_field_values

Stores actual values for custom fields against any entity (contact, company, or deal). Uses a sparse column approach: only the column matching `field_type` is populated; the rest are NULL.

```sql
CREATE TABLE custom_field_values (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id  UUID          NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    entity_id      UUID          NOT NULL,
    value_text     TEXT,
    value_number   DECIMAL(15,4),
    value_date     DATE,
    value_boolean  BOOLEAN,
    value_json     JSONB,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT cfv_definition_entity_unique
        UNIQUE (definition_id, entity_id)
);

CREATE INDEX idx_cfv_entity     ON custom_field_values (entity_id);
CREATE INDEX idx_cfv_definition ON custom_field_values (definition_id);

CREATE TRIGGER trg_cfv_updated_at
    BEFORE UPDATE ON custom_field_values
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Design note:** `entity_id` is polymorphic — it stores a UUID that refers to a contact, company, or deal depending on `custom_field_definitions.entity_type`. PostgreSQL cannot enforce a foreign key on a polymorphic column; referential integrity is maintained by the application layer. The `entity_id` index efficiently supports the most common query: "fetch all custom field values for this entity."

---

### webhooks

Registered webhook endpoints for delivering real-time CRM events to external systems and AI agents.

```sql
CREATE TABLE webhooks (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url         VARCHAR(2000) NOT NULL,
    secret      VARCHAR(255)  NOT NULL,
    events      TEXT[]        NOT NULL,
    is_active   BOOLEAN       NOT NULL DEFAULT true,
    description VARCHAR(500),
    created_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT webhooks_url_scheme
        CHECK (url ~ '^https?://'),

    CONSTRAINT webhooks_events_nonempty
        CHECK (array_length(events, 1) > 0)
);

CREATE INDEX idx_webhooks_org        ON webhooks (org_id);
CREATE INDEX idx_webhooks_org_active ON webhooks (org_id) WHERE is_active = true;

-- GIN index for efficient "which webhooks are subscribed to event X?" queries
CREATE INDEX idx_webhooks_events_gin ON webhooks USING GIN (events);

CREATE TRIGGER trg_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### webhook_events

Delivery log for every webhook dispatch attempt. Enables retry logic with exponential backoff (1 min, 5 min, 30 min).

```sql
CREATE TABLE webhook_events (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id           UUID         NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type           VARCHAR(100) NOT NULL,
    payload              JSONB        NOT NULL,
    status               VARCHAR(50)  NOT NULL DEFAULT 'pending',
    attempts             INTEGER      NOT NULL DEFAULT 0,
    last_attempt_at      TIMESTAMPTZ,
    next_retry_at        TIMESTAMPTZ,
    response_status_code INTEGER,
    response_body        TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT webhook_events_status_check
        CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),

    CONSTRAINT webhook_events_attempts_non_negative
        CHECK (attempts >= 0)
);

CREATE INDEX idx_webhook_events_webhook_status ON webhook_events (webhook_id, status);
CREATE INDEX idx_webhook_events_created        ON webhook_events (webhook_id, created_at DESC);

-- Partial index for retry scheduler — excludes terminal states
CREATE INDEX idx_webhook_events_retry ON webhook_events (next_retry_at)
    WHERE status IN ('pending', 'retrying');
```

**Note:** `webhook_events` is effectively append-only except for status and retry fields updated by the background retry worker. No `updated_at` trigger is added; `last_attempt_at` and `next_retry_at` serve the same purpose.

**Retry schedule:**
```
Attempt 1: immediate
Attempt 2: next_retry_at = now() + INTERVAL '1 minute'
Attempt 3: next_retry_at = now() + INTERVAL '5 minutes'
Attempt 4: next_retry_at = now() + INTERVAL '30 minutes'
After attempt 4: status = 'failed'
```

---

### audit_log

Immutable append-only log of every create/update/delete operation performed by any user or agent. Critical for compliance, debugging, and agent observability.

```sql
CREATE TABLE audit_log (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
    actor_type  VARCHAR(50)  NOT NULL DEFAULT 'user',
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   UUID         NOT NULL,
    changes     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT audit_log_actor_type_check
        CHECK (actor_type IN ('user', 'agent', 'system'))
);

CREATE INDEX idx_audit_log_org_entity  ON audit_log (org_id, entity_type, entity_id);
CREATE INDEX idx_audit_log_org_actor   ON audit_log (org_id, actor_id);
CREATE INDEX idx_audit_log_org_created ON audit_log (org_id, created_at DESC);
```

**`changes` JSONB schema:**
```json
{
  "title":    { "old": "Old Deal Name",    "new": "New Deal Name" },
  "stage_id": { "old": "uuid-old-stage",   "new": "uuid-new-stage" },
  "value":    { "old": 5000.00,            "new": 7500.00 }
}
```

**`action` naming convention:** `<entity_type>.<verb>`, e.g. `contact.created`, `deal.stage_changed`, `user.deactivated`.

**Note:** `audit_log` has no `updated_at` and no update trigger. Records are immutable after insertion. For very high-volume orgs, partition by month using `pg_partman` on `created_at`.

---

## Entity Relationship Summary

```
organizations (1)
    ├── users (N)                  org_id FK
    ├── companies (N)              org_id FK
    ├── contacts (N)               org_id FK, company_id → companies, owner_id → users
    ├── pipeline_stages (N)        org_id FK
    ├── deals (N)                  org_id FK, contact_id, company_id, stage_id, owner_id
    │       └── deal_stage_history (N)   deal_id FK
    │       └── deal_tags (N)           deal_id FK, tag_id FK
    ├── activities (N)             org_id FK, contact_id, deal_id, company_id, owner_id
    ├── tasks (N)                  org_id FK, contact_id, deal_id, assigned_to
    ├── tags (N)                   org_id FK
    │       └── contact_tags (N)         contact_id FK, tag_id FK
    │       └── deal_tags (N)           deal_id FK, tag_id FK
    ├── custom_field_definitions (N)     org_id FK
    │       └── custom_field_values (N)  definition_id FK, entity_id (polymorphic)
    ├── webhooks (N)               org_id FK
    │       └── webhook_events (N)       webhook_id FK
    └── audit_log (N)              org_id FK, actor_id → users
```

---

## Multi-Tenancy Pattern

### Strategy: Row-Level Tenancy with Application-Layer Enforcement

Every tenant-scoped table carries an `org_id UUID NOT NULL` column that references `organizations(id)`. Tenant isolation is enforced by the application middleware — not at the PostgreSQL level — for simplicity, debuggability, and ORM compatibility.

**Enforcement chain:**

1. **JWT carries `org_id` claim** — every authenticated request includes the tenant identifier.
2. **FastAPI dependency** — `get_current_org_id()` decodes the JWT and extracts `org_id`. This dependency is injected into every route that accesses tenant data.
3. **Repository pattern** — all database access goes through repository classes. Every repository method accepts `org_id` as a required parameter and includes it as the first filter condition.
4. **SQLAlchemy filter convention** — `org_id` is always the first `.where()` clause in every query.

**Example (SQLAlchemy 2.x async):**
```python
# app/repositories/contacts.py

async def list_contacts(
    session: AsyncSession,
    org_id: UUID,
    *,
    owner_id: UUID | None = None,
    contact_type: str | None = None,
    cursor: UUID | None = None,
    limit: int = 50,
) -> list[Contact]:
    stmt = (
        select(Contact)
        .where(Contact.org_id == org_id)          # tenant gate — always first
        .order_by(Contact.created_at.desc(), Contact.id.desc())
        .limit(limit)
    )
    if owner_id:
        stmt = stmt.where(Contact.owner_id == owner_id)
    if contact_type:
        stmt = stmt.where(Contact.contact_type == contact_type)
    if cursor:
        stmt = stmt.where(Contact.id < cursor)

    result = await session.execute(stmt)
    return result.scalars().all()
```

**FastAPI route pattern:**
```python
# app/api/contacts.py

@router.get("/contacts")
async def list_contacts_endpoint(
    org_id: UUID = Depends(get_current_org_id),
    session: AsyncSession = Depends(get_session),
    ...
):
    return await contacts_repo.list_contacts(session, org_id, ...)
```

### What we explicitly do NOT do

- **No PostgreSQL Row Security Policies (RLS).** RLS is a valid defense-in-depth measure but adds friction to Alembic migrations, SQLAlchemy session management, and debugging. It is earmarked for a future security hardening phase (see ADR-001).
- **No schema-per-tenant.** Rejected due to operational complexity — see ADR-001.
- **No database-per-tenant.** Rejected due to cost and management overhead at scale — see ADR-001.

### Cross-tenant leak prevention

In addition to middleware enforcement, the schema provides an extra layer:

- Composite unique constraints (e.g. `UNIQUE(org_id, email)`) mean that even a missing `org_id` filter would not expose another tenant's record by matching on `email` alone.
- All foreign keys from tenant-scoped tables to other tenant-scoped tables are indirect through `org_id`. For example, a `stage_id` on `deals` references `pipeline_stages(id)`, but `pipeline_stages` also carries `org_id`. The application always validates that the referenced stage belongs to the same org before writing.

---

## Indexing Rationale

Every index on a tenant-scoped table begins with `org_id`. This single design rule ensures that PostgreSQL can use the index for any production query, since every production query filters by `org_id`.

| Index | Table | Reason |
|-------|-------|--------|
| `UNIQUE (slug)` | `organizations` | Org lookup by slug during auth |
| `(org_id, email)` | `users` | Login lookup — always org-scoped |
| `(org_id, role)` | `users` | Role-based permission checks and admin user listings |
| `(org_id)` WHERE `is_active` | `users` | Active user count and listings |
| `(org_id)` WHERE `is_agent` | `users` | Agent user listings |
| `(org_id)` | `companies` | Company list page |
| `(org_id, domain)` partial | `companies` | Company deduplication by domain |
| GIN trgm on `name` | `companies` | Company search |
| `(org_id, owner_id)` | `contacts` | "My contacts" — most common contacts filter |
| `(org_id, company_id)` | `contacts` | Company detail page contact list |
| `(org_id, contact_type)` | `contacts` | Lead / customer / prospect filter |
| GIN trgm on name+email | `contacts` | Full-text people search using `pg_trgm` |
| `(org_id, position)` | `pipeline_stages` | Ordered stage list for Kanban board |
| `(org_id, stage_id)` | `deals` | Kanban grouping — deals by stage |
| `(org_id, owner_id)` | `deals` | "My deals" filter |
| `(org_id, status)` | `deals` | Open / won / lost pipeline filter |
| `(org_id, expected_close_date)` | `deals` | Forecasting and date-range queries |
| Partial `WHERE status = 'open'` | `deals` | Dominant access path — open deals dominate the working set |
| `(deal_id)` | `deal_stage_history` | Stage history for one deal |
| `(deal_id, changed_at DESC)` | `deal_stage_history` | Chronological stage timeline |
| `(org_id, occurred_at DESC)` | `activities` | Activity feed — newest first |
| `(org_id, contact_id)` | `activities` | Contact detail activity timeline |
| `(org_id, deal_id)` | `activities` | Deal detail activity timeline |
| `(org_id, assigned_to, is_completed)` | `tasks` | "My open tasks" — common dashboard query |
| Partial `WHERE NOT is_completed` | `tasks` | Overdue task scan skips completed rows |
| GIN on `events` array | `webhooks` | Find all webhooks subscribed to a specific event type |
| `(webhook_id, status)` | `webhook_events` | Retry worker: find pending/retrying events |
| Partial `WHERE status IN (pending, retrying)` | `webhook_events` | Retry scheduler ignores terminal states |
| `(org_id, entity_type, entity_id)` | `audit_log` | Fetch audit trail for one entity |
| `(org_id, created_at DESC)` | `audit_log` | Org-wide activity timeline |

---

## Migration Strategy (Alembic)

### Installation and Project Setup

```bash
pip install alembic asyncpg sqlalchemy[asyncio]

# Initialize Alembic with the async template
alembic init -t async alembic
```

### Directory Layout

```
backend/
  alembic/
    versions/
      0001_initial_extensions_and_schema.py
      0002_seed_organizations.py
      0003_seed_pipeline_stages.py
    env.py
    script.py.mako
  alembic.ini
```

### `alembic.ini` Connection String

```ini
sqlalchemy.url = postgresql+asyncpg://crm:secret@localhost:5432/crm
```

### `env.py` (async pattern)

```python
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.models import Base

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata


async def run_async_migrations() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)
    await engine.dispose()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())
```

### Migration Conventions

1. **One migration per logical change.** Never bundle unrelated schema changes into one revision.
2. **Always implement `downgrade()`** — even if it just raises `NotImplementedError` for irreversible migrations (e.g. data migrations).
3. **Never edit existing migration files.** Fix mistakes by creating a new revision.
4. **Extensions first** — `pgcrypto`, `pg_trgm`, and `btree_gin` are created in revision `0001` before any table definitions.
5. **Seed data in separate revisions** — e.g. `0002_seed_organizations.py` — so schema and data are independently reversible.
6. **CI gate** — the CI pipeline runs `alembic upgrade head` against a clean test database on every pull request. A failing migration blocks the merge.
7. **Production deployment** — migrations run as a Docker entrypoint step (or Kubernetes init container) before the application process starts. The application itself never runs `alembic upgrade` on startup in code.

### Example Migration Skeleton

```python
"""Initial extensions and schema

Revision ID: 0001
Revises:
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extensions — must come before any table that uses their functions
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gin")

    # Shared trigger function
    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = now(); RETURN NEW; END;
        $$ LANGUAGE plpgsql
    """)

    # organizations
    op.create_table(
        'organizations',
        sa.Column('id',         postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column('name',       sa.String(255),  nullable=False),
        sa.Column('slug',       sa.String(100),  nullable=False),
        sa.Column('plan',       sa.String(50),   nullable=False, server_default='standard'),
        sa.Column('settings',   postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint('slug', name='organizations_slug_unique'),
    )

    # ... remaining tables in dependency order
    # users → companies → contacts → pipeline_stages → deals →
    # deal_stage_history → activities → tasks → tags →
    # contact_tags → deal_tags → custom_field_definitions →
    # custom_field_values → webhooks → webhook_events → audit_log


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table('audit_log')
    op.drop_table('webhook_events')
    op.drop_table('webhooks')
    op.drop_table('custom_field_values')
    op.drop_table('custom_field_definitions')
    op.drop_table('deal_tags')
    op.drop_table('contact_tags')
    op.drop_table('tags')
    op.drop_table('tasks')
    op.drop_table('activities')
    op.drop_table('deal_stage_history')
    op.drop_table('deals')
    op.drop_table('pipeline_stages')
    op.drop_table('contacts')
    op.drop_table('companies')
    op.drop_table('users')
    op.drop_table('organizations')
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
    op.execute("DROP EXTENSION IF EXISTS btree_gin")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")
```
