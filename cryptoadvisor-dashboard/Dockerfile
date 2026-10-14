# Stage 1: Build React frontend
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Claude Code CLI (the app's AI features call `claude -p`)
FROM node:22-slim AS claude
RUN npm install -g @anthropic-ai/claude-code@2.1.72

# Stage 3: Python app
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*
COPY --from=claude /usr/local/bin/node /usr/local/bin/node
COPY --from=claude /usr/local/lib/node_modules/@anthropic-ai/claude-code /usr/local/lib/node_modules/@anthropic-ai/claude-code
RUN ln -s /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude && claude --version
# Pinned version: no self-updates inside the container
ENV DISABLE_AUTOUPDATER=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend /build/../static/react ./static/react
RUN mkdir -p data
EXPOSE 8050
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8050"]
