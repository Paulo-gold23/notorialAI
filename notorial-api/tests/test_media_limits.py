"""Media skipped by the memory caps must be reported, never dropped silently. Synthetic data only."""
import io
import zipfile

from services import whatsapp_parser
from services.whatsapp_parser import _plan_extraction, parse_whatsapp_zip

CHAT = (
    "09/03/2025, 14:30 - A: PTT-20250309-WA0001.opus (arquivo anexado)\n"
    "09/03/2025, 14:31 - B: PTT-20250309-WA0002.opus (arquivo anexado)\n"
    "09/03/2025, 14:32 - A: IMG-20250309-WA0003.jpg (arquivo anexado)\n"
)


def _zip(audio_sizes=(10, 10), image_size=10) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("_chat.txt", CHAT)
        z.writestr("PTT-20250309-WA0001.opus", b"a" * audio_sizes[0])
        z.writestr("PTT-20250309-WA0002.opus", b"b" * audio_sizes[1])
        z.writestr("IMG-20250309-WA0003.jpg", b"c" * image_size)
    return buf.getvalue()


def test_plan_skips_files_over_category_budget():
    # Arrange
    with zipfile.ZipFile(io.BytesIO(_zip(audio_sizes=(60, 60)))) as z:
        names = z.namelist()
        selected = {"PTT-20250309-WA0001.opus", "PTT-20250309-WA0002.opus"}

        # Act
        to_extract, skipped = _plan_extraction(z, names, selected, (".opus",), max_total_bytes=100)

    # Assert
    assert to_extract == ["PTT-20250309-WA0001.opus"]
    assert skipped == ["PTT-20250309-WA0002.opus"]


def test_no_media_skipped_reports_zero():
    result = parse_whatsapp_zip(_zip())
    assert result["midias_ignoradas"] == {"audios": 0, "imagens": 0}


def test_oversized_media_reported_in_processing_and_estimate(monkeypatch):
    # Arrange: single-file cap below audio 2 and the image
    monkeypatch.setattr(whatsapp_parser, "MAX_SINGLE_MEDIA_BYTES", 50)
    data = _zip(audio_sizes=(10, 80), image_size=80)

    # Act
    processed = parse_whatsapp_zip(data)
    estimated = parse_whatsapp_zip(data, estimate_only=True)

    # Assert
    assert processed["midias_ignoradas"] == {"audios": 1, "imagens": 1}
    assert estimated["midias_ignoradas"] == processed["midias_ignoradas"]
    assert list(processed["arquivos_extraidos"]) == ["PTT-20250309-WA0001.opus"]
