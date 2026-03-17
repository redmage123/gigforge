-- CRM Database Initialization
-- Runs once when PostgreSQL container first starts

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone
SET timezone = 'UTC';

-- Performance tuning
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET random_page_cost = 1.1;

-- Confirm
DO $$
BEGIN
  RAISE NOTICE 'CRM database initialized with extensions: uuid-ossp, pg_trgm, pgcrypto';
END $$;
