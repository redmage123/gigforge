"""Relational schema (Postgres) for firms, sign-in identities and sessions, audit events and broker connections.

Migrations are numbered SQL steps applied in order once each and recorded in schema_migrations.
They run when the connection pool is first used. Features built on these tables need Postgres
(production always has it); without DATABASE_URL they report themselves unavailable.
"""

import threading

from services import store

MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "firms and membership", """
CREATE TABLE firms (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    slug            text NOT NULL UNIQUE,
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- sign-in policy: allowed SSO email domains (JIT provisioning), require SSO for members
    sso_domains     text[] NOT NULL DEFAULT '{}',
    sso_required    boolean NOT NULL DEFAULT false,
    default_role    text NOT NULL DEFAULT 'viewer',
    session_hours   integer NOT NULL DEFAULT 12
);
CREATE TABLE firm_members (
    firm_id     text NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    username    text NOT NULL,
    role        text NOT NULL CHECK (role IN ('admin','pm','analyst','compliance','viewer')),
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    added_by    text,
    added_at    timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    PRIMARY KEY (firm_id, username)
);
CREATE INDEX firm_members_user_idx ON firm_members (username);
CREATE TABLE firm_invites (
    token_hash  text PRIMARY KEY,
    firm_id     text NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    role        text NOT NULL,
    email       text,
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    accepted_by text,
    accepted_at timestamptz,
    revoked_at  timestamptz
);
CREATE TABLE firm_portfolios (
    portfolio_id text PRIMARY KEY,
    firm_id      text NOT NULL REFERENCES firms(id) ON DELETE CASCADE
);
"""),
    (2, "sign-in identities and SAML", """
CREATE TABLE identities (
    provider    text NOT NULL,          -- google | microsoft | saml:<firm_id>
    subject     text NOT NULL,          -- the provider's stable user id
    username    text NOT NULL,
    email       text,
    linked_at   timestamptz NOT NULL DEFAULT now(),
    last_used   timestamptz,
    PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user_idx ON identities (username);
CREATE TABLE saml_configs (
    firm_id         text PRIMARY KEY REFERENCES firms(id) ON DELETE CASCADE,
    idp_entity_id   text NOT NULL,
    idp_sso_url     text NOT NULL,
    idp_cert_pem    text NOT NULL,
    email_attribute text NOT NULL DEFAULT '',
    enabled         boolean NOT NULL DEFAULT true,
    updated_by      text,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sso_states (                -- pending sign-ins (OIDC state/nonce, SAML request ids)
    state       text PRIMARY KEY,
    data        jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE saml_seen_assertions (     -- replay protection
    assertion_id text PRIMARY KEY,
    seen_at      timestamptz NOT NULL DEFAULT now()
);
"""),
    (3, "append-only audit events", """
CREATE TABLE audit_events (
    id          bigserial PRIMARY KEY,
    at          timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor       text NOT NULL,
    action      text NOT NULL,
    firm_id     text,
    target      text,
    ip          text,
    detail      jsonb NOT NULL DEFAULT '{}',
    prev_hash   text NOT NULL,
    hash        text NOT NULL
);
CREATE INDEX audit_events_firm_idx ON audit_events (firm_id, at);
CREATE INDEX audit_events_actor_idx ON audit_events (actor, at);
-- Tamper resistance: rows can be added, never changed or removed (except anonymized on account deletion)
CREATE FUNCTION audit_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'audit events cannot be deleted';
    END IF;
    IF NEW.id <> OLD.id OR NEW.at <> OLD.at OR NEW.action <> OLD.action OR NEW.hash <> OLD.hash
       OR NEW.prev_hash <> OLD.prev_hash OR NEW.detail <> OLD.detail OR NEW.target IS DISTINCT FROM OLD.target THEN
        RAISE EXCEPTION 'audit events cannot be changed';
    END IF;
    IF NEW.actor <> OLD.actor AND NEW.actor <> 'deleted-user' THEN
        RAISE EXCEPTION 'audit actor can only be anonymized';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_guard();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_guard();
"""),
    (4, "broker connections", """
CREATE TABLE broker_connections (
    id              text PRIMARY KEY,
    owner           text NOT NULL,          -- whose records the trades go into (user or firm owner key)
    portfolio_id    text NOT NULL,
    provider        text NOT NULL CHECK (provider IN ('alpaca','plaid','snaptrade')),
    label           text NOT NULL,
    secret_enc      text NOT NULL,          -- encrypted credentials/tokens
    meta            jsonb NOT NULL DEFAULT '{}',
    status          text NOT NULL DEFAULT 'active',
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_sync_at    timestamptz,
    last_sync_ok    boolean,
    last_sync_msg   text
);
CREATE INDEX broker_connections_owner_idx ON broker_connections (owner);
CREATE TABLE broker_sync_runs (
    id            bigserial PRIMARY KEY,
    connection_id text NOT NULL REFERENCES broker_connections(id) ON DELETE CASCADE,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    ok            boolean,
    trades_added  integer NOT NULL DEFAULT 0,
    cash_added    integer NOT NULL DEFAULT 0,
    message       text
);
"""),
    (5, "sign-in sessions", """
CREATE TABLE sessions (
    id              text PRIMARY KEY,       -- the token's sid claim
    username        text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    ip              text,
    user_agent      text,
    method          text,                   -- password, register, google, microsoft, saml
    revoked_at      timestamptz,
    revoked_reason  text
);
CREATE INDEX sessions_username_idx ON sessions (username);
"""),
    (6, "firm two-factor policy", """
ALTER TABLE firms ADD COLUMN mfa_required boolean NOT NULL DEFAULT false;  -- members must use two-factor sign-in
ALTER TABLE firms ADD COLUMN idp_mfa boolean NOT NULL DEFAULT false;       -- the firm's IdP enforces MFA itself
"""),
]

_applied = False
_lock = threading.Lock()


class Unavailable(RuntimeError):
    """Feature needs Postgres (DATABASE_URL)."""


def migrate() -> list[int]:
    """Apply pending migrations; returns the numbers applied."""
    done = []
    with store.pool().connection() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text, "
                     "applied_at timestamptz NOT NULL DEFAULT now())")
        conn.execute("SELECT pg_advisory_xact_lock(727274)")  # one migrator at a time
        have = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
        for version, name, sql in MIGRATIONS:
            if version in have:
                continue
            conn.execute(sql)
            conn.execute("INSERT INTO schema_migrations (version, name) VALUES (%s, %s)", (version, name))
            done.append(version)
        conn.commit()
    return done


def conn():
    """A pooled connection with the schema up to date. Use as a context manager."""
    global _applied
    if not store.using_postgres():
        raise Unavailable("This feature needs the Postgres database")
    if not _applied:
        with _lock:
            if not _applied:
                migrate()
                _applied = True
    return store.pool().connection()


def available() -> bool:
    return store.using_postgres()
