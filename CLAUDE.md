# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NATS JetStream Manager is a full-stack web application for managing and monitoring NATS JetStream clusters. It consists of a FastAPI backend, Next.js frontend, and SQLite database.

## Development Commands

### Backend (from `backend/` directory)

```bash
make setup          # One-time: create venv + install dev dependencies
source .venv/bin/activate
make run            # Start dev server with hot reload at :8000
make run-debug      # Start with debug logging
make test           # Run pytest
make test-cov       # Run tests with HTML coverage report
make lint           # Check with ruff
make lint-fix       # Auto-fix lint issues
make format         # Format with black
```

Run a single test file:
```bash
pytest app/tests/test_auth.py -v
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
docker-compose up -d    # Start all services
# NATS must be started separately:
docker run -p 4222:4222 -p 8222:8222 nats:latest -js -m 8222
```

### Environment Variables

Backend (`.env` in `backend/`):
- `NEXT_PUBLIC_API_URL=http://localhost:8000` — Backend URL
- `AUTH_ENABLED` / `USER_AUTH_ENABLED` — Toggle auth globally or per-user
- `DATABASE_PATH=./data/nats_manager.db` — SQLite path
- `CORS_ORIGINS=http://localhost:3000`

Frontend (`.env.local` in `frontend/`):
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Architecture

### Backend (FastAPI + Python 3.11+, managed with `uv`)

Layered architecture in `backend/app/`:

```
api/v1/          → REST endpoints (thin layer, no business logic)
services/        → All business logic (~3000 lines across 9 services)
core/            → Infrastructure: ConnectionManager, SQLite DB, config
models/schemas.py → All Pydantic request/response models (single file, 693 lines)
```

**Connection pooling** (`core/connection_manager.py`): The `ConnectionManager` handles multiple concurrent NATS connections via UUID-based connection IDs. Connections are stored in-memory with timeout-based expiration. Each API request receives a connection via FastAPI `Depends()` in `api/deps.py`.

**Background tasks** (`main.py` lifespan): Metrics collection (30s interval) and health checks run as async loops. Job management for long-running index builds.

**Database** (`core/db.py`): SQLite at `./data/nats_manager.db` with tables: `users`, `sessions`, `invites`, `jobs`, `metrics`, `health_records`, `audit_logs`. Foreign keys enabled; session/invite tokens are indexed.

**Auth**: PBKDF2-SHA256 password hashing, session tokens with 7-day TTL. RBAC with `admin` and `viewer` roles. Invite system with optional email sending.

### Frontend (Next.js 14 App Router + TypeScript)

```
src/app/              → Next.js pages (App Router)
src/components/       → Reusable React components
src/contexts/         → Auth and connection state (React Context)
src/hooks/            → Custom hooks wrapping React Query
src/lib/              → API client, utility functions, shared types
src/workers/          → Web workers for heavy computation
```

**State management**: TanStack React Query for server state; React Context for auth/active connection state. Forms use React Hook Form + Zod validation.

**UI stack**: Shadcn/ui components, Tailwind CSS, Lucide icons, Recharts for metrics visualization, TanStack Table for data tables.

### API Structure

All routes under `/api/v1/`. Key resource groupings:
- `/auth/*` and `/users/*` — Authentication and user management
- `/connections/*` — NATS connection lifecycle
- `/connections/{id}/streams/*` — Stream CRUD
- `/connections/{id}/streams/{stream}/consumers/*` — Consumer CRUD + analytics
- `/connections/{id}/messages/*` — Publish, search, replay
- `/connections/{id}/cluster/*` — Cluster topology
- `/metrics/*`, `/health-history/*`, `/audit/*` — Observability

### Key Service Files

| File | Purpose |
|------|---------|
| `services/auth_service.py` | Users, sessions, password hashing, invites |
| `services/message_service.py` | Publish, search, batch, schema validation (509 lines) |
| `services/stream_service.py` | Stream CRUD, retention policies, purge |
| `services/consumer_service.py` | Consumer CRUD, lag analytics |
| `services/metrics_service.py` | Metrics collection and aggregation |

## Deployment

Helm charts in `helm/nats-jetstream-manager/` for Kubernetes. Production Dockerfiles: `backend/Dockerfile.prod` and `frontend/Dockerfile`. Backend runs as multi-stage build with `uvicorn`.
