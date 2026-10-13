import json
import time
import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Estimate fallback cache — only used when Supabase is unavailable (bypass/local mode)
# In production with Supabase, estimate metadata is persisted in the atas table.
estimate_cache = {}
ESTIMATE_CACHE_TTL = 600  # 10 minutes


def _get_admin_client():
    try:
        from database import get_supabase_admin_client
        return get_supabase_admin_client()
    except Exception:
        return None


def _remove_temp_file(temp_path: str | None) -> None:
    if temp_path and os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception as e:
            logger.error(f"Erro ao remover arquivo temporario {temp_path}: {e}")


def cleanup_estimate_cache(advogado_id: str | None = None, supabase_client=None) -> int:
    """Remove expired estimates (and previous unconfirmed estimates for the same user) from cache and DB."""
    now = time.time()
    expired = [
        eid for eid, data in list(estimate_cache.items())
        if (now - data.get("timestamp", 0) > ESTIMATE_CACHE_TTL)
        or (advogado_id and data.get("advogado_id") == advogado_id and not data.get("confirmed"))
    ]
    for eid in expired:
        data = estimate_cache.pop(eid, {})
        _remove_temp_file(data.get("temp_path"))

    db_cleaned = 0
    db = _get_admin_client() or supabase_client
    if db:
        try:
            res = db.table("atas").select("id, advogado_id, status_message, created_at").eq("status", "estimating").execute()
            ids_to_delete = []
            for row in (res.data or []):
                is_same_user = bool(advogado_id and row.get("advogado_id") == advogado_id)
                is_expired = False
                temp_path = None
                ts = None
                try:
                    meta = json.loads(row.get("status_message") or "{}")
                    temp_path = meta.get("temp_path")
                    ts = meta.get("timestamp")
                    if ts is not None:
                        is_expired = (now - float(ts)) > ESTIMATE_CACHE_TTL
                except Exception:
                    pass

                if ts is None and not is_same_user and row.get("created_at"):
                    try:
                        created_dt = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
                        is_expired = (datetime.now(timezone.utc) - created_dt).total_seconds() > ESTIMATE_CACHE_TTL
                    except Exception:
                        pass

                if is_expired or is_same_user:
                    _remove_temp_file(temp_path)
                    ids_to_delete.append(row["id"])

            for eid in ids_to_delete:
                db.table("atas").delete().eq("id", eid).eq("status", "estimating").execute()
                db_cleaned += 1
        except Exception as e:
            logger.warning(f"[ESTIMATE_CLEANUP] Falha ao limpar estimativas expiradas no banco: {e}")

    total_cleaned = len(expired) + db_cleaned
    if total_cleaned:
        logger.info(f"[ESTIMATE_CLEANUP] Cleaned {len(expired)} memory + {db_cleaned} DB estimates")
    return total_cleaned

