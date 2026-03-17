# ── Stage 1: Dependencies ────────────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# ── Stage 2: Builder ─────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app
COPY . .

# Compile bytecode (validates syntax, speeds cold starts)
RUN python -m compileall -q .


# ── Stage 3: Runner ──────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

# Security: create non-root user
RUN groupadd -r crm && useradd -r -g crm crm

WORKDIR /app

# Install only runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application
COPY --from=builder --chown=crm:crm /app .

USER crm

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
