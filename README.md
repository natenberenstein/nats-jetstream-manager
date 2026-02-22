# NATS JetStream Manager

A full-stack web application for managing and monitoring NATS JetStream clusters.

![NATS JetStream Manager](https://img.shields.io/badge/NATS-JetStream-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)

## Features

### Backend (FastAPI + nats-py)
- **Multi-cluster Support**: Connect to multiple NATS clusters simultaneously
- **Stream Management**: Full CRUD operations for JetStream streams
- **Consumer Management**: Create, view, and delete consumers with lag/backlog analytics
- **Message Operations**: Publish, batch publish, replay, search, and retrieve messages with schema validation
- **Authentication & RBAC**: User signup/login, role-based access control (Admin/Viewer/User), and invite system
- **Cluster Overview**: Cluster topology and status monitoring
- **System Observability**: Aggregate system metrics
- **Background Jobs**: Async job management for index building and other tasks
- **Auto-cleanup**: Automatic connection pool management with lifespan handling
- **API Documentation**: Auto-generated Swagger/ReDoc documentation

### Frontend (Next.js + TypeScript)
- **Modern UI**: Clean, responsive interface built with Tailwind CSS and Shadcn/ui components
- **Real-time Updates**: Auto-refresh with TanStack React Query
- **Role-based UI**: Admin/Viewer/User interfaces with protected routes
- **Dashboard**: Cluster stats, stream counts, message volume, and storage at a glance
- **Message Search**: Full message search and schema validation
- **Observability**: System metrics and monitoring page
- **User Management**: Admin panel for users, roles, and invitations
- **Dark Mode**: Built-in dark mode support
- **Form Validation**: React Hook Form + Zod for type-safe form handling
- **Data Tables**: TanStack React Table for sortable, filterable data views

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repo-url>
cd nats-jetstream-manager
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

4. Start a NATS server separately (commented out in docker-compose by default):
```bash
docker run -p 4222:4222 -p 8222:8222 nats:latest -js -m 8222
```

5. Connect to NATS:
   - Open http://localhost:3000
   - Sign up or log in
   - Add a connection using `nats://localhost:4222`

### Local Development

#### Backend (with uv)

```bash
cd backend

# One-time setup (creates venv + installs dev dependencies)
make setup

# Run the server
make run

# Or manually:
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│             │      │             │      │             │
│  Next.js    │─────▶│  FastAPI    │─────▶│    NATS     │
│  Frontend   │      │  Backend    │      │  JetStream  │
│             │      │             │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
     :3000               :8000                :4222
```

## Project Structure

```
nats-jetstream-manager/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app with lifespan & CORS
│   │   ├── api/
│   │   │   ├── deps.py          # Dependency injection (auth, db)
│   │   │   └── v1/
│   │   │       ├── router.py    # API router aggregator
│   │   │       ├── auth.py      # Auth & user endpoints
│   │   │       ├── connections.py
│   │   │       ├── streams.py
│   │   │       ├── consumers.py
│   │   │       ├── messages.py
│   │   │       ├── cluster.py
│   │   │       ├── system.py
│   │   │       └── jobs.py
│   │   ├── core/
│   │   │   ├── config.py        # Settings management
│   │   │   ├── connection_manager.py
│   │   │   └── db.py            # SQLite database init
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic models & DTOs
│   │   └── services/            # Business logic layer
│   │       ├── auth_service.py
│   │       ├── cluster_service.py
│   │       ├── consumer_service.py
│   │       ├── job_service.py
│   │       ├── message_service.py
│   │       ├── stream_service.py
│   │       └── system_service.py
│   ├── tests/
│   │   └── test_api.py
│   ├── Dockerfile
│   ├── Makefile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js app router pages
│   │   │   ├── page.tsx         # Home / login
│   │   │   ├── accept-invite/
│   │   │   └── dashboard/
│   │   │       ├── page.tsx     # Dashboard overview
│   │   │       ├── clusters/
│   │   │       ├── cluster/
│   │   │       ├── streams/
│   │   │       ├── consumers/
│   │   │       ├── messages/
│   │   │       ├── observability/
│   │   │       ├── profile/
│   │   │       └── users/
│   │   ├── components/
│   │   │   ├── ui/              # Shadcn/ui components
│   │   │   └── QueryProvider.tsx
│   │   ├── contexts/            # Auth & Connection state
│   │   ├── hooks/               # Data fetching hooks
│   │   ├── lib/                 # API client, types, utils
│   │   └── workers/             # Web workers
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

## API Endpoints

### Authentication & Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | User registration |
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/logout` | User logout |
| GET | `/api/v1/auth/me` | Get current user |
| PUT | `/api/v1/auth/me` | Update profile |
| GET | `/api/v1/users` | List users (admin) |
| PATCH | `/api/v1/users/{id}/role` | Update user role (admin) |
| POST | `/api/v1/invites` | Create invite (admin) |
| GET | `/api/v1/invites` | List invites (admin) |
| POST | `/api/v1/invites/accept` | Accept invite |

### Connections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/connections` | List connections |
| POST | `/api/v1/connections/test` | Test connection |
| POST | `/api/v1/connections/connect` | Create connection (admin) |
| GET | `/api/v1/connections/{id}/status` | Connection status |
| DELETE | `/api/v1/connections/{id}` | Delete connection (admin) |

### Streams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/connections/{id}/streams` | List streams |
| POST | `/api/v1/connections/{id}/streams` | Create stream (admin) |
| GET | `/api/v1/connections/{id}/streams/{name}` | Get stream details |
| PUT | `/api/v1/connections/{id}/streams/{name}` | Update stream (admin) |
| DELETE | `/api/v1/connections/{id}/streams/{name}` | Delete stream (admin) |
| POST | `/api/v1/connections/{id}/streams/{name}/purge` | Purge stream (admin) |

### Consumers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/connections/{id}/streams/{stream}/consumers` | List consumers |
| GET | `/api/v1/connections/{id}/streams/{stream}/consumers/analytics` | Lag/backlog analytics |
| POST | `/api/v1/connections/{id}/streams/{stream}/consumers` | Create consumer (admin) |
| GET | `/api/v1/connections/{id}/streams/{stream}/consumers/{name}` | Consumer details |
| DELETE | `/api/v1/connections/{id}/streams/{stream}/consumers/{name}` | Delete consumer (admin) |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/connections/{id}/messages/publish` | Publish message (admin) |
| POST | `/api/v1/connections/{id}/messages/batch-publish` | Batch publish (admin) |
| POST | `/api/v1/connections/{id}/messages/replay` | Replay messages (admin) |
| POST | `/api/v1/connections/{id}/messages/validate-schema` | Validate schema |
| POST | `/api/v1/connections/{id}/messages/search` | Search messages |
| GET | `/api/v1/connections/{id}/streams/{stream}/messages` | Get messages |
| GET | `/api/v1/connections/{id}/streams/{stream}/messages/{seq}` | Get message by sequence |

### Cluster & System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/connections/{id}/cluster/overview` | Cluster topology & status |
| GET | `/api/v1/connections/{id}/system/observability` | System metrics |

### Background Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/connections/{id}/jobs/index-build` | Start index build job |
| GET | `/api/v1/connections/{id}/jobs` | List jobs |
| GET | `/api/v1/connections/{id}/jobs/{job_id}` | Job status |
| POST | `/api/v1/connections/{id}/jobs/{job_id}/cancel` | Cancel job (admin) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/` | API info |

## Configuration

### Backend Environment Variables

```env
ENVIRONMENT=development
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:3000
MAX_CONNECTIONS=100
CONNECTION_TIMEOUT=300
```

### Frontend Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Development

### Makefile Targets (Backend)

```bash
make setup       # One-time setup (venv + dev dependencies)
make run         # Start dev server with hot reload
make run-debug   # Start dev server with debug logging
make test        # Run tests with pytest
make test-cov    # Run tests with coverage
make lint        # Check code with ruff
make lint-fix    # Lint and auto-fix
make format      # Format code with black
make clean       # Clean cache/coverage files
make docker-build # Build Docker image
make docker-run  # Run Docker container
make help        # Show all commands
```

### Running Tests

```bash
cd backend
make test
```

### Code Quality

Backend:
```bash
make lint
make format
```

Frontend:
```bash
cd frontend
npm run lint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript 5.4 |
| UI | Tailwind CSS 3.4, Shadcn/ui, Lucide Icons |
| State | TanStack React Query 5, React Context |
| Forms | React Hook Form 7, Zod |
| Tables | TanStack React Table 8 |
| Backend | FastAPI 0.115, Python 3.11+ |
| NATS Client | nats-py 2.7 |
| Database | SQLite |
| Validation | Pydantic 2.9 |
| Package Mgmt | uv (Python), npm (Node) |
| Deployment | Docker, Docker Compose |

## Troubleshooting

### Cannot connect to NATS

- Ensure NATS server is running: `docker ps`
- Check NATS has JetStream enabled: `-js` flag
- Verify the URL: `nats://localhost:4222` from host

### Backend connection errors

- Check backend logs: `docker-compose logs backend`
- Verify CORS settings in backend `.env`
- Ensure backend can reach NATS server

### Frontend not loading

- Check frontend logs: `docker-compose logs frontend`
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Ensure backend is running and accessible

## License

MIT

## Acknowledgments

- [NATS.io](https://nats.io/) - The messaging system
- [FastAPI](https://fastapi.tiangolo.com/) - The backend framework
- [Next.js](https://nextjs.org/) - The frontend framework
- [Tailwind CSS](https://tailwindcss.com/) - The CSS framework
- [Shadcn/ui](https://ui.shadcn.com/) - The UI component library
- [TanStack](https://tanstack.com/) - React Query & React Table
