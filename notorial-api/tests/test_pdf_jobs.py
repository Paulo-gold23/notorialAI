from datetime import datetime, timedelta, timezone

from services import pdf_jobs


class _Query:
    def __init__(self, store, table):
        self.store, self.table, self.filters, self.patch = store, table, {}, None

    def select(self, *_):
        return self

    def update(self, patch):
        self.patch = patch
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def execute(self):
        rows = [r for r in self.store if all(r.get(k) == v for k, v in self.filters.items())]
        if self.patch is not None:
            for r in rows:
                r.update(self.patch)
        return type("R", (), {"data": rows})()


class _Client:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return _Query(self.rows, name)


def _job(status="generating", age_s=0, owner="u1"):
    ts = (datetime.now(timezone.utc) - timedelta(seconds=age_s)).isoformat()
    return {"id": "j1", "ata_id": "a1", "advogado_id": owner, "status": status, "updated_at": ts, "error": None}


def test_get_job_returns_running_job():
    client = _Client([_job()])
    assert pdf_jobs.get_job(client, "j1", "u1", "a1")["status"] == "generating"


def test_get_job_hides_other_users_job():
    client = _Client([_job(owner="u2")])
    assert pdf_jobs.get_job(client, "j1", "u1", "a1") is None


def test_get_job_marks_stale_job_as_error():
    client = _Client([_job(age_s=pdf_jobs.STALE_JOB_SECONDS + 60)])
    job = pdf_jobs.get_job(client, "j1", "u1", "a1")
    assert job["status"] == "error"
    assert client.rows[0]["status"] == "error"


def test_get_job_keeps_finished_job_untouched_even_if_old():
    client = _Client([_job(status="ready", age_s=pdf_jobs.STALE_JOB_SECONDS * 5)])
    assert pdf_jobs.get_job(client, "j1", "u1", "a1")["status"] == "ready"
