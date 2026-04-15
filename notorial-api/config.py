import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")         # anon key (public)
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")  # service role (backend only)
    GOTENBERG_URL: str = os.getenv("GOTENBERG_URL", "http://localhost:3000")
    PDF_CONVERTER_URL: str = os.getenv("PDF_CONVERTER_URL", "")
    ASAAS_API_KEY: str = os.getenv("ASAAS_API_KEY", "")
    ASAAS_ENVIRONMENT: str = os.getenv("ASAAS_ENVIRONMENT", "sandbox")
    ASAAS_WEBHOOK_TOKEN: str = os.getenv("ASAAS_WEBHOOK_TOKEN", "")
    ALLOW_TEST_BYPASS: bool = os.getenv("ALLOW_TEST_BYPASS", "false").lower() == "true"

settings = Settings()

# Optional: Validate critical configs on startup
if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
    print("Warning: Missing SUPABASE environment variables. Ensure they are set in .env")
