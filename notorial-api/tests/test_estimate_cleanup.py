import json
import os
import tempfile
import time
from services import estimate_service


class _FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self._deleted_ids = []
        self._current_delete_id = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        if col == "id" and self._current_delete_id is None:
            self._current_delete_id = val
        return self

    def delete(self):
        self._current_delete_id = None
        return self

    def execute(self):
        if self._current_delete_id is not None:
            target = self._current_delete_id
            self._deleted_ids.append(target)
            self.rows[:] = [r for r in self.rows if r["id"] != target]
            self._current_delete_id = None

        class _Res:
            pass

        res = _Res()
        res.data = list(self.rows)
        return res


class _FakeDB:
    def __init__(self, rows):
        self.atas = _FakeTable(rows)

    def table(self, name):
        assert name == "atas"
        return self.atas


def test_cleanup_estimate_cache_removes_expired_and_same_user(monkeypatch):
    monkeypatch.setattr(estimate_service, "_get_admin_client", lambda: None)
    estimate_service.estimate_cache.clear()

    fd1, path1 = tempfile.mkstemp(suffix=".zip")
    os.close(fd1)
    fd2, path2 = tempfile.mkstemp(suffix=".zip")
    os.close(fd2)

    now = time.time()
    estimate_service.estimate_cache["expired-id"] = {
        "temp_path": path1,
        "advogado_id": "user-other",
        "timestamp": now - estimate_service.ESTIMATE_CACHE_TTL - 10,
        "confirmed": False,
    }
    estimate_service.estimate_cache["same-user-id"] = {
        "temp_path": path2,
        "advogado_id": "user-1",
        "timestamp": now,
        "confirmed": False,
    }

    db_rows = [
        {
            "id": "db-expired",
            "advogado_id": "user-other",
            "status_message": json.dumps({"temp_path": None, "timestamp": now - 9999}),
            "created_at": "2026-01-01T00:00:00+00:00",
        },
        {
            "id": "db-same-user",
            "advogado_id": "user-1",
            "status_message": json.dumps({"temp_path": None, "timestamp": now}),
            "created_at": "2026-10-13T17:00:00+00:00",
        },
        {
            "id": "db-active-other",
            "advogado_id": "user-2",
            "status_message": json.dumps({"temp_path": None, "timestamp": now}),
            "created_at": "2026-10-13T17:00:00+00:00",
        },
    ]
    fake_db = _FakeDB(db_rows)

    cleaned = estimate_service.cleanup_estimate_cache(advogado_id="user-1", supabase_client=fake_db)

    assert cleaned == 4
    assert "expired-id" not in estimate_service.estimate_cache
    assert "same-user-id" not in estimate_service.estimate_cache
    assert not os.path.exists(path1)
    assert not os.path.exists(path2)
    assert [r["id"] for r in fake_db.atas.rows] == ["db-active-other"]
