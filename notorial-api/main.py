from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Notorial.ai API",
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
    logger.info("Initializing Notorial.ai API...")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "API Notorial.ai is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
