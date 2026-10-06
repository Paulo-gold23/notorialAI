"""Short-lived signed tokens for ata image URLs.

`<img>` tags cannot send the Authorization header, so image URLs embedded in the
editor HTML carry an HMAC token bound to (ata_id, filename, expiry). The token is
only added when the preview is served and is stripped again before saving or
rendering the PDF, so persisted HTML keeps clean, token-free URLs.
"""
import hashlib
import hmac
import re
import time
from typing import Optional

from config import settings

IMAGE_TOKEN_TTL_SECONDS = 12 * 60 * 60


def _key() -> bytes:
    # Backend-only secret that is stable across uvicorn workers and restarts.
    secret = settings.SUPABASE_SERVICE_KEY or settings.PDF_OWNER_SECRET
    if not secret:
        raise RuntimeError("No server secret configured to sign image URLs")
    return hashlib.sha256(b"legisvox-image-url|" + secret.encode("utf-8")).digest()


def _signature(ata_id: str, filename: str, exp: int) -> str:
    msg = f"{ata_id}|{filename}|{exp}".encode("utf-8")
    return hmac.new(_key(), msg, hashlib.sha256).hexdigest()


def sign(ata_id: str, filename: str, ttl: int = IMAGE_TOKEN_TTL_SECONDS, now: Optional[float] = None) -> str:
    exp = int((now if now is not None else time.time()) + ttl)
    return f"{exp}.{_signature(ata_id, filename, exp)}"


def verify(ata_id: str, filename: str, token: Optional[str], now: Optional[float] = None) -> bool:
    if not token or "." not in token:
        return False
    exp_raw, sig = token.split(".", 1)
    try:
        exp = int(exp_raw)
    except ValueError:
        return False
    if exp < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(sig, _signature(ata_id, filename, exp))


def add_tokens(html: str, ata_id: str) -> str:
    """Append a signed `?t=` to every disk-image URL of this ata found in the HTML."""
    if not html:
        return html
    pattern = re.compile(r'(/api/atas/' + re.escape(ata_id) + r'/images/)([^"\'?\s<>]+)')
    return pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}?t={sign(ata_id, m.group(2))}", html)


def strip_tokens(html: str, ata_id: str) -> str:
    """Remove the `?t=` query from disk-image URLs so persisted HTML stays token-free."""
    if not html:
        return html
    pattern = re.compile(r'(/api/atas/' + re.escape(ata_id) + r'/images/[^"\'?\s<>]+)\?t=[0-9]+\.[0-9a-f]+')
    return pattern.sub(r"\1", html)
