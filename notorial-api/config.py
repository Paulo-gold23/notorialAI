import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")
    GOTENBERG_URL: str = os.getenv("GOTENBERG_URL", "http://localhost:3000")
    PDF_CONVERTER_URL: str = os.getenv("PDF_CONVERTER_URL", "")

settings = Settings()

# Optional: Validate critical configs on startup
if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
    print("Warning: Missing SUPABASE environment variables. Ensure they are set in .env")
