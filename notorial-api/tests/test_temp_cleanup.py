import os

from services.temp_cleanup import cleanup_temp_uploads

HOUR = 3600


def _touch(path, age_hours, now, size=10):
    path.write_bytes(b"x" * size)
    ts = now - age_hours * HOUR
    os.utime(path, (ts, ts))
    return path


def test_removes_only_old_matching_files(tmp_path):
    # Arrange
    now = 1_000_000_000.0
    old_zip = _touch(tmp_path / "legisvox_upload_a.zip", 7, now, size=100)
    old_part = _touch(tmp_path / "legisvox_chunk_a.part", 8, now, size=50)
    old_mkstemp = _touch(tmp_path / "tmpabc123.zip", 9, now)
    fresh_zip = _touch(tmp_path / "legisvox_upload_b.zip", 1, now)
    unrelated = _touch(tmp_path / "other.zip", 48, now)

    # Act
    removed, freed = cleanup_temp_uploads(6, temp_dir=str(tmp_path), now=now)

    # Assert
    assert (removed, freed) == (3, 160)
    assert not old_zip.exists() and not old_part.exists() and not old_mkstemp.exists()
    assert fresh_zip.exists() and unrelated.exists()


def test_empty_dir_is_noop(tmp_path):
    assert cleanup_temp_uploads(6, temp_dir=str(tmp_path)) == (0, 0)
