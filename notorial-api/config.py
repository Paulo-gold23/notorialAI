import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")  # trocar via .env sem redeploy
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")         # anon key (public)
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")  # service role (backend only)
    GOTENBERG_URL: str = os.getenv("GOTENBERG_URL", "http://localhost:3000")
    PDF_CONVERTER_URL: str = os.getenv("PDF_CONVERTER_URL", "")
    ASAAS_API_KEY: str = os.getenv("ASAAS_API_KEY", "")
    ASAAS_ENVIRONMENT: str = os.getenv("ASAAS_ENVIRONMENT", "sandbox")
    ASAAS_WEBHOOK_TOKEN: str = os.getenv("ASAAS_WEBHOOK_TOKEN", "")
    
    # SMTP/E-mail Configuration
    SMTP_HOST: str = os.getenv("SMTP_HOST", "sandbox.smtp.mailtrap.io")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "2525"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "no-reply@legisvox.com.br")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")

settings = Settings()

# Validate critical configs on startup — fail immediately instead of corrupted runtime
if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
    raise ValueError(
        "FATAL: SUPABASE_URL e SUPABASE_KEY são obrigatórias. "
        "Configure o arquivo .env antes de iniciar a aplicação."
    )
