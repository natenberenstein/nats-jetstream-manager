# NATS JetStream Manager - Backend

FastAPI backend for managing NATS JetStream clusters.

## Features

- **Multi-cluster Support**: Connect to multiple NATS clusters simultaneously
- **Stream Management**: Create, read, update, delete, and purge streams
- **Consumer Management**: Full CRUD operations for consumers
- **Message Operations**: Publish, batch publish, and retrieve messages
- **Connection Pool**: Automatic cleanup of stale connections
- **Type-Safe**: Pydantic models for all requests and responses

## Quick Start

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer
- NATS server with JetStream enabled

### Installation with uv (Recommended)

1. Install uv if you haven't already:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Create virtual environment and install dependencies:
```bash
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e .
```

3. For development dependencies:
```bash
uv pip install -e ".[dev]"
```

4. Create `.env` file:
```bash
cp .env.example .env
```

5. Run the development server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Alternative: Traditional pip Installation

```bash
python -m venv venv
source venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

### Using Docker

Build and run with Docker:
```bash
docker build -t nats-manager-backend .
docker run -p 8000:8000 nats-manager-backend
```

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoints

### Connections
- `POST /api/v1/connections/test` - Test NATS connection
- `POST /api/v1/connections/connect` - Create connection session
- `GET /api/v1/connections/{id}/status` - Get connection status
- `DELETE /api/v1/connections/{id}` - Disconnect

### Streams
- `GET /api/v1/connections/{id}/streams` - List streams
- `POST /api/v1/connections/{id}/streams` - Create stream
- `GET /api/v1/connections/{id}/streams/{name}` - Get stream details
- `PUT /api/v1/connections/{id}/streams/{name}` - Update stream
- `DELETE /api/v1/connections/{id}/streams/{name}` - Delete stream
- `POST /api/v1/connections/{id}/streams/{name}/purge` - Purge stream

### Consumers
- `GET /api/v1/connections/{id}/streams/{stream}/consumers` - List consumers
- `POST /api/v1/connections/{id}/streams/{stream}/consumers` - Create consumer
- `GET /api/v1/connections/{id}/streams/{stream}/consumers/{name}` - Get consumer
- `DELETE /api/v1/connections/{id}/streams/{stream}/consumers/{name}` - Delete consumer

### Messages
- `POST /api/v1/connections/{id}/messages/publish` - Publish message
- `POST /api/v1/connections/{id}/messages/publish-batch` - Publish batch
- `GET /api/v1/connections/{id}/streams/{stream}/messages` - Get messages
- `GET /api/v1/connections/{id}/streams/{stream}/messages/{seq}` - Get specific message

## Architecture

```
app/
├── api/              # API endpoints
│   ├── deps.py       # Dependency injection
│   └── v1/           # API v1 routes
├── core/             # Core functionality
│   ├── config.py     # Application settings
│   └── connection_manager.py  # Connection pool
├── models/           # Pydantic schemas
├── services/         # Business logic
└── main.py           # FastAPI application
```

## Configuration

Environment variables (`.env`):

- `ENVIRONMENT` - development/production
- `LOG_LEVEL` - Logging level (debug/info/warning/error)
- `CORS_ORIGINS` - Allowed CORS origins (comma-separated)
- `MAX_CONNECTIONS` - Maximum concurrent connections
- `CONNECTION_TIMEOUT` - Connection timeout in seconds

## Testing

Install dev dependencies first:
```bash
uv pip install -e ".[dev]"
```

Run tests:
```bash
pytest
```

With coverage:
```bash
pytest --cov=app --cov-report=html
```

## Development

### Code Style

Format code with black:
```bash
black app/
```

Lint with ruff (faster alternative to flake8):
```bash
ruff check app/
```

Auto-fix issues:
```bash
ruff check --fix app/
```

### Using uv for Dependency Management

Add a new dependency:
```bash
uv pip install package-name
uv pip freeze > requirements.txt  # If you need requirements.txt
```

Or add to `pyproject.toml` and run:
```bash
uv pip install -e .
```

Update all dependencies:
```bash
uv pip install --upgrade -e .
```

### Adding New Endpoints

1. Create service method in `services/`
2. Add endpoint in `api/v1/`
3. Update router in `api/v1/router.py`
4. Add tests in `tests/`

## License

MIT
