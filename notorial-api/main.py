from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
import logging
import logging.handlers
import os

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
    # cleanup on shutdown (add resource teardown here if needed in the future)


app = FastAPI(
    title="LegisVox API",
    description="Automação de Atas Notariais a partir de WhatsApp",
    version="1.0.0",
    lifespan=lifespan,
)

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

# Import and include routers AFTER middleware
from routers import atas, credits, webhooks
app.include_router(atas.router)
app.include_router(credits.router)
app.include_router(webhooks.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API LegisVox is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
