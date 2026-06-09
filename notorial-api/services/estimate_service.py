import time
import os
import logging

logger = logging.getLogger(__name__)

# Estimate fallback cache — only used when Supabase is unavailable (bypass/local mode)
# In production with Supabase, estimate metadata is persisted in the atas table.
estimate_cache = {}
ESTIMATE_CACHE_TTL = 600  # 10 minutes

def cleanup_estimate_cache():
    """Remove expired estimates and their temp files."""
    now = time.time()
    expired = []
    for eid, data in list(estimate_cache.items()):
        if now - data["timestamp"] > ESTIMATE_CACHE_TTL:
            expired.append(eid)
    for eid in expired:
        data = estimate_cache.pop(eid)
        if "temp_path" in data and data["temp_path"] and os.path.exists(data["temp_path"]):
            try:
                os.remove(data["temp_path"])
            except Exception as e:
                logger.error(f"Erro ao remover arquivo temporario {data['temp_path']}: {e}")
    if expired:
        logger.info(f"Cleaned up {len(expired)} expired estimates from cache")
