from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
import logging

logging.basicConfig(level=logging.INFO)
# Also write to file for post-run inspection
_fh = logging.FileHandler("api.log", encoding="utf-8")
_fh.setLevel(logging.INFO)
_fh.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
logging.getLogger().addHandler(_fh)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LegisVox API",
    description="Automação de Atas Notariais a partir de WhatsApp",
    version="1.0.0"
)

# Import and include routers
from routers import atas
app.include_router(atas.router)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://paulo-gold23.github.io",
        "https://Paulo-gold23.github.io"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
