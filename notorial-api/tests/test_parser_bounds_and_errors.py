"""File bounds (before period filter) and clear errors for damaged ZIPs. Synthetic data only."""
import io
import zipfile

import pytest

from services.whatsapp_parser import ZIP_DAMAGED_MESSAGE, parse_whatsapp_zip

CHAT = (
    "05/01/2024, 08:00 - A: primeira\n"
    "20/12/2023, 09:15 - B: mais antiga\n"
    "22/09/2026, 06:52 - A: ultima\n"
    "10/03/2025, 10:00 - B: meio\n"
)


def _zip(chat: str = CHAT, padding: int = 0) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("_chat.txt", chat)
        if padding:
            z.writestr("PTT-0001.opus", b"\0" * padding)
    return buf.getvalue()


def test_bounds_cover_whole_file_even_with_period_filter():
    # Arrange
    data = _zip()

    # Act
    result = parse_whatsapp_zip(data, start_date="2025-01-01", end_date="2026-09-30")

    # Assert
    assert result["arquivo_inicio"] == "20/12/2023 09:15"
    assert result["arquivo_fim"] == "22/09/2026 06:52"
    assert result["total_mensagens"] == 2


def test_empty_period_error_uses_chronological_bounds():
    # Arrange: lexicographic sort of dd/mm/YYYY would report 05/01/2024 .. 22/09/2026
    data = _zip()

    # Act / Assert
    with pytest.raises(ValueError) as exc:
        parse_whatsapp_zip(data, start_date="2027-01-01", end_date="2027-02-01")
    assert "20/12/2023 09:15 a 22/09/2026 06:52" in str(exc.value)


def test_truncated_zip_reports_damaged_message():
    # Arrange: keep only the tail (what the old chunk bug produced)
    data = _zip(padding=200_000)
    tail = data[150_000:]

    # Act / Assert
    with pytest.raises(ValueError) as exc:
        parse_whatsapp_zip(tail)
    assert str(exc.value) == ZIP_DAMAGED_MESSAGE


def test_truncated_zip_on_disk_reports_damaged_message(tmp_path):
    # Arrange
    path = tmp_path / "tail.zip"
    path.write_bytes(_zip(padding=200_000)[150_000:])

    # Act / Assert
    with pytest.raises(ValueError) as exc:
        parse_whatsapp_zip(str(path))
    assert str(exc.value) == ZIP_DAMAGED_MESSAGE
