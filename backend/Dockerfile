# -- Stage 1: Build --
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# -- Stage 2: Production --
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && chown nestjs:nestjs /app/data

USER nestjs

EXPOSE 8000

ENV NODE_ENV=production
ENV PORT=8000

CMD ["node", "dist/main"]
