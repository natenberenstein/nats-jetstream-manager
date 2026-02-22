"""Main API router combining all endpoint routers."""

from fastapi import APIRouter
from app.api.v1 import connections, streams, consumers, messages, cluster, system, auth, jobs
from app.api.v1 import metrics, health_history, audit

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
api_router.include_router(metrics.router)
api_router.include_router(health_history.router)
api_router.include_router(audit.router)
