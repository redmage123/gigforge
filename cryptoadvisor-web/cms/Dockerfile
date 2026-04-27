# Payload CMS — demo runtime image (uses payload dev for simplicity)
# Used by docker-compose.yml as the `cms` service
FROM node:22-alpine
WORKDIR /app

# wget for healthcheck
RUN apk add --no-cache wget

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["npx", "payload", "dev"]
