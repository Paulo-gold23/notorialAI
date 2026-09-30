"""
Image Storage Service — manages compressed images on disk.

Feature flag: IMAGES_STORAGE_MODE
  - 'inline' (default): images embedded as base64 in HTML (current behavior)
  - 'disk': images saved to /data/atas-images/{ata_id}/ and referenced by URL

The disk path is a Docker volume that persists across container restarts.
"""

import os
import shutil
import time
import logging

logger = logging.getLogger(__name__)

IMAGES_BASE_DIR = os.environ.get('IMAGES_STORAGE_DIR', '/data/atas-images')
IMAGES_STORAGE_MODE = os.environ.get('IMAGES_STORAGE_MODE', 'inline')


def is_disk_mode() -> bool:
    """Check if images should be stored on disk instead of inline base64."""
    return IMAGES_STORAGE_MODE == 'disk'


def save_image(ata_id: str, filename: str, jpeg_bytes: bytes) -> str:
    """Save compressed JPEG image to disk.
    
    Returns the URL path to serve this image via the API endpoint.
    """
    dir_path = os.path.join(IMAGES_BASE_DIR, ata_id)
    os.makedirs(dir_path, exist_ok=True)

    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(dir_path, safe_filename)

    with open(file_path, 'wb') as f:
        f.write(jpeg_bytes)

    return f"/api/atas/{ata_id}/images/{safe_filename}"


def get_image_path(ata_id: str, filename: str) -> str | None:
    """Get absolute filesystem path for an image. Returns None if not found."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(IMAGES_BASE_DIR, ata_id, safe_filename)

    if os.path.isfile(file_path):
        return file_path
    return None


def read_image_bytes(ata_id: str, filename: str) -> bytes | None:
    """Read compressed JPEG bytes from disk. Returns None if not found."""
    path = get_image_path(ata_id, filename)
    if path is None:
        return None
    try:
        with open(path, 'rb') as f:
            return f.read()
    except Exception as e:
        logger.warning(f"Failed to read image {filename} for ata {ata_id}: {e}")
        return None


def delete_images(ata_id: str):
    """Delete all images for a given ata (called when document is deleted)."""
    dir_path = os.path.join(IMAGES_BASE_DIR, ata_id)
    if os.path.isdir(dir_path):
        try:
            shutil.rmtree(dir_path)
            logger.info(f"[image_storage] Deleted images for ata {ata_id}")
        except Exception as e:
            logger.warning(f"[image_storage] Failed to delete images for {ata_id}: {e}")


def cleanup_old_images(max_age_days: int = 30):
    """Delete image directories older than max_age_days.
    
    Called periodically (e.g., weekly cron) to reclaim disk space
    from documents that were deleted or abandoned.
    """
    if not os.path.isdir(IMAGES_BASE_DIR):
        return 0

    now = time.time()
    max_age_seconds = max_age_days * 86400
    cleaned = 0

    for entry in os.listdir(IMAGES_BASE_DIR):
        dir_path = os.path.join(IMAGES_BASE_DIR, entry)
        if not os.path.isdir(dir_path):
            continue
        try:
            mtime = os.path.getmtime(dir_path)
            if now - mtime > max_age_seconds:
                shutil.rmtree(dir_path, ignore_errors=True)
                cleaned += 1
        except Exception:
            continue

    if cleaned:
        logger.info(f"[image_storage] Cleaned up {cleaned} old image directories (>{max_age_days} days)")
    return cleaned


def get_disk_usage_mb() -> float:
    """Get total disk usage of the images directory in megabytes."""
    if not os.path.isdir(IMAGES_BASE_DIR):
        return 0.0

    total = 0
    for dirpath, _dirnames, filenames in os.walk(IMAGES_BASE_DIR):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                continue
    return total / (1024 * 1024)
