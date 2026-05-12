# Repository Guidelines

## Project Snapshot

This is a TypeScript npm workspace with two application packages: `backend/` and
`frontend/`. The backend is a NestJS 11 API that manages live NATS JetStream
connections with NATS.js, TypeORM, scheduled metrics/health collection, pino
logging, and Swagger documentation. The frontend is a Next.js 16 App Router app
using React 19, Tailwind CSS, shadcn/Radix UI primitives, TanStack Query/Table,
Recharts, XYFlow, and Lucide icons.

Treat the source code, package scripts, and this file as the source of truth. The
root `README.md` still contains some stale FastAPI/Python-era references.

## Project Structure & Module Organization

- `backend/src/main.ts` boots Nest, adds the `/api/v1` global prefix, exposes
  Swagger at `/docs`, and keeps `/health` outside the API prefix.
- `backend/src/app.module.ts` wires global config, pino logging, TypeORM
  (`better-sqlite3` or PostgreSQL), scheduling, and all feature modules.
- Backend feature modules live under `backend/src/<feature>/` with Nest
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, and colocated `dto/` files.
  Current features include `connections`, `streams`, `consumers`, `messages`,
  `cluster`, `system`, `metrics`, `health-history`, `audit`, `jobs`, `kv`, and
  `objectstore`.
- TypeORM entities live in `backend/src/database/entities/`; shared backend
  filters and types live under `backend/src/common/`.
- `frontend/src/app/` contains routes. Dashboard routes cover overview, cluster,
  observability, metrics, health, streams, stream details, subjects, topology,
  consumers, messages, KV, object store, config diff, and audit log.
- `frontend/src/components/` contains shared UI, layout, charts, cards, subjects,
  and message components. The shadcn-style primitives are in
  `frontend/src/components/ui/`.
- `frontend/src/hooks/` wraps API access with TanStack Query. Keep query keys and
  invalidation aligned when changing mutations.
- `frontend/src/contexts/` contains connection and theme providers.
  `frontend/src/lib/` contains the API client, shared types, schemas, and
  utilities. `frontend/src/workers/` contains web workers.
- Deployment and release assets live in `docker-compose.yml`,
  `backend/Dockerfile`, `frontend/Dockerfile`, `helm/nats-jetstream-manager/`,
  and `.github/workflows/`.

## Build, Test, and Development Commands

Run workspace commands from the repository root unless noted otherwise.

- `npm install`: install root and workspace dependencies.
- `npm run dev`: run backend and frontend concurrently.
- `npm run dev:backend`: start the Nest backend in watch mode on port `8000`.
- `npm run dev:frontend`: start the Next.js app on port `3000`.
- `npm run build`: build both workspaces.
- `npm run lint`: run ESLint for both workspaces with auto-fix enabled.
- `npm run format`: run Prettier with writes enabled.
- `npm run format:check`: check Prettier formatting without writing.
- `npm run test --workspace=backend`: run backend Jest tests.
- `npm run test:watch --workspace=backend`: run backend tests in watch mode.
- `npm run test:cov --workspace=backend`: run backend tests with coverage.
- `npm run build --workspace=frontend`: validate the Next.js production build.
- `npm run lint --workspace=frontend`: lint frontend files with auto-fix enabled.
- `docker-compose up -d`: start only the local three-node NATS JetStream cluster;
  it does not start the app containers.
- `helm template test helm/nats-jetstream-manager`: render the Helm chart locally
  before changing chart templates or values.

Be aware that lint and format scripts mutate files. Use `format:check` when you
only need validation.

## Backend Conventions

- Use NestJS patterns already present in the codebase: DTOs with
  `class-validator` decorators, controllers for HTTP wiring, services for NATS
  and persistence behavior, and modules for feature boundaries.
- API routes should stay under `/api/v1` via the global prefix. Add Swagger
  decorators/types when expanding public endpoints.
- `ConnectionsService` stores active NATS connections in memory and currently
  enforces a single active connection by disconnecting any existing connection
  before creating a new one. Do not assume connection IDs survive process
  restarts.
- Scheduled collectors run through `@nestjs/schedule`: metrics and health checks
  run every 30 seconds, and connection cleanup runs every 60 seconds.
- Persistent records use TypeORM repositories and the entities in
  `backend/src/database/entities/`. Keep SQLite and PostgreSQL compatibility in
  mind when adding columns or queries.
- Message search indexes and remediation sessions are in-memory. Keep TTLs,
  batch limits, and acknowledgement side effects explicit when modifying
  remediation behavior.
- Use the existing `AuditService` for user-visible or destructive operations on
  streams, consumers, messages, KV buckets, and object stores.

## Frontend Conventions

- Prefer existing shadcn/Radix primitives in `frontend/src/components/ui/` and
  Lucide icons for actions and navigation.
- Keep server-state access in `frontend/src/hooks/` and low-level HTTP details in
  `frontend/src/lib/api.ts`. Shared API shapes belong in `frontend/src/lib/types.ts`.
- Dashboard pages should use the existing sidebar, breadcrumb, command palette,
  cards, tables, dialogs, confirm flows, toast patterns, and dark-mode variables.
