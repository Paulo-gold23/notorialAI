import os
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer
from database import supabase, get_supabase_admin_client
import logging

logger = logging.getLogger(__name__)

# Define the security scheme for swagger documentation
security = HTTPBearer()

# Test bypass is ONLY allowed if explicitly enabled via environment variable
_ALLOW_BYPASS = os.getenv("ALLOW_TEST_BYPASS", "false").lower() == "true"

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
    
    try:
        # Development-only bypass (disabled by default, requires ALLOW_TEST_BYPASS=true)
        if _ALLOW_BYPASS and token == "bypass_admin":
            return "bypass-admin-id"

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

        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token de Acesso Inválido ou Expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

