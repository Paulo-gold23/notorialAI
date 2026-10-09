"""Periodic removal of abandoned upload temp files.

Unconfirmed estimates and interrupted chunked uploads leave ZIPs (up to GBs) in the temp dir
that nothing else deletes. Estimates expire after 10 minutes and a pipeline run finishes in
about an hour, so anything older than TEMP_UPLOAD_MAX_AGE_HOURS (default 6) is abandoned.
"""
import glob
import logging
import os
import tempfile
import time

logger = logging.getLogger(__name__)

TEMP_PATTERNS = (
    "legisvox_upload_*.zip",   # assembled chunked uploads
    "legisvox_chunk_*.part",   # interrupted chunked uploads
    "tmp*.zip",                # tempfile.mkstemp(suffix=".zip") from direct uploads
)


def cleanup_temp_uploads(max_age_hours: float, temp_dir: str | None = None,
                         now: float | None = None) -> tuple[int, int]:
    """Delete matching temp files older than max_age_hours. Returns (files_removed, bytes_freed)."""
    temp_dir = temp_dir or tempfile.gettempdir()
    cutoff = (now if now is not None else time.time()) - max_age_hours * 3600
    removed, freed = 0, 0
    for pattern in TEMP_PATTERNS:
        for path in glob.glob(os.path.join(temp_dir, pattern)):
            try:
                stat = os.stat(path)
                if not os.path.isfile(path) or stat.st_mtime >= cutoff:
                    continue
                os.remove(path)
                removed += 1
                freed += stat.st_size
            except FileNotFoundError:
                continue  # another worker removed it first
            except OSError as e:
                logger.warning(f"[TEMP_CLEANUP] Could not remove {os.path.basename(path)}: {e}")
    return removed, freed
