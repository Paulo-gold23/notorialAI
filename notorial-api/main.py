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

_handlers = []
try:
    _file_handler = logging.handlers.TimedRotatingFileHandler(
        _LOG_FILE, when="midnight", backupCount=7, encoding="utf-8"
    )
    _file_handler.setFormatter(_formatter)
    _handlers.append(_file_handler)
except Exception:
    try:
        # Fallback para rotação baseada em tamanho (10MB max, 5 backups) se TimedRotating falhar
        _file_handler = logging.handlers.RotatingFileHandler(
            _LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
        )
        _file_handler.setFormatter(_formatter)
        _handlers.append(_file_handler)
    except Exception:
        pass

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)
_handlers.append(_console_handler)

logging.basicConfig(level=logging.INFO, handlers=_handlers)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing LegisVox API...")

    # Log image storage mode
    from services.image_storage import IMAGES_STORAGE_MODE, IMAGES_BASE_DIR
    logger.info(f"Image storage mode: {IMAGES_STORAGE_MODE} (dir: {IMAGES_BASE_DIR})")

    # Start periodic image cleanup (runs daily)
    import asyncio
    async def _image_cleanup_loop():
        from services.image_storage import cleanup_old_images, get_disk_usage_mb
        while True:
            await asyncio.sleep(86400)  # 24 hours
            try:
                cleaned = cleanup_old_images(max_age_days=7)
                usage_mb = get_disk_usage_mb()
                logger.info(f"[IMAGE_CLEANUP] Cleaned {cleaned} dirs, disk usage: {usage_mb:.1f} MB")
            except Exception as e:
                logger.warning(f"[IMAGE_CLEANUP] Error: {e}")

    cleanup_task = asyncio.create_task(_image_cleanup_loop())

    # Abandoned upload temp files (unconfirmed estimates, interrupted chunked uploads)
    async def _temp_cleanup_loop():
        from services.temp_cleanup import cleanup_temp_uploads
        max_age = float(os.getenv("TEMP_UPLOAD_MAX_AGE_HOURS", "6"))
        while True:
            try:
                removed, freed = await asyncio.get_running_loop().run_in_executor(
                    None, cleanup_temp_uploads, max_age
                )
                if removed:
                    logger.info(f"[TEMP_CLEANUP] Removed {removed} file(s), freed {freed / 1048576:.1f} MB")
            except Exception as e:
                logger.warning(f"[TEMP_CLEANUP] Error: {e}")
            await asyncio.sleep(3600)

    temp_cleanup_task = asyncio.create_task(_temp_cleanup_loop())

    yield

    # Teardown
    cleanup_task.cancel()
    temp_cleanup_task.cancel()
    from database import close_http_client
    await close_http_client()
    logger.info("Cleanup complete.")


from services.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app = FastAPI(
    title="LegisVox API",
    description="Organização de conversas WhatsApp para advogados (Material Preparatório)",
    version="3.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS must be registered BEFORE routers — FastAPI applies middleware in reverse order
_cors_origins = [
    # Production
    "https://legisvox.com",
    "https://www.legisvox.com",
]
# Only allow localhost origins in non-production environments
if os.getenv("ENVIRONMENT", "production").lower() != "production":
    _cors_origins += [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "advogado_id", "asaas_access_token", "asaas-access-token"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    return response

# Import and include routers AFTER middleware
from routers import atas, credits, webhooks, auth, consent
app.include_router(atas.router)
app.include_router(credits.router)
app.include_router(webhooks.router)
app.include_router(auth.router)
app.include_router(consent.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API LegisVox is running"}

_health_cache = {"result": None, "ts": 0}
_HEALTH_TTL = 60  # seconds

@app.get("/health")
async def health_check(response: Response):
    import time as _time
    now = _time.time()
    if _health_cache["result"] and (now - _health_cache["ts"]) < _HEALTH_TTL:
        result = _health_cache["result"]
        if any(v == "error" for v in result.values()):
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return result
    
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
    
    _health_cache["result"] = checks
    _health_cache["ts"] = now
    
    if any(v == "error" for v in checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return checks

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
