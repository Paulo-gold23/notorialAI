import time
import logging
from database import get_supabase_client

logger = logging.getLogger(__name__)

# In-memory PDF cache — stores metadata only when Supabase Storage is available.
# Fallback: stores full bytes when Storage is unavailable (bypass/local mode).
# Format: {pdf_id: {"ts": float, "owner": str, "bytes": Optional[bytes]}}
pdf_cache = {}
PDF_CACHE_TTL = 3600  # 1 hour TTL for cached PDFs
_PDF_STORAGE_BUCKET = "pdfs-temp"

def cleanup_pdf_cache():
    """Remove PDFs que excederam o TTL (e seus arquivos no Storage)."""
    now = time.time()
    expired = [pid for pid, meta in list(pdf_cache.items()) if now - meta["ts"] > PDF_CACHE_TTL]
    for pid in expired:
        meta = pdf_cache.pop(pid)
        # Se estava no Storage, tenta remover (best-effort).
        supabase = get_supabase_client()
        if supabase and not meta.get("bytes"):
            try:
                path = f"{meta['owner']}/{pid}.pdf"
                supabase.storage.from_(_PDF_STORAGE_BUCKET).remove([path])
            except Exception:
                pass
    if expired:
        logger.info(f"Cleaned up {len(expired)} expired PDFs from cache")
