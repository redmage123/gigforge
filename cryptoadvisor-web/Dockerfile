# Stage 1: deps
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Stage 2: builder
FROM deps AS builder
ARG VITE_CMS_URL=""
ARG VITE_AI_URL=""
ENV VITE_CMS_URL=$VITE_CMS_URL
ENV VITE_AI_URL=$VITE_AI_URL
COPY . .
RUN pnpm build

# Stage 3: runner
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
