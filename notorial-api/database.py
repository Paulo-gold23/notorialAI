from supabase import create_client, Client
from config import settings

def get_supabase_client() -> Client:
    # Requires url and key to instantiate
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY or "your-supabase" in settings.SUPABASE_URL:
        return None
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception as e:
        print(f"\n⚠️ Alerta: Erro ao conectar ao Supabase: {e}")
        print("💡 Verifique se a sua SUPABASE_KEY no arquivo .env está correta (deve começar com 'eyJ...')\n")
        return None

supabase = get_supabase_client()
