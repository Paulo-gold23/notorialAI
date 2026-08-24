import os
import hashlib
import hmac
import logging
import secrets
import string
import smtplib
try:
    import bcrypt
    _HAS_BCRYPT = True
except ImportError:
    bcrypt = None
    _HAS_BCRYPT = False

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import Optional

from database import supabase_admin
from middleware.auth import get_current_user_id
from config import settings
from services.limiter import limiter, get_real_client_ip
from services.log_utils import mask_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Helpers for Signature PIN ───────────────────────────────────────────────

def _hash_pin(pin: str, salt: str) -> str:
    """Hash a PIN using bcrypt (computationally expensive, brute-force resistant).
    The salt parameter is ignored for bcrypt (it generates its own), 
    but kept for API compatibility."""
    if _HAS_BCRYPT and bcrypt:
        return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    # Fallback if bcrypt C-extension is missing in local environment
    return hashlib.sha256((pin + salt).encode("utf-8")).hexdigest()

def _verify_pin(pin: str, stored_hash: str, salt: str, auto_upgrade_user_id: str = None) -> bool:
    """Verify a PIN against its stored hash.
    Supports both bcrypt (new) and SHA-256 (legacy) hashes.
    
    If auto_upgrade_user_id is provided and a legacy hash matches,
    the hash is transparently upgraded to bcrypt in the database.
    """
    # Try bcrypt first (new format starts with $2b$)
    if (stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$")) and _HAS_BCRYPT and bcrypt:
        return bcrypt.checkpw(pin.encode("utf-8"), stored_hash.encode("utf-8"))
    
    # Fallback: legacy SHA-256 hash (4-digit PIN + user_id as salt = trivially crackable)
    legacy_hash = hashlib.sha256((pin + salt).encode("utf-8")).hexdigest()
    is_valid = hmac.compare_digest(legacy_hash, stored_hash)
    
    # Auto-upgrade: re-hash with bcrypt and persist if the legacy hash matched
    if is_valid and auto_upgrade_user_id:
        try:
            new_hash = _hash_pin(pin, salt)
            supabase_admin.table("advogados") \
                .update({"senha_assinatura_hash": new_hash}) \
                .eq("id", auto_upgrade_user_id) \
                .execute()
            logger.info(f"[SECURITY] Auto-upgraded legacy PIN hash to bcrypt for user {auto_upgrade_user_id}")
        except Exception as e:
            logger.warning(f"[SECURITY] Failed to auto-upgrade PIN hash for user {auto_upgrade_user_id}: {e}")
    
    return is_valid

def _hash_token(token: str) -> str:
    """SHA-256 hash of a 6-digit email verification token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _is_expired(exp_str: Optional[str]) -> bool:
    """Checks if a timestamp string from PostgreSQL/Supabase has expired."""
    if not exp_str:
        return True
    try:
        # Standardize 'Z' to UTC offset representation
        cleaned = exp_str.replace("Z", "+00:00")
        exp_dt = datetime.fromisoformat(cleaned)
        return datetime.now(timezone.utc) > exp_dt
    except Exception as e:
        logger.error(f"Error parsing date {exp_str}: {e}")
        return True

def _send_reset_email(to_email: str, token: str) -> bool:
    """Sends the 6-digit PIN reset token via SMTP or Resend API (HTTP)."""
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #111827; margin: 0;">LegisVox</h2>
                <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">Segurança e Compliance</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin-bottom: 20px;" />
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">Olá,</p>
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">Você solicitou a redefinição de seu PIN de confirmação de 4 dígitos no LegisVox.</p>
            <p style="color: #374151; font-size: 16px; line-height: 1.5;">Utilize o código de verificação abaixo para desbloquear e cadastrar um novo PIN de confirmação:</p>
            <div style="background-color: #f9fafb; border: 1px solid #d1d5db; padding: 15px; border-radius: 6px; text-align: center; margin: 25px 0;">
                <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e3a8a;">{token}</span>
            </div>
            <p style="color: #ef4444; font-size: 13px; line-height: 1.5; font-weight: 500;">Este código expira em 15 minutos.</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin-top: 25px; margin-bottom: 15px;" />
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">Se você não solicitou esta alteração, desconsidere este e-mail.</p>
        </div>
    </body>
    </html>
    """

    # If Resend API Key is configured, use the HTTP API to send the email (prevents Render's port blocks)
    if settings.RESEND_API_KEY:
        try:
            url = "https://api.resend.com/emails"
            headers = {
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "from": settings.SMTP_FROM,
                "to": [to_email],
                "subject": "LegisVox - Redefinição de PIN de Confirmação",
                "html": html_content
            }
            with httpx.Client(timeout=10) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code in [200, 201]:
                    logger.info(f"Signature PIN reset email sent to {mask_email(to_email)} via Resend API")
                    return True
                else:
                    logger.error(f"Resend API failed with status {resp.status_code}: {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send signature reset email via Resend API to {mask_email(to_email)}: {e}")
            return False

    # Otherwise, fallback/default to classic SMTP
    if not settings.SMTP_USER or settings.SMTP_USER == "dummy-user":
        logger.warning("SMTP not configured or dummy user. Reset token email could not be sent.")
        return False
        
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "LegisVox - Redefinição de PIN de Confirmação"
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html"))
        
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            if settings.SMTP_PORT == 587 or settings.SMTP_PORT == 2525:
                server.starttls()
                
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            
        server.sendmail(settings.SMTP_FROM, [to_email], msg.as_string())
        server.quit()
        logger.info(f"Signature PIN reset email sent to {mask_email(to_email)} via SMTP")
        return True
    except Exception as e:
        logger.error(f"Failed to send signature reset email to {mask_email(to_email)}: {e}")
        return False


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

class SignaturePinSetRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=4)
    device_fingerprint: str = Field(..., min_length=1)
    current_pin: Optional[str] = Field(None, min_length=4, max_length=4)

class SignaturePinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=4)
    device_fingerprint: str = Field(..., min_length=1)

class SignaturePinForgotRequest(BaseModel):
    device_fingerprint: str = Field(..., min_length=1)

class SignaturePinResetRequest(BaseModel):
    token: str = Field(..., min_length=6, max_length=6)
    new_pin: str = Field(..., min_length=4, max_length=4)
    device_fingerprint: str = Field(..., min_length=1)


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
    """Returns HMAC-SHA256 hex digest of the raw digits using a server-side secret.
    Uses HMAC instead of plain SHA-256 to prevent rainbow table attacks on the
    small CPF/CNPJ keyspace (11-14 digits). The secret key ensures that even with
    full database access, an attacker cannot reverse the hashes without the key."""
    digits = _only_digits(value)
    secret = os.getenv("CPF_HASH_SECRET", settings.SUPABASE_SERVICE_KEY or "legisvox-cpf-default-key")
    return hmac.new(secret.encode("utf-8"), digits.encode("utf-8"), hashlib.sha256).hexdigest()


# ── Helper: Extract Real IP ─────────────────────────────────────────────────
# Uses get_real_client_ip from services.limiter (validates Cloudflare/Docker CIDRs)

# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/check-cpf")
@limiter.limit("10/minute")
def check_cpf(req: CheckCPFRequest, request: Request, user_id: str = Depends(get_current_user_id)):
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
@limiter.limit("5/minute")
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

    # 4. Save hash to profile and retrieve email in single roundtrip
    email = "unknown"
    try:
        up_resp = supabase_admin.table("advogados") \
            .update({"cpf_cnpj": hashed}) \
            .eq("id", user_id) \
            .execute()
        if up_resp.data:
            email = up_resp.data[0].get("email", "unknown")
    except Exception as e:
        logger.error(f"Failed to save CPF for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar CPF/CNPJ.")

    # 5. Audit log
    real_ip = get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")

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

    real_ip = get_real_client_ip(request)
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


