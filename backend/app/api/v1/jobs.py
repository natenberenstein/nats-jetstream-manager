"""API endpoints for background jobs."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_connection, require_admin
from app.models.schemas import IndexBuildJobRequest, JobInfo, JobListResponse
from app.services.job_service import JobService

router = APIRouter(tags=["jobs"])


@router.post(
    "/connections/{connection_id}/jobs/index-build",
    response_model=JobInfo,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_index_build_job(
    connection_id: str,
    request: IndexBuildJobRequest,
    _: None = Depends(require_admin),
):
    """Start a background index build job for message search."""
    conn_info = await get_connection(connection_id)
    try:
        job = JobService.submit_index_build_job(
            conn_info,
            stream_name=request.stream_name,
            limit=request.limit,
        )
        return JobInfo(**job)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start job: {exc}",
        ) from exc


@router.get("/connections/{connection_id}/jobs", response_model=JobListResponse)
async def list_jobs(
    connection_id: str,
    limit: int = Query(50, ge=1, le=200),
):
    """List background jobs for a connection."""
    # Validate connection exists and user can access it.
    await get_connection(connection_id)
    jobs = JobService.list_jobs(connection_id, limit=limit)
    return JobListResponse(jobs=[JobInfo(**job) for job in jobs], total=len(jobs))


@router.get("/connections/{connection_id}/jobs/{job_id}", response_model=JobInfo)
async def get_job(connection_id: str, job_id: str):
    """Get a specific job state."""
    await get_connection(connection_id)
    job = JobService.get_job(job_id, connection_id=connection_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobInfo(**job)


@router.post("/connections/{connection_id}/jobs/{job_id}/cancel", response_model=JobInfo)
async def cancel_job(
    connection_id: str,
    job_id: str,
    _: None = Depends(require_admin),
):
    """Cancel a running or pending job."""
    await get_connection(connection_id)
    job = JobService.cancel_job(job_id, connection_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobInfo(**job)
