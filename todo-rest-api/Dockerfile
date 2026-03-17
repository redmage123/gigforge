# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && \
    cp -r node_modules /tmp/prod_node_modules && \
    npm ci && \
    rm -rf /tmp/prod_node_modules_bak

# Stage 2: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Copy migrations
COPY migrations/ ./migrations/

# Set ownership
RUN chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
