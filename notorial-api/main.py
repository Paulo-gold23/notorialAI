from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
import logging
import logging.handlers
import os
import sentry_sdk

# Initialize Sentry if DSN is provided
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

import httpx
from pillow_heif import register_heif_opener

# ── Register Apple HEIC support global opener ──────────────────────────────────
register_heif_opener()

# ── Logging ──────────────────────────────────────────────────────────────────
_LOG_FILE = os.path.join(os.path.dirname(__file__), "app.log")
_formatter = logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s")

_file_handler = logging.handlers.TimedRotatingFileHandler(
    _LOG_FILE, when="midnight", backupCount=7, encoding="utf-8"
)
_file_handler.setFormatter(_formatter)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)

logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _console_handler])
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing LegisVox API...")
    yield
    # Teardown shared client connection pool
    from database import close_http_client
    await close_http_client()
    logger.info("Cleanup complete.")


from services.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app = FastAPI(
    title="LegisVox API",
    description="Organização de conversas WhatsApp para advogados (Material Preparatório)",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS must be registered BEFORE routers — FastAPI applies middleware in reverse order
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Production
        "https://legisvox.com",
        "https://www.legisvox.com",
        # Development
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "advogado_id", "asaas_access_token", "asaas-access-token"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response

# Import and include routers AFTER middleware
from routers import atas, credits, webhooks, auth
app.include_router(atas.router)
app.include_router(credits.router)
app.include_router(webhooks.router)
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API LegisVox is running"}

@app.get("/health")
async def health_check(response: Response):
    checks = {"api": "ok"}
    try:
        from database import supabase_admin
        if supabase_admin:
            supabase_admin.table("advogados").select("id").limit(1).execute()
            checks["database"] = "ok"
        else:
            checks["database"] = "unconfigured"
    except Exception as e:
        logger.error(f"Health check DB error: {e}")
        checks["database"] = "error"
    
    if any(v == "error" for v in checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return checks

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
