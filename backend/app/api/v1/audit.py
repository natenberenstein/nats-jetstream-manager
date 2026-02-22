"""API endpoints for the audit log."""

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_admin
from app.models.schemas import AuditLogEntry, AuditLogResponse
from app.services.audit_service import AuditService

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=AuditLogResponse)
async def list_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    user_id: int | None = Query(None),
    _: None = Depends(require_admin),
):
    """List audit log entries (admin only)."""
    result = AuditService.list_entries(
        limit=limit,
        offset=offset,
        action=action,
        resource_type=resource_type,
        user_id=user_id,
    )
    entries = [AuditLogEntry(**e) for e in result["entries"]]
    return AuditLogResponse(entries=entries, total=result["total"])
