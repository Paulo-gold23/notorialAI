from supabase import create_client, Client
from config import settings
import httpx
import logging

logger = logging.getLogger(__name__)

_cached_supabase = None
_cached_supabase_admin = None

def get_supabase_client() -> Client:
    """Anon key client — used for internal operations (pipeline, cleanup).
    
    WARNING: Do NOT call .postgrest.auth(token) on this client.
    It is a singleton shared across all requests. Mutating its auth header
    will cause cross-user data leakage under concurrent load.
    For user-scoped queries, use create_user_client() instead.
    """
    global _cached_supabase
    if _cached_supabase is not None:
        return _cached_supabase
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY or "your-supabase" in settings.SUPABASE_URL:
        return None
    try:
        _cached_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return _cached_supabase
    except Exception as e:
        print(f"\n[ALERTA] Erro ao conectar ao Supabase (anon): {e}")
        return None

def create_user_client(token: str) -> Client:
    """Create a NEW isolated Supabase client scoped to a specific user's JWT.
    
    This client is created per-request to prevent cross-user data leakage.
    Each request gets its own client instance with its own auth header,
    ensuring Row Level Security (RLS) correctly isolates tenant data
    even under concurrent async request processing.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return None
    try:
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        if token:
            client.postgrest.auth(token)
        return client
    except Exception as e:
        logger.error(f"Failed to create user-scoped Supabase client: {e}")
        return None

def get_supabase_admin_client() -> Client:
    """Service role client — bypasses RLS for backend data queries.
    
    NEVER expose this client or its key to the frontend.
    Use only for server-side operations that need to read/write any user's data.
    Falls back to anon client if SUPABASE_SERVICE_KEY is not configured.
    """
    global _cached_supabase_admin
    if _cached_supabase_admin is not None:
        return _cached_supabase_admin
    url = settings.SUPABASE_URL
    service_key = settings.SUPABASE_SERVICE_KEY

    if not url or "your-supabase" in (url or ""):
        return None

    # Use service key if available, otherwise fall back to anon (RLS will apply)
    key = service_key if service_key else settings.SUPABASE_KEY
    if not key:
        return None

    try:
        _cached_supabase_admin = create_client(url, key)
        if not service_key:
            print("[AVISO] SUPABASE_SERVICE_KEY nao configurada. Queries do backend usarao anon key (RLS ativo).")
            print("[INFO] Configure SUPABASE_SERVICE_KEY no .env para evitar erros de 'Perfil nao encontrado'.")
        return _cached_supabase_admin
    except Exception as e:
        print(f"\n[ALERTA] Erro ao conectar ao Supabase (admin): {e}")
        return None

# Anon client — auth operations only
supabase = get_supabase_client()

# Admin/service client — backend data queries (bypasses RLS)
supabase_admin = get_supabase_admin_client()

# HTTPX client connection pooling for external APIs (Gotenberg, OpenAI, Groq)
_http_client = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            timeout=httpx.Timeout(120.0)
        )
    return _http_client

async def close_http_client():
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None
