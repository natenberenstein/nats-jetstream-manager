"""Main API router combining all endpoint routers."""

from fastapi import APIRouter
from app.api.v1 import connections, streams, consumers, messages, cluster, system, auth, jobs

api_router = APIRouter(prefix="/api/v1")

# Include all sub-routers
api_router.include_router(connections.router)
api_router.include_router(streams.router)
api_router.include_router(consumers.router)
api_router.include_router(messages.router)
api_router.include_router(cluster.router)
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(jobs.router)
