from supabase import create_client, Client
from config import settings

def get_supabase_client() -> Client:
    """Anon key client — used for Supabase Auth operations (JWT validation)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY or "your-supabase" in settings.SUPABASE_URL:
        return None
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception as e:
        print(f"\n[ALERTA] Erro ao conectar ao Supabase (anon): {e}")
        return None

def get_supabase_admin_client() -> Client:
    """Service role client — bypasses RLS for backend data queries.
    
    NEVER expose this client or its key to the frontend.
    Use only for server-side operations that need to read/write any user's data.
    Falls back to anon client if SUPABASE_SERVICE_KEY is not configured.
    """
    url = settings.SUPABASE_URL
    service_key = settings.SUPABASE_SERVICE_KEY

    if not url or "your-supabase" in (url or ""):
        return None

    # Use service key if available, otherwise fall back to anon (RLS will apply)
    key = service_key if service_key else settings.SUPABASE_KEY
    if not key:
        return None

    try:
        client = create_client(url, key)
        if not service_key:
            print("[AVISO] SUPABASE_SERVICE_KEY nao configurada. Queries do backend usarao anon key (RLS ativo).")
            print("[INFO] Configure SUPABASE_SERVICE_KEY no .env para evitar erros de 'Perfil nao encontrado'.")
        return client
    except Exception as e:
        print(f"\n[ALERTA] Erro ao conectar ao Supabase (admin): {e}")
        return None

# Anon client — auth operations only
supabase = get_supabase_client()

# Admin/service client — backend data queries (bypasses RLS)
supabase_admin = get_supabase_admin_client()
