from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer
from database import supabase, get_supabase_admin_client
from collections import OrderedDict
import hashlib
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# Define the security scheme for swagger documentation
security = HTTPBearer()

# Short-lived in-memory cache for validated JWT -> user_id (avoids 2 sync HTTPS
# roundtrips to Supabase on every 2-second status poll while keeping revocation fast).
_AUTH_CACHE_TTL = float(os.getenv("AUTH_CACHE_TTL_SECONDS", "60"))
_AUTH_CACHE_MAX = 500
_auth_cache: OrderedDict[str, tuple[str, float]] = OrderedDict()
_auth_cache_lock = threading.Lock()


def invalidate_auth_cache_for_user(user_id: str) -> None:
    """Remove any cached tokens belonging to a specific user_id."""
    with _auth_cache_lock:
        keys_to_remove = [k for k, (uid, _) in _auth_cache.items() if uid == user_id]
        for k in keys_to_remove:
            _auth_cache.pop(k, None)


def get_current_user_id(request: Request) -> str:
    """
    Extracts the Bearer token from the request header, validates it with Supabase Auth,
    verifies the user's approval status, and returns the authenticated user's ID.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header de Autenticação não fornecido ou inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.split(" ")[1]
    token_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.monotonic()

    with _auth_cache_lock:
        cached = _auth_cache.get(token_key)
        if cached:
            cached_uid, ts = cached
            if now - ts < _AUTH_CACHE_TTL:
                _auth_cache.move_to_end(token_key)
                return cached_uid
            else:
                _auth_cache.pop(token_key, None)
    
    try:
        # Validate token with Supabase Auth (server-side validation)
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise Exception("Invalid user response from token")
        
        user_id = getattr(user_response.user, "id")

        # Server-side approval status check (defense in depth)
        # Prevents users with 'pendente' status from accessing any API endpoint
        # even if they bypass the client-side signOut check
        admin_client = get_supabase_admin_client()
        if admin_client:
            try:
                profile = admin_client.table("advogados") \
                    .select("status") \
                    .eq("id", user_id) \
                    .single() \
                    .execute()
                
                user_status = profile.data.get("status") if profile.data else None
                if user_status == "pendente":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Sua conta está pendente de aprovação. Aguarde a liberação pelo administrador.",
                    )
            except HTTPException:
                raise
            except Exception as e:
                # If profile check fails, allow access (fail-open for availability)
                # The RLS policies provide the next layer of defense
                logger.warning(f"Could not verify approval status for user {user_id}: {e}")

        with _auth_cache_lock:
            while len(_auth_cache) >= _AUTH_CACHE_MAX:
                _auth_cache.popitem(last=False)
            _auth_cache[token_key] = (user_id, now)

        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token de Acesso Inválido ou Expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