@router.post("/signature-pin/set")
@limiter.limit("5/minute")
def set_signature_pin(req: SignaturePinSetRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Sets or updates the lawyer's signature PIN."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not req.pin.isdigit():
        raise HTTPException(status_code=422, detail="O PIN de confirmação deve conter apenas números.")
        
    # Check if lawyer already has a PIN
    adv_resp = supabase_admin.table("advogados") \
        .select("senha_assinatura_hash", "senha_assinatura_bloqueado", "senha_assinatura_erros", "email") \
        .eq("id", user_id) \
        .execute()
        
    if not adv_resp.data:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        
    advogado = adv_resp.data[0]
    email = advogado.get("email") or "unknown"
    
    if advogado.get("senha_assinatura_bloqueado"):
        raise HTTPException(
            status_code=403,
            detail="Seu PIN de confirmação está bloqueado devido a excesso de tentativas incorretas. Redefina-o por e-mail."
        )
        
    has_existing_pin = bool(advogado.get("senha_assinatura_hash"))
    
    if has_existing_pin:
        if not req.current_pin:
            raise HTTPException(status_code=400, detail="O PIN de confirmação atual é obrigatório para alteração.")
            
        if not req.current_pin.isdigit():
            raise HTTPException(status_code=422, detail="A senha atual deve conter apenas números.")
            
        if not _verify_pin(req.current_pin, advogado["senha_assinatura_hash"], user_id, auto_upgrade_user_id=user_id):
            novos_erros = (advogado.get("senha_assinatura_erros") or 0) + 1
            bloquear = (novos_erros >= 5)
            
            try:
                supabase_admin.table("advogados") \
                    .update({
                        "senha_assinatura_erros": novos_erros,
                        "senha_assinatura_bloqueado": bloquear
                    }) \
                    .eq("id", user_id) \
                    .execute()
            except Exception as e:
                logger.error(f"Failed to update error count on PIN change (user {user_id}): {e}")
                
            real_ip = get_real_client_ip(request)
            user_agent = request.headers.get("user-agent", "unknown")
            acao = "tentativa_assinatura_bloqueada" if bloquear else "tentativa_assinatura_falha"
            try:
                supabase_admin.table("audit_logs").insert({
                    "advogado_id": user_id,
                    "email": email,
                    "acao": acao,
                    "ip_address": real_ip,
                    "user_agent": user_agent,
                    "device_fingerprint": req.device_fingerprint,
                    "payload": {"context": "change_password", "errors": novos_erros}
                }).execute()
            except Exception as audit_err:
                logger.warning(f"Audit log failed for PIN change error (user {user_id}): {audit_err}")
                
            if bloquear:
                raise HTTPException(
                    status_code=403, 
                    detail="PIN de confirmação bloqueado devido a excesso de tentativas incorretas. Redefina-o por e-mail."
                )
            else:
                raise HTTPException(status_code=400, detail="PIN de confirmação atual incorreto.")
                
    hashed_pin = _hash_pin(req.pin, user_id)
    
    try:
        supabase_admin.table("advogados") \
            .update({
                "senha_assinatura_hash": hashed_pin,
                "senha_assinatura_erros": 0,
                "senha_assinatura_bloqueado": False
            }) \
            .eq("id", user_id) \
            .execute()
    except Exception as e:
        logger.error(f"Failed to set signature PIN for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar PIN de confirmação.")
        
    real_ip = get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")
    
    try:
        supabase_admin.table("audit_logs").insert({
            "advogado_id": user_id,
            "email": email,
            "acao": "senha_assinatura_redefinida" if has_existing_pin else "senha_assinatura_criada",
            "ip_address": real_ip,
            "user_agent": user_agent,
            "device_fingerprint": req.device_fingerprint,
            "payload": {"status": "updated" if has_existing_pin else "created"}
        }).execute()
    except Exception as e:
        logger.warning(f"Audit log failed for PIN creation/update (user {user_id}): {e}")
        
    return {"status": "success", "message": "PIN de confirmação cadastrado com sucesso."}


@router.get("/signature-pin/status")
def get_signature_pin_status(user_id: str = Depends(get_current_user_id)):
    """Returns whether the lawyer already has a signature PIN set and if it's locked.
    Does NOT expose the hash itself — safe to call from the frontend."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    adv_resp = supabase_admin.table("advogados") \
        .select("senha_assinatura_hash", "senha_assinatura_bloqueado", "senha_assinatura_erros") \
        .eq("id", user_id) \
        .execute()

    if not adv_resp.data:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")

    advogado = adv_resp.data[0]
    return {
        "has_pin": bool(advogado.get("senha_assinatura_hash")),
        "bloqueado": bool(advogado.get("senha_assinatura_bloqueado")),
        "tentativas_restantes": max(0, 5 - (advogado.get("senha_assinatura_erros") or 0)),
    }


@router.post("/signature-pin/verify")
@limiter.limit("5/minute")
def verify_signature_pin(req: SignaturePinVerifyRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Verifies the lawyer's signature PIN and locks the account on 5 consecutive failures."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    real_ip = get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")
    user_resp = supabase_admin.table("advogados") \
        .select("email", "senha_assinatura_hash", "senha_assinatura_erros", "senha_assinatura_bloqueado") \
        .eq("id", user_id) \
        .execute()
        
    if not user_resp.data:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        
    advogado = user_resp.data[0]
    email = advogado["email"]
    
    if advogado["senha_assinatura_bloqueado"]:
        raise HTTPException(status_code=403, detail="PIN de confirmação bloqueado. Redefina-o por e-mail.")
        
    if not advogado["senha_assinatura_hash"]:
        raise HTTPException(status_code=400, detail="PIN de confirmação não cadastrado.")
        
    is_correct = _verify_pin(req.pin, advogado["senha_assinatura_hash"], user_id, auto_upgrade_user_id=user_id)
    
    if is_correct:
        try:
            supabase_admin.table("advogados") \
                .update({"senha_assinatura_erros": 0}) \
                .eq("id", user_id) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to reset errors for user {user_id}: {e}")
            
        try:
            supabase_admin.table("audit_logs").insert({
                "advogado_id": user_id,
                "email": email,
                "acao": "documento_assinado_sucesso",
                "ip_address": real_ip,
                "user_agent": user_agent,
                "device_fingerprint": req.device_fingerprint,
                "payload": {"status": "success"}
            }).execute()
        except Exception as e:
            logger.warning(f"Audit log failed for document signing (user {user_id}): {e}")
            
        return {"status": "success", "message": "PIN de confirmação validado."}
    else:
        novos_erros = advogado["senha_assinatura_erros"] + 1
        bloquear = (novos_erros >= 5)
        
        try:
            supabase_admin.table("advogados") \
                .update({
                    "senha_assinatura_erros": novos_erros,
                    "senha_assinatura_bloqueado": bloquear
                }) \
                .eq("id", user_id) \
                .execute()
        except Exception as e:
            logger.error(f"Failed to update PIN error count for user {user_id}: {e}")
            
        acao = "tentativa_assinatura_bloqueada" if bloquear else "tentativa_assinatura_falha"
        try:
            supabase_admin.table("audit_logs").insert({
                "advogado_id": user_id,
                "email": email,
                "acao": acao,
                "ip_address": real_ip,
                "user_agent": user_agent,
                "device_fingerprint": req.device_fingerprint,
                "payload": {"tentativas_falhas": novos_erros}
            }).execute()
        except Exception as e:
            logger.warning(f"Audit log failed for failed signature attempt (user {user_id}): {e}")
            
        if bloquear:
            raise HTTPException(status_code=403, detail="PIN de confirmação bloqueado por excesso de tentativas incorretas. Por favor, redefina-a por e-mail.")
            
        raise HTTPException(status_code=401, detail=f"PIN de confirmação incorreto. Você tem mais {5 - novos_erros} tentativa(s) antes do bloqueio.")


@router.post("/signature-pin/forgot")
@limiter.limit("3/minute")
def forgot_signature_pin(req: SignaturePinForgotRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Generates a 6-digit verification token and emails it to the logged in user."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    real_ip = get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")
    token = "".join(secrets.choice(string.digits) for _ in range(6))
    hashed_token = _hash_token(token)
    exp_time = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    
    try:
        up_resp = supabase_admin.table("advogados") \
            .update({
                "senha_assinatura_token_hash": hashed_token,
                "senha_assinatura_token_exp": exp_time
            }) \
            .eq("id", user_id) \
            .execute()
        if not up_resp.data:
            raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        email = up_resp.data[0]["email"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save reset token for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar token de recuperação.")
        
    sent = _send_reset_email(email, token)
    
    response_payload = {"status": "success", "message": "Código de recuperação enviado para o seu e-mail."}
    if not sent:
        logger.warning(f"SMTP failed to send reset token to {email}. Token is NOT returned in response body.")
        
    try:
        supabase_admin.table("audit_logs").insert({
            "advogado_id": user_id,
            "email": email,
            "acao": "senha_assinatura_token_solicitado",
            "ip_address": real_ip,
            "user_agent": user_agent,
            "device_fingerprint": req.device_fingerprint,
            "payload": {"email_sent": sent}
        }).execute()
    except Exception as e:
        logger.warning(f"Audit log failed for PIN forgot (user {user_id}): {e}")
        
    return response_payload


@router.post("/signature-pin/reset")
@limiter.limit("5/minute")
def reset_signature_pin(req: SignaturePinResetRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Resets the PIN using the 6-digit verification token, unlocking the account."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    if not req.new_pin.isdigit():
        raise HTTPException(status_code=422, detail="O PIN de confirmação deve conter apenas números.")
        
    real_ip = get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "unknown")
    user_resp = supabase_admin.table("advogados") \
        .select("email", "senha_assinatura_token_hash", "senha_assinatura_token_exp") \
        .eq("id", user_id) \
        .execute()
      
    if not user_resp.data:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        
    advogado = user_resp.data[0]
    email = advogado["email"]
    
    if not advogado["senha_assinatura_token_hash"]:
        raise HTTPException(status_code=400, detail="Nenhum token de redefinição pendente.")
        
    hashed_input_token = _hash_token(req.token)
    if hashed_input_token != advogado["senha_assinatura_token_hash"]:
        raise HTTPException(status_code=400, detail="Código de recuperação inválido.")
        
    if _is_expired(advogado["senha_assinatura_token_exp"]):
        raise HTTPException(status_code=400, detail="Código de recuperação expirado.")
        
    new_pin_hash = _hash_pin(req.new_pin, user_id)
    
    try:
        supabase_admin.table("advogados") \
            .update({
                "senha_assinatura_hash": new_pin_hash,
                "senha_assinatura_erros": 0,
                "senha_assinatura_bloqueado": False,
                "senha_assinatura_token_hash": None,
                "senha_assinatura_token_exp": None
            }) \
            .eq("id", user_id) \
            .execute()
    except Exception as e:
        logger.error(f"Failed to reset signature PIN for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao redefinir o PIN de confirmação.")
        
    try:
        supabase_admin.table("audit_logs").insert({
            "advogado_id": user_id,
            "email": email,
            "acao": "senha_assinatura_redefinida",
            "ip_address": real_ip,
            "user_agent": user_agent,
            "device_fingerprint": req.device_fingerprint,
            "payload": {"status": "success"}
        }).execute()
    except Exception as e:
        logger.warning(f"Audit log failed for PIN reset (user {user_id}): {e}")
        
    return {"status": "success", "message": "PIN de confirmação redefinido com sucesso e conta desbloqueada."}


@router.post("/accept-terms")
def accept_terms(user_id: str = Depends(get_current_user_id)):
    """Grava o aceite dos termos de uso (LGPD e MCR) pelo advogado no banco de dados."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    try:
        supabase_admin.table("advogados").update({
            "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            "terms_version": "2.3"
        }).eq("id", user_id).execute()
        return {"status": "success", "message": "Termos aceitos com sucesso."}
    except Exception as e:
        logger.error(f"Failed to save terms acceptance for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gravar aceite de termos.")
