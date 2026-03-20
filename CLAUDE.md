# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NATS JetStream Manager is a full-stack web application for managing and monitoring NATS JetStream clusters. It consists of a NestJS backend, Next.js frontend, and a configurable database (SQLite or PostgreSQL).

## Development Commands

### Backend (from `backend/` directory)

```bash
npm install              # Install dependencies
npm run start:dev        # Start dev server with hot reload at :8000
npm run start:debug      # Start with debug mode
npm run build            # Compile TypeScript to dist/
npm run start:prod       # Run compiled production build
npm run lint             # Run ESLint with auto-fix
npm test                 # Run Jest tests
npm run test:cov         # Run tests with coverage report
```

### Frontend (from `frontend/` directory)

```bash
npm install         # Install dependencies
npm run dev         # Start dev server at :3000
npm run build       # Production build
npm run lint        # Run ESLint
```

### Full Stack (from repo root)

```bash
docker-compose up -d    # Start 3-node NATS JetStream cluster
```

### Environment Variables

Backend (`.env` in `backend/`, see `.env.example` for full list):

- `PORT=8000` — Server port
- `CORS_ORIGINS=http://localhost:3000` — Allowed CORS origins (comma-separated)
- `DATABASE_TYPE=sqlite` — Database driver: `sqlite` or `postgres`
- `DATABASE_PATH=./data/nats_manager.db` — SQLite file path (when `DATABASE_TYPE=sqlite`)
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_SSL` — PostgreSQL settings (when `DATABASE_TYPE=postgres`)
- `MAX_CONNECTIONS=10` — Maximum concurrent NATS connections
- `CONNECTION_TIMEOUT=300` — NATS connection inactivity timeout (seconds)

Frontend (`.env.local` in `frontend/`):

- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Architecture

### Backend (NestJS + TypeScript)

Modular NestJS architecture in `backend/src/`:

```
connections/     → NATS connection pooling & lifecycle
streams/         → Stream CRUD operations
consumers/       → Consumer CRUD & lag analytics
messages/        → Publish, search, replay, schema validation
cluster/         → Cluster topology & health
system/          → System observability
metrics/         → Time-series metrics collection (30s interval)
health-history/  → Connection health tracking (30s interval)
audit/           → Audit logging (global module)
jobs/            → Background job management
database/        → TypeORM entity definitions
common/          → Exception filters, shared types
```

**Database** (`app.module.ts`): TypeORM with `better-sqlite3` or `pg` driver, selected via `DATABASE_TYPE` env var. Entities auto-loaded with `synchronize: true`. Tables: `jobs`, `audit_logs`, `stream_metrics`, `connection_health`.

**Connection pooling** (`connections/`): UUID-based connection IDs, in-memory storage, configurable timeout and max connections.

**Background tasks**: Metrics collection and health checks via `@nestjs/schedule` (30s intervals).

**API docs**: Swagger UI at `/docs`, auto-generated from decorators.

### Frontend (Next.js 16 App Router + TypeScript)

```
src/app/              → Next.js pages (App Router)
src/components/       → Reusable React components (Shadcn/ui)
src/contexts/         → Connection state (React Context)
src/hooks/            → Custom hooks wrapping TanStack React Query
src/lib/              → API client, types, utility functions
src/workers/          → Web workers for heavy computation
```

**State management**: TanStack React Query for server state; React Context for active connection. Forms use React Hook Form + Zod validation.

**UI stack**: Shadcn/ui components, Tailwind CSS, Lucide icons, Recharts for metrics, TanStack Table for data tables.

### API Structure

All routes under `/api/v1/`. Key resource groupings:

- `/connections/*` — NATS connection lifecycle
- `/connections/{id}/streams/*` — Stream CRUD
- `/connections/{id}/streams/{stream}/consumers/*` — Consumer CRUD + analytics
- `/connections/{id}/messages/*` — Publish, search, replay
- `/connections/{id}/cluster/*` — Cluster topology
- `/metrics/*`, `/health-history/*`, `/audit/*` — Observability
- `/jobs/*` — Background job status

## Deployment

- **Backend Dockerfile**: Multi-stage build (`backend/Dockerfile`) — builds TypeScript, runs as non-root `nestjs` user
- **Frontend Dockerfile**: Dev-mode container (`frontend/Dockerfile`)
- **Helm charts**: `helm/nats-jetstream-manager/` for Kubernetes deployment. Supports both SQLite (with PVC) and PostgreSQL (external). HPA available for PostgreSQL deployments.
- **Docker Compose**: 3-node NATS cluster for local development
