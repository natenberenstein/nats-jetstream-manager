# NATS JetStream Manager

A full-stack TypeScript web application for managing, inspecting, and monitoring NATS
JetStream clusters.

![NATS JetStream Manager](https://img.shields.io/badge/NATS-JetStream-blue)
![NestJS](https://img.shields.io/badge/NestJS-11-red)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Overview

NATS JetStream Manager is an npm workspace with two applications:

- `backend/`: NestJS API built on NATS.js, TypeORM, scheduled collectors, Swagger, and pino
  logging.
- `frontend/`: Next.js App Router dashboard built with React, Tailwind CSS, shadcn/Radix UI
  primitives, TanStack Query/Table, Recharts, XYFlow, and Lucide icons.

The app connects to a live NATS server or cluster from the UI/API. The backend keeps active NATS
connections in memory, so connection IDs are process-local and do not survive backend restarts.

## Features

### Backend

- Connection lifecycle: test, create, list, inspect, and disconnect NATS JetStream connections.
- Stream operations: create, update, delete, purge, inspect state, and analyze subjects/topology.
- Consumer operations: create, update, delete, inspect, and view lag/backlog diagnostics.
- Message tools: publish, batch publish, retrieve, replay, delete, schema validate, and indexed
  search.
- Pull-consumer remediation: fetch pending messages and apply ack, nak, term, or working actions.
- Cluster and system views: topology, account/JetStream details, health checks, and observability
  signals.
- Metrics collection: scheduled stream and consumer snapshots with retention cleanup.
- Health history: scheduled connection checks and uptime summaries.
- JetStream storage management: KV buckets and object stores.
- Operations support: background jobs and audit logging for mutating actions.
- Database support: SQLite by default with PostgreSQL available through TypeORM.

### Frontend

- Dashboard with sidebar navigation, breadcrumbs, command palette, dark mode, and responsive
  layouts.
- Cluster, observability, metrics, and health pages for operational monitoring.
- Stream, subject, topology, consumer, and message workflows for JetStream inspection and changes.
- Message payload viewing, publishing, replay, deletion, schema validation, diffing, and
  remediation controls.
- KV bucket and object store management.
- Config diff and audit log views.
- TanStack Query-based caching and invalidation for backend state.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Docker and Docker Compose, if you want the included local NATS cluster

### Run Locally

Install dependencies from the repository root:

```bash
npm install
```

Start a local three-node NATS JetStream cluster:

```bash
docker-compose up -d
```

Start the backend and frontend:

```bash
npm run dev
```

Open the app and API:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8000/api/v1>
- Swagger docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

Connect to the local NATS cluster with one of these URLs:

- `nats://localhost:4222`
- `nats://localhost:4223`
- `nats://localhost:4224`

The local NATS monitoring ports are `8222`, `8223`, and `8224`.

## Development Commands

Run these commands from the repository root unless noted otherwise.

| Command                                | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| `npm install`                          | Install root and workspace dependencies.         |
| `npm run dev`                          | Run backend and frontend concurrently.           |
| `npm run dev:backend`                  | Start the NestJS backend in watch mode.          |
| `npm run dev:frontend`                 | Start the Next.js frontend.                      |
| `npm run build`                        | Build all workspaces.                            |
| `npm run lint`                         | Run ESLint for all workspaces with auto-fix.     |
| `npm run format`                       | Format source files with Prettier.               |
| `npm run format:check`                 | Check Prettier formatting without writing files. |
| `npm run test --workspace=backend`     | Run backend Jest tests.                          |
| `npm run test:cov --workspace=backend` | Run backend Jest tests with coverage.            |
| `docker-compose up -d`                 | Start the local NATS JetStream cluster only.     |

Workspace-specific commands are also available:

```bash
npm run start:dev --workspace=backend
npm run build --workspace=backend
npm run lint --workspace=backend
npm run dev --workspace=frontend
npm run build --workspace=frontend
npm run lint --workspace=frontend
```

## Project Structure

```text
.
├── backend/
│   ├── src/
│   │   ├── audit/
│   │   ├── cluster/
│   │   ├── common/
│   │   ├── connections/
│   │   ├── consumers/
│   │   ├── database/entities/
│   │   ├── health-history/
│   │   ├── jobs/
│   │   ├── kv/
│   │   ├── messages/
│   │   ├── metrics/
│   │   ├── objectstore/
│   │   ├── streams/
│   │   └── system/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── workers/
│   └── Dockerfile
├── helm/nats-jetstream-manager/
├── docker-compose.yml
└── package.json
```

## API Surface

All application API routes are under `/api/v1` except `/docs` and `/health`.

| Area         | Routes                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Connections  | `/connections`, `/connections/test`, `/connections/connect`, `/connections/:id/status`               |
| Streams      | `/connections/:connectionId/streams/*`                                                               |
| Consumers    | `/connections/:connectionId/streams/:streamName/consumers/*`                                         |
| Diagnostics  | `/connections/:connectionId/consumers/diagnostics`                                                   |
| Messages     | `/connections/:connectionId/messages/*`, `/connections/:connectionId/streams/:streamName/messages/*` |
| Remediation  | `/connections/:connectionId/streams/:streamName/consumers/:consumerName/remediation/*`               |
| Cluster      | `/connections/:connectionId/cluster/overview`                                                        |
| System       | `/connections/:connectionId/system/observability`                                                    |
| Metrics      | `/connections/:connectionId/metrics/*`                                                               |
| Health       | `/connections/:connectionId/health/history`, `/connections/:connectionId/health/uptime`              |
| Jobs         | `/connections/:connectionId/jobs/*`                                                                  |
| KV           | `/connections/:connectionId/kv/*`                                                                    |
| Object Store | `/connections/:connectionId/objectstore/*`                                                           |
| Audit        | `/audit`                                                                                             |

Swagger documentation is generated from the NestJS application at `/docs`.

## Configuration

### Backend

The backend reads environment variables through Nest config.

| Variable                  | Default                    | Description                                            |
| ------------------------- | -------------------------- | ------------------------------------------------------ |
| `PORT`                    | `8000`                     | Backend HTTP port.                                     |
| `NODE_ENV`                | unset                      | Enables production logging behavior when `production`. |
| `LOG_LEVEL`               | `debug` local, `info` prod | pino log level.                                        |
| `CORS_ORIGINS`            | `http://localhost:3000`    | Comma-separated allowed frontend origins.              |
| `DATABASE_TYPE`           | `sqlite`                   | `sqlite` or `postgres`.                                |
| `DATABASE_PATH`           | `./data/nats_manager.db`   | SQLite database path.                                  |
| `DATABASE_HOST`           | `localhost`                | PostgreSQL host.                                       |
| `DATABASE_PORT`           | `5432`                     | PostgreSQL port.                                       |
| `DATABASE_USERNAME`       | `postgres`                 | PostgreSQL username.                                   |
| `DATABASE_PASSWORD`       | empty                      | PostgreSQL password.                                   |
| `DATABASE_NAME`           | `nats_manager`             | PostgreSQL database name.                              |
| `DATABASE_SSL`            | `false`                    | Use PostgreSQL SSL with `rejectUnauthorized: false`.   |
| `TYPEORM_SYNCHRONIZE`     | local `true`, prod `false` | Auto-sync entity definitions to the database schema.   |
| `CONNECTION_TIMEOUT`      | `300`                      | Inactive NATS connection timeout in seconds.           |
| `METRICS_RETENTION_HOURS` | `24`                       | Stream and consumer metric retention window.           |
| `HEALTH_RETENTION_DAYS`   | `7`                        | Health-history retention window.                       |

### Frontend

| Variable              | Default                 | Description       |
| --------------------- | ----------------------- | ----------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL. |

## Database

SQLite is the default development database. The backend creates the SQLite directory if it does not
exist and uses TypeORM `synchronize: true` to keep local tables aligned with entity definitions.

Set `DATABASE_TYPE=postgres` and the PostgreSQL variables above to run against PostgreSQL. PostgreSQL
is the safer choice for replicated backend deployments.

## Docker and Kubernetes

`docker-compose.yml` starts a local NATS JetStream cluster for development. It does not start the
backend or frontend application containers.

Application images are built with:

- `backend/Dockerfile`: multi-stage NestJS build that runs `node dist/main` as a non-root user.
- `frontend/Dockerfile`: standalone Next.js build that injects `NEXT_PUBLIC_API_URL` at container
  startup through `frontend/docker-entrypoint.sh`.

Install the Helm chart:

```bash
helm install nats-manager ./helm/nats-jetstream-manager
```

Render the chart before changing templates:

```bash
helm template test ./helm/nats-jetstream-manager
```

The chart includes separate backend and frontend deployments, services, ingress, configmaps, secrets,
optional SQLite persistence, PostgreSQL settings, HPA, PDB, and network policy support.

## Testing

Backend tests use Jest with `ts-jest` and live near the code under test as `*.spec.ts` files.

```bash
npm run test --workspace=backend
npm run test:cov --workspace=backend
```

There is no frontend test runner configured yet. Validate frontend changes with:

```bash
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

For cross-stack API changes, run backend tests and the frontend build.

## Release and Publishing

Release automation uses release-please from `.github/workflows/release-please.yml`. Docker image and
Helm chart publishing workflows are in `.github/workflows/docker-publish.yml` and
`.github/workflows/helm-publish.yml`.

Published Helm charts are available from:

```bash
helm repo add nats-jetstream-manager https://natenberenstein.github.io/nats-jetstream-manager
helm install nats-jetstream-manager nats-jetstream-manager/nats-jetstream-manager
```

Argo CD can consume the published chart with `repoURL`,
`chart: nats-jetstream-manager`, and `targetRevision` set to the chart version.

Commit messages are checked with Conventional Commits through commitlint and Husky.

## Security Notes

- Do not commit credentials, tokens, NATS secrets, database URLs, or local database files.
- Prefer environment variables or Kubernetes secrets for sensitive configuration.
- The frontend only uses `NEXT_PUBLIC_*` variables, which are exposed to browser code.

## License

MIT