- When adding backend endpoints, update the matching frontend API client, shared
  types, hooks, and invalidation behavior in the same change.
- Components using React hooks, browser APIs, or local storage must be client
  components. Avoid adding `"use client"` to purely static or server-renderable
  files.
- Keep Tailwind styling consistent with the CSS variables in
  `frontend/src/app/globals.css` and `frontend/tailwind.config.ts`.

## Coding Style & Naming Conventions

- Use TypeScript for active source code.
- Prettier enforces 2-space indentation, semicolons, single quotes, trailing
  commas, LF endings, and a 100-character print width.
- Backend filenames follow Nest conventions: `*.module.ts`, `*.controller.ts`,
  `*.service.ts`, `*.dto.ts`, and `*.entity.ts`.
- Frontend components use PascalCase, hooks use `useXxx`, and utilities use
  descriptive camelCase exports.
- ESLint treats unused variables as errors, allows unused arguments prefixed with
  `_`, errors on unhandled floating promises in the backend, and warns on
  explicit `any` outside tests.
- Path aliases use `@/` in the frontend. Follow existing relative imports in the
  backend.

## Testing Guidelines

- Backend tests use Jest with `ts-jest`; place specs as `*.spec.ts` under
  `backend/src` near the code under test.
- Add focused backend tests when changing service logic, NATS message handling,
  DTO validation, metrics/health behavior, or audit-sensitive operations.
- There is no frontend test runner configured. Validate frontend changes with
  `npm run lint --workspace=frontend` and `npm run build --workspace=frontend`.
- For cross-stack API changes, run backend tests plus the frontend build so
  type/API drift is caught.
- For Helm changes, render with `helm template test helm/nats-jetstream-manager`
  and inspect the generated environment variables, services, probes, and volume
  mounts.

## Runtime Configuration

Backend environment variables are read through Nest config or `process.env`:

- `PORT`: backend HTTP port, default `8000`.
- `NODE_ENV`: controls production logging behavior.
- `LOG_LEVEL`: pino log level; defaults to `debug` locally and `info` in
  production.
- `CORS_ORIGINS`: comma-separated frontend origins, default
  `http://localhost:3000`.
- `DATABASE_TYPE`: `sqlite` or `postgres`, default `sqlite`.
- `DATABASE_PATH`: SQLite file path, default `./data/nats_manager.db`.
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`,
  `DATABASE_NAME`, `DATABASE_SSL`: PostgreSQL settings.
- `CONNECTION_TIMEOUT`: inactive NATS connection timeout in seconds, default
  `300`.
- `METRICS_RETENTION_HOURS`: metrics retention window, default `24`.
- `HEALTH_RETENTION_DAYS`: connection health retention window, default `7`.

Frontend configuration:

- `NEXT_PUBLIC_API_URL`: backend base URL, default `http://localhost:8000`.

Do not commit credentials, tokens, NATS secrets, database URLs, or generated local
database files.

## API Surface

All application API routes are under `/api/v1` except `/health` and `/docs`.
Important groups include:

- `/connections/*`: test, create, list, status, and disconnect NATS connections.
- `/connections/:connectionId/streams/*`: stream CRUD and purge.
- `/connections/:connectionId/streams/:streamName/consumers/*`: consumer CRUD and
  analytics.
- `/connections/:connectionId/messages/*` and
  `/connections/:connectionId/streams/:streamName/messages/*`: publish, batch
  publish, read, replay, delete, schema validation, and indexed search.
- `/connections/:connectionId/streams/:streamName/consumers/:consumerName/remediation/*`:
  fetch and apply remediation actions for pull consumers.
- `/connections/:connectionId/cluster/*`, `/connections/:connectionId/system/*`,
  `/connections/:connectionId/metrics/*`, and `/connections/:connectionId/health/*`:
  topology, observability, metrics, and uptime data.
- `/connections/:connectionId/jobs/*`: background index build jobs and
  cancellation.
- `/connections/:connectionId/kv/*` and `/connections/:connectionId/objectstore/*`:
  JetStream KV and object store management.
- `/audit`: audit log listing.

## Deployment Notes

- Backend Docker builds from `backend/Dockerfile`, compiles TypeScript, prunes dev
  dependencies, and runs `node dist/main` as a non-root user.
- Frontend Docker builds a standalone Next.js output and uses
  `frontend/docker-entrypoint.sh` to inject runtime `NEXT_PUBLIC_API_URL`.
- The Helm chart supports separate backend/frontend deployments, services,
  ingress, configmaps, secrets, optional SQLite persistence, PostgreSQL settings,
  autoscaling, PDBs, and network policies.
- Docker publish, Helm publish, and release-please workflows live under
  `.github/workflows/`.

## Commit & Pull Request Guidelines

- Commitlint enforces Conventional Commits through Husky. Use messages like
  `feat: add stream detail view`, `fix: handle connection timeout`, or
  `refactor: simplify message remediation`.
- The pre-commit hook runs `lint-staged`, which formats and lints staged files.
- Pull requests should include a concise summary, validation commands run, linked
  issues when applicable, and screenshots or recordings for visible UI changes.
