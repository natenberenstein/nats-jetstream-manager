"""Authentication, profile, invites, and user admin endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import get_current_user, require_admin
from app.models.schemas import (
    AuthSessionResponse,
    InviteAcceptRequest,
    InviteCreateRequest,
    InviteInfo,
    LoginRequest,
    ProfileUpdateRequest,
    SignUpRequest,
    UpdateUserRoleRequest,
    UserProfile,
)
from app.services.auth_service import AuthService

router = APIRouter(tags=["auth"])


@router.post("/auth/signup", response_model=AuthSessionResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignUpRequest):
    try:
        user = AuthService.create_user(
            email=request.email,
            password=request.password,
            full_name=request.full_name,
        )
        session = AuthService.create_session(user.id)
        return AuthSessionResponse(
            token=session["token"],
            expires_at=session["expires_at"],
            user=UserProfile(**AuthService.serialize_user(user)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/auth/login", response_model=AuthSessionResponse)
async def login(request: LoginRequest):
    user = AuthService.authenticate(request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    session = AuthService.create_session(user.id)
    return AuthSessionResponse(
        token=session["token"],
        expires_at=session["expires_at"],
        user=UserProfile(**AuthService.serialize_user(user)),
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(http_request: Request):
    auth_header = http_request.headers.get("authorization", "")
    token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else None
    if token:
        AuthService.revoke_session(token)


@router.get("/auth/me", response_model=UserProfile)
async def me(current_user=Depends(get_current_user)):
    return UserProfile(**AuthService.serialize_user(current_user))


@router.put("/auth/me", response_model=UserProfile)
async def update_profile(request: ProfileUpdateRequest, current_user=Depends(get_current_user)):
    updated = AuthService.update_profile(current_user.id, request.full_name)
    return UserProfile(**AuthService.serialize_user(updated))


@router.get("/users", response_model=list[UserProfile])
async def list_users(_: None = Depends(require_admin)):
    users = AuthService.list_users()
    return [UserProfile(**user) for user in users]


@router.patch("/users/{user_id}/role", response_model=UserProfile)
async def update_role(
    user_id: int,
    request: UpdateUserRoleRequest,
    _: None = Depends(require_admin),
):
    try:
        updated = AuthService.update_user_role(user_id, request.role)
        return UserProfile(**updated)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/invites", response_model=InviteInfo, status_code=status.HTTP_201_CREATED)
async def create_invite(
    request: InviteCreateRequest,
    current_user=Depends(get_current_user),
    _: None = Depends(require_admin),
):
    try:
        invite = AuthService.create_invite(
            email=request.email,
            role=request.role,
            cluster_name=request.cluster_name,
            expires_hours=request.expires_hours,
            invited_by_user_id=current_user.id,
        )
        return InviteInfo(**invite)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/invites", response_model=list[InviteInfo])
async def list_invites(_: None = Depends(require_admin)):
    invites = AuthService.list_invites()
    return [InviteInfo(**invite) for invite in invites]


@router.post("/invites/accept", response_model=AuthSessionResponse)
async def accept_invite(request: InviteAcceptRequest):
    try:
        result = AuthService.accept_invite(
            token=request.token,
            password=request.password,
            full_name=request.full_name,
        )
        return AuthSessionResponse(
            token=result["token"],
            expires_at=result["expires_at"],
            user=UserProfile(**result["user"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
