.PHONY: up down build logs migrate migrate-auto test test-backend test-frontend shell-db shell-backend clean help

COMPOSE = docker compose
COMPOSE_DEV = docker compose -f docker-compose.yml -f docker-compose.dev.yml

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Start all services (production)
	$(COMPOSE) up -d

up-dev: ## Start all services (development with hot reload)
	cp -n .env.example .env 2>/dev/null || true
	$(COMPOSE_DEV) up

down: ## Stop all services
	$(COMPOSE) down

down-volumes: ## Stop all services and remove volumes (WARNING: destroys data)
	$(COMPOSE) down -v

build: ## Build all images
	$(COMPOSE) build

build-no-cache: ## Build all images without cache
	$(COMPOSE) build --no-cache

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

logs-backend: ## Tail backend logs
	$(COMPOSE) logs -f api

logs-db: ## Tail postgres logs
	$(COMPOSE) logs -f db

migrate: ## Run Alembic migrations
	$(COMPOSE) exec api alembic upgrade head

migrate-auto: ## Auto-generate migration from model changes
	$(COMPOSE) exec api alembic revision --autogenerate -m "$(msg)"

migrate-history: ## Show migration history
	$(COMPOSE) exec api alembic history

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests with coverage
	$(COMPOSE) exec api pytest tests/ -v --cov=. --cov-report=term-missing --cov-fail-under=80

test-frontend: ## Run frontend tests
	$(COMPOSE) exec frontend npm run test -- --coverage

shell-db: ## Open psql shell
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-crm_user} -d $${POSTGRES_DB:-crm_db}

shell-backend: ## Open bash shell in backend container
	$(COMPOSE) exec api bash

seed: ## Seed demo data
	$(COMPOSE) exec api python scripts/seed.py

clean: ## Remove stopped containers and unused images
	docker system prune -f

ps: ## Show running services
	$(COMPOSE) ps

status: ps ## Alias for ps
