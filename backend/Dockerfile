# -- Stage 1: Build --
FROM node:20-alpine AS builder

WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace=backend --include-workspace-root

COPY backend ./backend
RUN npm run build --workspace=backend
RUN npm prune --omit=dev --workspace=backend --include-workspace-root

# -- Stage 2: Production --
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist

RUN mkdir -p /app/data && chown nestjs:nestjs /app/data

USER nestjs

EXPOSE 8000

ENV NODE_ENV=production
ENV PORT=8000

CMD ["node", "dist/main"]
