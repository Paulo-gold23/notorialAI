import io
import os
import zipfile

import pytest

from services.chunk_upload import ChunkUploadError, finalize, write_chunk

CHUNK = 1024
MAX = 64 * 1024


def _zip_bytes(size_hint=10_000) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        z.writestr("_chat.txt", "01/01/2024 10:00 - A: oi\n" * (size_hint // 25))
        z.writestr("Media/IMG-20240101-WA0001.jpg", os.urandom(size_hint))
    return buf.getvalue()


def _chunks(data: bytes):
    return [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]


def _upload(tmp_path, data, order=None, repeat=()):
    part, final = str(tmp_path / "x.part"), str(tmp_path / "x.zip")
    parts = _chunks(data)
    for i in order or range(len(parts)):
        write_chunk(part, i, len(parts), parts[i], MAX, chunk_size=CHUNK, total_size=len(data))
        if i in repeat:
            write_chunk(part, i, len(parts), parts[i], MAX, chunk_size=CHUNK, total_size=len(data))
    finalize(part, final, len(data))
    return final


def test_assembled_zip_is_identical_and_opens(tmp_path):
    data = _zip_bytes()
    final = _upload(tmp_path, data)
    assert open(final, "rb").read() == data
    assert zipfile.ZipFile(final).testzip() is None


def test_resending_a_chunk_is_idempotent(tmp_path):
    data = _zip_bytes()
    final = _upload(tmp_path, data, repeat={0, 3, 7})
    assert open(final, "rb").read() == data


def test_chunk_without_previous_parts_is_rejected_not_restarted(tmp_path):
    """Regression for the 09/10 incident: a retry after the partial file vanished started a new file."""
    data = _zip_bytes()
    parts = _chunks(data)
    with pytest.raises(ChunkUploadError) as exc:
        write_chunk(str(tmp_path / "x.part"), 5, len(parts), parts[5], MAX, chunk_size=CHUNK, total_size=len(data))
    assert exc.value.status_code == 409
    assert not (tmp_path / "x.part").exists()


def test_declared_size_over_limit_rejected_on_first_chunk(tmp_path):
    with pytest.raises(ChunkUploadError) as exc:
        write_chunk(str(tmp_path / "x.part"), 0, 100, b"PK\x03\x04" + b"0" * 10, MAX,
                    chunk_size=CHUNK, total_size=MAX + 1)
    assert exc.value.status_code == 413
    assert "limite" in exc.value.detail


def test_offset_beyond_limit_rejected_and_partial_removed(tmp_path):
    part = str(tmp_path / "x.part")
    write_chunk(part, 0, 200, b"PK\x03\x04" + b"0" * (CHUNK - 4), MAX, chunk_size=CHUNK)
    with pytest.raises(ChunkUploadError) as exc:
        write_chunk(part, MAX // CHUNK, 200, b"0" * CHUNK, MAX, chunk_size=CHUNK)
    assert exc.value.status_code == 413
    assert not os.path.exists(part)


def test_size_mismatch_on_finalize_rejected(tmp_path):
    data = _zip_bytes()
    part, final = str(tmp_path / "x.part"), str(tmp_path / "x.zip")
    parts = _chunks(data)
    for i in range(len(parts) - 1):  # last chunk missing
        write_chunk(part, i, len(parts), parts[i], MAX, chunk_size=CHUNK)
    with pytest.raises(ChunkUploadError) as exc:
        finalize(part, final, len(data))
    assert exc.value.status_code == 400
    assert not os.path.exists(final)


def test_tail_only_file_fails_signature_check(tmp_path):
    """The truncated production file (missing its first chunks) must be rejected at assembly."""
    data = _zip_bytes()
    part, final = str(tmp_path / "x.part"), str(tmp_path / "x.zip")
    with open(part, "wb") as f:
        f.write(data[CHUNK * 3:])
    with pytest.raises(ChunkUploadError):
        finalize(part, final, None)


@pytest.mark.parametrize("bad", [0, -1])
def test_invalid_chunk_size_rejected(tmp_path, bad):
    with pytest.raises(ChunkUploadError):
        write_chunk(str(tmp_path / "x.part"), 0, 1, b"PK\x03\x04", MAX, chunk_size=bad)


def test_legacy_client_without_chunk_size_still_appends(tmp_path):
    data = _zip_bytes()
    part, final = str(tmp_path / "x.part"), str(tmp_path / "x.zip")
    parts = _chunks(data)
    for i, p in enumerate(parts):
        write_chunk(part, i, len(parts), p, MAX)
    finalize(part, final)
    assert open(final, "rb").read() == data
