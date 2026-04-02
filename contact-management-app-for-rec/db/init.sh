#!/bin/sh
# DB init entrypoint — runs all SQL migrations in order
# Used by the PostgreSQL container via docker-entrypoint-initdb.d (optional)
# The API service also runs migrations on startup via migrate.ts

set -e

echo "DB init complete (migrations run by API on startup)"
