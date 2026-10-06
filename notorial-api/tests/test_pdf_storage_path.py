import uuid

from services.pdf_cache_service import build_pdf_storage_path

OWNER = "e69860b8-2b6e-4799-9361-2fb4ce754ece"


def test_valid_uuid_builds_owner_scoped_path():
    pdf_id = str(uuid.uuid4())
    assert build_pdf_storage_path(OWNER, pdf_id) == f"{OWNER}/{pdf_id}.pdf"


def test_non_uuid_pdf_id_is_rejected():
    assert build_pdf_storage_path(OWNER, "not-a-uuid") is None


def test_path_traversal_in_pdf_id_is_rejected():
    assert build_pdf_storage_path(OWNER, "../other/" + str(uuid.uuid4())) is None


def test_invalid_owner_is_rejected():
    pdf_id = str(uuid.uuid4())
    assert build_pdf_storage_path("", pdf_id) is None
    assert build_pdf_storage_path("a/../b", pdf_id) is None
    assert build_pdf_storage_path(None, pdf_id) is None
