from supabase import create_client, Client
from config import settings
import asyncio
import httpx
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# ── Shared thread pool for non-blocking database operations ──
# Sync supabase-py calls (.execute()) block the asyncio event loop.
# Running them in this executor keeps FastAPI responsive during pipeline processing.
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db")

async def db_exec(fn):
    """Run a synchronous database call in a thread — never blocks the event loop.
    
    Usage:
        result = await db_exec(lambda: supabase.table("x").select("*").execute())
    """
    return await asyncio.get_running_loop().run_in_executor(_db_executor, fn)

_cached_supabase = None
_cached_supabase_admin = None

def _apply_extended_timeout(client: Client, timeout_seconds: float = 180.0):
    """Safely extend the httpx timeout on the postgrest client after creation.
    
    The default httpx timeout (~5s) is too short for saving large documents.
    Blocking a sync supabase-py call for >100s triggers Cloudflare 524 errors,
    so we extend the timeout and run these calls in run_in_executor.
    """
    try:
        _timeout = httpx.Timeout(timeout_seconds, connect=10.0)
        pg = getattr(client, 'postgrest', None)
        if pg:
            for attr in ('_client', '_session', 'session'):
                sess = getattr(pg, attr, None)
                if sess and hasattr(sess, 'timeout'):
                    sess.timeout = _timeout
                    logger.info(f"[database] PostgREST timeout extended to {timeout_seconds}s via .postgrest.{attr}")
                    return
    except Exception as e:
        logger.warning(f"[database] Could not extend postgrest timeout: {e}")

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
        _apply_extended_timeout(_cached_supabase)
        return _cached_supabase
    except Exception as e:
        print(f"\n[ALERTA] Erro ao conectar ao Supabase (anon): {e}")
        return None

import time
from collections import OrderedDict
import threading

_user_clients_cache: OrderedDict[str, tuple[Client, float]] = OrderedDict()
_user_clients_lock = threading.Lock()
_USER_CLIENT_TTL = 600  # 10 minutes cache per user JWT
_MAX_USER_CLIENTS = 100  # Maximum pooled user clients

def create_user_client(token: str) -> Client:
    """Gets or creates a cached Supabase client scoped to a specific user's JWT.
    
    Re-uses existing clients per token to prevent socket leaks and connection exhaustion,
    while maintaining strict per-user RLS isolation.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return None
    if not token:
        return get_supabase_client()
        
    now = time.time()
    with _user_clients_lock:
        # Check cache
        if token in _user_clients_cache:
            client, ts = _user_clients_cache[token]
            if now - ts < _USER_CLIENT_TTL:
                _user_clients_cache.move_to_end(token)
                return client
            else:
                del _user_clients_cache[token]

        # Evict oldest entries if capacity reached
        while len(_user_clients_cache) >= _MAX_USER_CLIENTS:
            _user_clients_cache.popitem(last=False)

        try:
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            client.postgrest.auth(token)
            _user_clients_cache[token] = (client, now)
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
        _apply_extended_timeout(_cached_supabase_admin)
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
