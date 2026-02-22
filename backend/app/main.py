"""FastAPI application with lifespan management."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.connection_manager import connection_manager
from app.api.v1.router import api_router
from app.models.schemas import HealthResponse
from app.core.db import init_db

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Handles:
    - Starting the connection manager
    - Cleaning up all connections on shutdown
    """
    # Startup
    logger.info("Starting NATS JetStream Manager application")
    init_db()
    logger.info("Database initialized")
    await connection_manager.start()
    logger.info("Connection manager started")

    yield

    # Shutdown
    logger.info("Shutting down NATS JetStream Manager application")
    await connection_manager.stop()
    logger.info("Connection manager stopped")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="A web-based management interface for NATS JetStream clusters",
    lifespan=lifespan
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
    return HealthResponse(
        status="healthy",
        version=settings.version
    )


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
        "health": "/health"
    }
