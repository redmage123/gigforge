# syntax=docker/dockerfile:1

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ─── Stage 2: Build TypeScript ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src/ ./src/
RUN npm run build

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 appuser

# Copy production node_modules from deps stage
COPY --from=deps    /app/node_modules ./node_modules
# Copy compiled output from builder stage
COPY --from=builder /app/dist         ./dist
COPY package.json ./

# Set ownership
RUN chown -R appuser:nodejs /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/app.js"]
