"""Sprint 3 — receipts (metadata only, best-effort) and emission lines in the PDF."""
import hashlib
import io
import zipfile

from services import receipts
from services.pdf_generator import _wrap_html_for_pdf_v2


class _FakeQuery:
    def __init__(self, store, name, fail=False):
        self.store, self.name, self.fail = store, name, fail
        self._rows = None

    def insert(self, row):
        self._rows = row
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("db down")
        if self._rows is not None:
            self.store.setdefault(self.name, []).append(self._rows)
            return type("R", (), {"data": [self._rows]})()
        return type("R", (), {"data": list(reversed(self.store.get(self.name, [])))})()


class _FakeClient:
    def __init__(self, fail=False):
        self.store, self.fail = {}, fail

    def table(self, name):
        return _FakeQuery(self.store, name, self.fail)


def _zip_bytes(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_inventory_has_name_size_and_sha256_per_file():
    data = _zip_bytes({"chat.txt": b"hello", "Media/a.opus": b"\x00\x01"})
    entries, truncated = receipts.zip_inventory(data)
    by_name = {e["name"]: e for e in entries}
    assert truncated is False
    assert by_name["chat.txt"]["size"] == 5
    assert by_name["chat.txt"]["sha256"] == hashlib.sha256(b"hello").hexdigest()
    assert by_name["Media/a.opus"]["sha256"] == hashlib.sha256(b"\x00\x01").hexdigest()


def test_inventory_accepts_a_path(tmp_path):
    path = tmp_path / "x.zip"
    path.write_bytes(_zip_bytes({"chat.txt": b"abc"}))
    entries, _ = receipts.zip_inventory(str(path))
    assert [e["name"] for e in entries] == ["chat.txt"]


def test_inventory_failure_is_swallowed():
    assert receipts.safe_zip_inventory(b"not a zip") == (None, False)


def test_inventory_is_truncated_at_limit(monkeypatch):
    monkeypatch.setattr(receipts, "MAX_INVENTORY_ENTRIES", 2)
    entries, truncated = receipts.zip_inventory(_zip_bytes({"a": b"1", "b": b"2", "c": b"3"}))
    assert len(entries) == 2 and truncated is True


def test_protocol_matches_pdf_banner_format():
    assert receipts.protocol_for("e55349b0-31a1-43cd-bb64-c5ef7517e786") == "LVX-E55349B0"


def test_first_emission_is_one_without_previous_hash():
    assert receipts.next_emission(_FakeClient(), "ata-1") == (1, None)


def test_next_emission_follows_the_last_receipt():
    client = _FakeClient()
    assert receipts.record_pdf_issuance(
        client, ata_id="ata-1", emission_number=1, pdf_hash="h1",
        previous_pdf_hash=None, input_html="<p>x</p>", annotation_count=0,
    )
    assert receipts.next_emission(client, "ata-1") == (2, "h1")


def test_issuance_receipt_stores_hashes_and_counts_but_no_content():
    client = _FakeClient()
    receipts.record_pdf_issuance(
        client, ata_id="ata-1", emission_number=1, pdf_hash="h1",
        previous_pdf_hash=None, input_html="<p>conversa secreta</p>", annotation_count=3,
    )
    row = client.store["pdf_issuance_receipts"][0]
    assert row["input_html_hash"] == hashlib.sha256(b"<p>conversa secreta</p>").hexdigest()
    assert row["annotation_count"] == 3
    assert "advogado_id" not in row
    assert "conversa secreta" not in repr(row)


def test_processing_receipt_has_no_account_link_or_content():
    client = _FakeClient()
    ok = receipts.record_processing_receipt(
        client, ata_id="e55349b0-31a1", zip_filename="chat.zip", zip_hash="zh", zip_size=10,
        inventory=[{"name": "chat.txt", "size": 1, "sha256": "x"}], inventory_truncated=False,
        parser_totals={"mensagens": 2}, audio_stats={"merged": 0}, openai_model="gpt-x",
    )
    row = client.store["processing_receipts"][0]
    assert ok and row["protocol"] == "LVX-E55349B0"
    assert "advogado_id" not in row
    assert row["prompt_hash"] and row["template_version"] == receipts.TEMPLATE_VERSION


def test_receipt_failures_never_raise():
    failing = _FakeClient(fail=True)
    assert receipts.next_emission(failing, "a") == (None, None)
    assert receipts.record_pdf_issuance(
        failing, ata_id="a", emission_number=1, pdf_hash="h",
        previous_pdf_hash=None, input_html="", annotation_count=0) is False
    assert receipts.record_processing_receipt(
        failing, ata_id="a", zip_filename=None, zip_hash=None, zip_size=None, inventory=None,
        inventory_truncated=False, parser_totals={}, audio_stats={}, openai_model="m") is False
    assert receipts.next_emission(None, "a") == (None, None)


def test_pdf_prints_emission_number_and_previous_hash():
    out = _wrap_html_for_pdf_v2("<h1>R</h1><p>t</p>", ata_id="e55349b0-aaaa",
                                emission_number=2, previous_pdf_hash="abc123")
    assert "N.º 2" in out and "abc123" in out and "HASH DA EMISSÃO ANTERIOR" in out


def test_pdf_first_emission_has_no_previous_hash_line():
    out = _wrap_html_for_pdf_v2("<h1>R</h1><p>t</p>", ata_id="e55349b0-aaaa", emission_number=1)
    assert "N.º 1" in out and "HASH DA EMISSÃO ANTERIOR" not in out


def test_pdf_without_receipt_has_no_emission_line():
    out = _wrap_html_for_pdf_v2("<h1>R</h1><p>t</p>", ata_id="e55349b0-aaaa")
    assert "EMISSÃO:" not in out
