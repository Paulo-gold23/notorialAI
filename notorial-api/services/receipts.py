"""Processing and issuance receipts.

Receipts hold metadata only (hashes, sizes, counts, versions) and never any
conversation content. They are written best-effort: a failure here is logged
and must never break processing or PDF generation. Receipts only exist for
work done after this feature was deployed; nothing is back-filled.
"""
import hashlib
import io
import logging
import os
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

TEMPLATE_VERSION = "pdf-v2.s1"
TRANSCRIPTION_MODEL = "whisper-large-v3"
LLM_TEMPERATURE = 0.2
MAX_INVENTORY_ENTRIES = 5000
_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
_READ_CHUNK = 1024 * 1024


def app_version() -> str:
    """Deployed build identifier, set by the deploy via APP_VERSION or GIT_SHA."""
    return os.getenv("APP_VERSION") or os.getenv("GIT_SHA") or "unknown"


def protocol_for(ata_id: str) -> str:
    return f"LVX-{str(ata_id)[:8].upper()}"


def sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def prompts_hash() -> str | None:
    """SHA-256 over the prompt files (sorted by name) used by the organizer."""
    try:
        digest = hashlib.sha256()
        for path in sorted(_PROMPTS_DIR.glob("*.md")):
            digest.update(path.name.encode("utf-8"))
            digest.update(path.read_bytes())
        return digest.hexdigest()
    except Exception as e:
        logger.warning(f"[RECEIPT] Falha ao calcular hash dos prompts: {e}")
        return None


def zip_inventory(source) -> tuple[list[dict], bool]:
    """Per-file inventory (name, size, SHA-256) of a ZIP given as path or bytes.

    Files are hashed in chunks to keep memory flat. Returns (entries, truncated).
    """
    entries: list[dict] = []
    truncated = False
    handle = io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source
    with zipfile.ZipFile(handle) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            if len(entries) >= MAX_INVENTORY_ENTRIES:
                truncated = True
                break
            digest = hashlib.sha256()
            with z.open(info) as f:
                while chunk := f.read(_READ_CHUNK):
                    digest.update(chunk)
            entries.append({"name": info.filename, "size": info.file_size, "sha256": digest.hexdigest()})
    return entries, truncated


def safe_zip_inventory(source) -> tuple[list[dict] | None, bool]:
    try:
        return zip_inventory(source)
    except Exception as e:
        logger.warning(f"[RECEIPT] Falha ao inventariar ZIP: {e}")
        return None, False


def record_processing_receipt(client, *, ata_id: str, zip_filename, zip_hash, zip_size,
                              inventory, inventory_truncated: bool,
                              parser_totals: dict, audio_stats: dict, openai_model: str) -> bool:
    if client is None:
        return False
    try:
        client.table("processing_receipts").insert({
            "ata_ref": str(ata_id),
            "protocol": protocol_for(ata_id),
            "zip_filename": zip_filename,
            "zip_hash": zip_hash,
            "zip_size_bytes": zip_size,
            "zip_inventory": inventory,
            "zip_inventory_truncated": inventory_truncated,
            "parser_totals": parser_totals,
            "audio_stats": audio_stats,
            "app_version": app_version(),
            "openai_model": openai_model,
            "transcription_model": TRANSCRIPTION_MODEL,
            "temperature": LLM_TEMPERATURE,
            "prompt_hash": prompts_hash(),
            "template_version": TEMPLATE_VERSION,
        }).execute()
        return True
    except Exception as e:
        logger.warning(f"[RECEIPT] Falha ao gravar recibo de processamento ({ata_id}): {e}")
        return False


def next_emission(client, ata_id: str) -> tuple[int | None, str | None]:
    """(next emission number, previous PDF hash); (None, None) if unavailable."""
    if client is None:
        return None, None
    try:
        res = (client.table("pdf_issuance_receipts")
               .select("emission_number,pdf_hash")
               .eq("ata_ref", str(ata_id))
               .order("emission_number", desc=True)
               .limit(1)
               .execute())
        if res.data:
            last = res.data[0]
            return (last.get("emission_number") or 0) + 1, last.get("pdf_hash")
        return 1, None
    except Exception as e:
        logger.warning(f"[RECEIPT] Falha ao consultar emissões anteriores ({ata_id}): {e}")
        return None, None


def record_pdf_issuance(client, *, ata_id: str, emission_number, pdf_hash: str,
                        previous_pdf_hash, input_html: str, annotation_count: int) -> bool:
    if client is None or not pdf_hash:
        return False
    try:
        client.table("pdf_issuance_receipts").insert({
            "ata_ref": str(ata_id),
            "protocol": protocol_for(ata_id),
            "emission_number": emission_number,
            "pdf_hash": pdf_hash,
            "previous_pdf_hash": previous_pdf_hash,
            "input_html_hash": sha256_text(input_html),
            "annotation_count": annotation_count,
            "template_version": TEMPLATE_VERSION,
            "app_version": app_version(),
        }).execute()
        return True
    except Exception as e:
        logger.warning(f"[RECEIPT] Falha ao gravar recibo de emissão ({ata_id}): {e}")
        return False
