"""Dependency injection for API endpoints."""

from fastapi import Depends, HTTPException, Request, status
from app.core.connection_manager import connection_manager, ConnectionInfo
from app.core.config import settings
from app.services.auth_service import AuthService


async def get_connection(connection_id: str) -> ConnectionInfo:
    """
    Get a connection by ID.

    Args:
        connection_id: Connection ID

    Returns:
        ConnectionInfo object

    Raises:
        HTTPException: If connection not found
    """
    try:
        conn_info = await connection_manager.get_connection(connection_id)
        return conn_info
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection {connection_id} not found"
        )


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    token = request.headers.get("x-auth-token")
    return token.strip() if token else None


async def get_request_role(request: Request) -> str:
    """
    Resolve request role from auth token or role header.

    If auth is enabled, token validation is required.
    If auth is disabled, role falls back to X-User-Role for local development.
    """
    if settings.user_auth_enabled:
        token = _extract_bearer_token(request)
        if token:
            user = AuthService.get_user_by_session_token(token)
            if user:
                return user.role
        if AuthService.has_users():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Valid session token required",
            )
        # Bootstrap mode: before first account exists, allow admin role.
        return "admin"

    if settings.auth_enabled:
        token = _extract_bearer_token(request)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token",
            )
        if settings.admin_token and token == settings.admin_token:
            return "admin"
        if settings.viewer_token and token == settings.viewer_token:
            return "viewer"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    role = (request.headers.get("x-user-role") or "admin").lower().strip()
    return "admin" if role == "admin" else "viewer"


async def require_admin(role: str = Depends(get_request_role)) -> None:
    """Require admin role for write/destructive operations."""
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )


async def get_current_user(request: Request):
    """Return authenticated user from bearer session token."""
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    user = AuthService.get_user_by_session_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return user
