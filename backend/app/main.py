"""FastAPI application with lifespan management."""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.connection_manager import connection_manager
from app.api.v1.router import api_router
from app.models.schemas import HealthResponse
from app.core.db import init_db
from app.services.metrics_service import MetricsService
from app.services.health_service import HealthService

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


async def _metrics_collection_loop():
    """Background task: collect stream metrics and health checks, prune old data."""
    interval = settings.metrics_collection_interval
    while True:
        try:
            await asyncio.sleep(interval)
            await MetricsService.collect_all_snapshots()
            await HealthService.check_all_connections()
            MetricsService.prune_old_metrics()
            HealthService.prune_old_records()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in metrics collection loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Handles:
    - Starting the connection manager
    - Starting the metrics collection background task
    - Cleaning up all connections on shutdown
    """
    # Startup
    logger.info("Starting NATS JetStream Manager application")
    init_db()
    logger.info("Database initialized")
    await connection_manager.start()
    logger.info("Connection manager started")

    metrics_task = asyncio.create_task(_metrics_collection_loop())
    logger.info("Metrics collection loop started")

    yield

    # Shutdown
    logger.info("Shutting down NATS JetStream Manager application")
    metrics_task.cancel()
    try:
        await metrics_task
    except asyncio.CancelledError:
        pass
    logger.info("Metrics collection loop stopped")
    await connection_manager.stop()
    logger.info("Connection manager stopped")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="A web-based management interface for NATS JetStream clusters",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """
    Health check endpoint.

    Returns:
        Application health status and version
    """
    return HealthResponse(status="healthy", version=settings.version)


@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint.

    Returns:
        Welcome message
    """
    return {
        "message": "NATS JetStream Manager API",
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
    }
