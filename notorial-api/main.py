from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LegisVox API",
    description="Automação de Atas Notariais a partir de WhatsApp",
    version="1.0.0"
)

# Import and include routers
from routers import atas, credits, webhooks
app.include_router(atas.router)
app.include_router(credits.router)
app.include_router(webhooks.router)

# CORS configuration
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

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing LegisVox API...")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API LegisVox is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
