"""Persistent state for asynchronous PDF generation jobs (table `pdf_jobs`).

State lives in the DB (not in memory) because uvicorn runs several workers and the
status poll may land on a different worker than the one running the job.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# A job that has not been updated for this long is considered dead (worker restart/crash).
STALE_JOB_SECONDS = 20 * 60

_TERMINAL = ("ready", "error")


def create_job(client, ata_id: str, advogado_id: str) -> Optional[str]:
    """Insert a queued job and return its id (None when the DB is unavailable)."""
    if not client:
        return None
    res = client.table("pdf_jobs").insert(
        {"ata_id": ata_id, "advogado_id": advogado_id, "status": "queued", "step": "queued"}
    ).execute()
    return res.data[0]["id"] if res.data else None


def update_job(client, job_id: Optional[str], **fields: Any) -> None:
    """Best-effort update; a failure here must never kill the PDF generation itself."""
    if not client or not job_id:
        return
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        client.table("pdf_jobs").update(fields).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"[PDF-JOB] {job_id}: falha ao atualizar estado {list(fields)}: {e}")


def get_job(client, job_id: str, advogado_id: str, ata_id: str) -> Optional[dict]:
    """Return the job only if it belongs to this user and ata; flags stale jobs as error."""
    res = (
        client.table("pdf_jobs").select("*")
        .eq("id", job_id).eq("advogado_id", advogado_id).eq("ata_id", ata_id)
        .execute()
    )
    if not res.data:
        return None
    job = res.data[0]
    if job["status"] not in _TERMINAL:
        try:
            updated = datetime.fromisoformat(job["updated_at"].replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - updated).total_seconds()
        except Exception:
            age = 0
        if age > STALE_JOB_SECONDS:
            msg = "A geração do PDF foi interrompida. Tente novamente."
            update_job(client, job_id, status="error", error=msg)
            job.update(status="error", error=msg)
    return job
