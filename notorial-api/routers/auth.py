import hashlib
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import Optional

from database import supabase_admin
from middleware.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Pydantic Models ─────────────────────────────────────────────────────────

class CheckCPFRequest(BaseModel):
    cpf_cnpj: str = Field(..., min_length=11, max_length=18)

class SaveCPFRequest(BaseModel):
    cpf_cnpj: str = Field(..., min_length=11, max_length=18)
    device_fingerprint: str = Field(..., min_length=1)

class AuditLogRequest(BaseModel):
    acao: str = Field(..., min_length=1, max_length=100)
    device_fingerprint: str = Field(..., min_length=1)
    payload: Optional[dict] = None


# ── CPF/CNPJ Validation (Mathematical) ──────────────────────────────────────

def _only_digits(value: str) -> str:
    return "".join(c for c in value if c.isdigit())

def _validate_cpf(cpf: str) -> bool:
    """Validates a CPF using the official check-digit algorithm."""
    digits = _only_digits(cpf)
    if len(digits) != 11:
        return False
    # Reject known invalid sequences (all same digit)
    if digits == digits[0] * 11:
        return False
    # First check digit
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    remainder = (total * 10) % 11
    if remainder == 10:
        remainder = 0
    if remainder != int(digits[9]):
        return False
    # Second check digit
    total = sum(int(digits[i]) * (11 - i) for i in range(10))
    remainder = (total * 10) % 11
    if remainder == 10:
        remainder = 0
    if remainder != int(digits[10]):
        return False
    return True

def _validate_cnpj(cnpj: str) -> bool:
    """Validates a CNPJ using the official check-digit algorithm."""
    digits = _only_digits(cnpj)
    if len(digits) != 14:
        return False
    if digits == digits[0] * 14:
        return False
    weights_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    # First check digit
    total = sum(int(digits[i]) * weights_1[i] for i in range(12))
    remainder = total % 11
    check_1 = 0 if remainder < 2 else 11 - remainder
    if check_1 != int(digits[12]):
        return False
    # Second check digit
    total = sum(int(digits[i]) * weights_2[i] for i in range(13))
    remainder = total % 11
    check_2 = 0 if remainder < 2 else 11 - remainder
    if check_2 != int(digits[13]):
        return False
    return True

def _validate_cpf_cnpj(value: str) -> bool:
    """Validates either CPF (11 digits) or CNPJ (14 digits)."""
    digits = _only_digits(value)
    if len(digits) == 11:
        return _validate_cpf(digits)
    elif len(digits) == 14:
        return _validate_cnpj(digits)
    return False

def _hash_cpf(value: str) -> str:
    """Returns SHA-256 hex digest of the raw digits only."""
    digits = _only_digits(value)
    return hashlib.sha256(digits.encode("utf-8")).hexdigest()


# ── Helper: Extract Real IP ─────────────────────────────────────────────────

def _get_real_ip(request: Request) -> str:
    """Extracts the real client IP from proxy headers or falls back to direct connection."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/check-cpf")
def check_cpf(req: CheckCPFRequest, user_id: str = Depends(get_current_user_id)):
    """Validates CPF/CNPJ mathematically and checks if it's already in use."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Mathematical validation
    is_valid = _validate_cpf_cnpj(req.cpf_cnpj)
    if not is_valid:
        return {"valid": False, "available": False, "reason": "CPF/CNPJ inválido matematicamente."}

    # 2. Hash and check for duplicates
    hashed = _hash_cpf(req.cpf_cnpj)
    resp = supabase_admin.table("advogados") \
        .select("id") \
        .eq("cpf_cnpj", hashed) \
        .execute()

    already_used = bool(resp.data)

    # If it's used by the current user, that's fine
    if already_used and resp.data[0]["id"] == user_id:
        return {"valid": True, "available": True, "reason": "CPF/CNPJ já vinculado à sua conta."}

    if already_used:
        return {"valid": True, "available": False, "reason": "Este CPF/CNPJ já está vinculado a outra conta."}

    return {"valid": True, "available": True, "reason": "CPF/CNPJ válido e disponível."}


@router.post("/save-cpf")
def save_cpf(req: SaveCPFRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Saves a validated CPF/CNPJ (as SHA-256 hash) to the user's profile
    and logs the action in the audit trail."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Validate mathematically
    if not _validate_cpf_cnpj(req.cpf_cnpj):
        raise HTTPException(status_code=422, detail="CPF/CNPJ inválido matematicamente.")

    # 2. Hash
    hashed = _hash_cpf(req.cpf_cnpj)

    # 3. Check for duplicates (excluding self)
    dup_resp = supabase_admin.table("advogados") \
        .select("id") \
        .eq("cpf_cnpj", hashed) \
        .neq("id", user_id) \
        .execute()

    if dup_resp.data:
        raise HTTPException(status_code=409, detail="Este CPF/CNPJ já está vinculado a outra conta.")

    # 4. Save hash to profile
    try:
        supabase_admin.table("advogados") \
            .update({"cpf_cnpj": hashed}) \
            .eq("id", user_id) \
            .execute()
    except Exception as e:
        logger.error(f"Failed to save CPF for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar CPF/CNPJ.")

    # 5. Audit log
    real_ip = _get_real_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")
    user_resp = supabase_admin.table("advogados").select("email").eq("id", user_id).execute()
    email = user_resp.data[0]["email"] if user_resp.data else "unknown"

    try:
        supabase_admin.table("audit_logs").insert({
            "advogado_id": user_id,
            "email": email,
            "acao": "cpf_verified",
            "ip_address": real_ip,
            "user_agent": user_agent,
            "device_fingerprint": req.device_fingerprint,
            "payload": {"cpf_hash_prefix": hashed[:8]}
        }).execute()
    except Exception as e:
        # Audit log failure should not block the user
        logger.warning(f"Audit log failed for cpf_verified (user {user_id}): {e}")

    logger.info(f"CPF saved for user {user_id} (hash prefix: {hashed[:8]})")
    return {"status": "success", "message": "CPF/CNPJ salvo com sucesso."}


@router.post("/log-audit")
def log_audit(req: AuditLogRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Records an audit trail entry with IP, User Agent, and device fingerprint."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    real_ip = _get_real_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")

    # Get user email for the log
    user_resp = supabase_admin.table("advogados").select("email").eq("id", user_id).execute()
    email = user_resp.data[0]["email"] if user_resp.data else "unknown"

    try:
        supabase_admin.table("audit_logs").insert({
            "advogado_id": user_id,
            "email": email,
            "acao": req.acao,
            "ip_address": real_ip,
            "user_agent": user_agent,
            "device_fingerprint": req.device_fingerprint,
            "payload": req.payload or {}
        }).execute()
    except Exception as e:
        logger.error(f"Audit log insert failed: {e}")
        raise HTTPException(status_code=500, detail="Erro ao registrar log de auditoria.")

    return {"status": "logged"}
