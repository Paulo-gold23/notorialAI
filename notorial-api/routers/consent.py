import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import Optional

from database import supabase_admin
from middleware.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/consent", tags=["Consent"])


# ── Models ──────────────────────────────────────────────────────────────────

class ConsentAcceptRequest(BaseModel):
    consent_type: str = Field(..., description="Type: terms, privacy, responsibility, marketing")
    terms_version: Optional[str] = Field(None, description="Version being accepted (e.g., '2.3')")
    ata_id: Optional[str] = Field(None, description="Associated ata ID (for responsibility consent)")
    device_fingerprint: Optional[str] = None


# ── Constants ───────────────────────────────────────────────────────────────

CURRENT_TERMS_VERSION = "2.3"
VALID_CONSENT_TYPES = {"terms", "privacy", "responsibility", "marketing"}


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/accept")
def accept_consent(
    body: ConsentAcceptRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """Record a granular consent with IP, User-Agent, fingerprint, and version."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if body.consent_type not in VALID_CONSENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Tipo de consentimento inválido: {body.consent_type}")
    
    version = body.terms_version or CURRENT_TERMS_VERSION
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    ua = request.headers.get("user-agent", "unknown")
    
    try:
        # Resolve terms_version_id
        terms_version_id = None
        if body.consent_type != "marketing":
            tv_result = supabase_admin.table("terms_versions").select("id").eq(
                "type", body.consent_type
            ).eq("version", version).execute()
            if tv_result.data:
                terms_version_id = tv_result.data[0]["id"]
        
        # Insert consent record
        record = {
            "advogado_id": user_id,
            "consent_type": body.consent_type,
            "terms_version_id": terms_version_id,
            "ip_address": ip,
            "user_agent": ua,
            "device_fingerprint": body.device_fingerprint or "",
        }
        if body.ata_id:
            record["ata_id"] = body.ata_id
        
        supabase_admin.table("consent_records").insert(record).execute()
        
        # Update advogados table for quick lookups
        if body.consent_type in ("terms", "privacy"):
            supabase_admin.table("advogados").update({
                "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
                "terms_version": version,
            }).eq("id", user_id).execute()
        elif body.consent_type == "marketing":
            supabase_admin.table("advogados").update({
                "marketing_consent": True,
            }).eq("id", user_id).execute()
        
        # Audit log
        try:
            supabase_admin.table("audit_logs").insert({
                "advogado_id": user_id,
                "acao": f"consent_{body.consent_type}_accepted",
                "ip_address": ip,
                "user_agent": ua,
                "device_fingerprint": body.device_fingerprint or "",
                "payload": {"version": version, "consent_type": body.consent_type},
            }).execute()
        except Exception as e:
            logger.warning(f"Audit log failed for consent (user {user_id}): {e}")
        
        return {"status": "success", "message": f"Consentimento '{body.consent_type}' registrado com sucesso."}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to record consent for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao registrar consentimento.")


@router.get("/status")
def get_consent_status(user_id: str = Depends(get_current_user_id)):
    """Check if the user needs to re-accept any terms (version mismatch)."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        # Get current versions
        versions_result = supabase_admin.table("terms_versions").select("type, version").execute()
        current_versions = {v["type"]: v["version"] for v in (versions_result.data or [])}
        
        # Get user's profile
        profile = supabase_admin.table("advogados").select(
            "terms_accepted_at, terms_version, marketing_consent"
        ).eq("id", user_id).single().execute()
        
        user_data = profile.data or {}
        user_version = user_data.get("terms_version")
        
        # Check if re-acceptance is needed
        needs_reaccept = False
        if not user_version:
            needs_reaccept = True
        else:
            for doc_type in ("terms", "privacy"):
                current = current_versions.get(doc_type, CURRENT_TERMS_VERSION)
                if user_version != current:
                    needs_reaccept = True
                    break
        
        return {
            "current_version": CURRENT_TERMS_VERSION,
            "user_version": user_version,
            "terms_accepted_at": user_data.get("terms_accepted_at"),
            "marketing_consent": user_data.get("marketing_consent", False),
            "needs_reaccept": needs_reaccept,
        }
    except Exception as e:
        logger.error(f"Failed to get consent status for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao consultar status de consentimento.")


@router.get("/history")
def get_consent_history(user_id: str = Depends(get_current_user_id)):
    """Return all consent records for the authenticated user."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        result = supabase_admin.table("consent_records").select(
            "id, consent_type, accepted_at, revoked_at, terms_version_id"
        ).eq("advogado_id", user_id).order("accepted_at", desc=True).limit(50).execute()
        
        return {"records": result.data or []}
    except Exception as e:
        logger.error(f"Failed to get consent history for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao consultar histórico de consentimento.")
