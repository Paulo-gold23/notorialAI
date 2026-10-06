import pytest

from config import settings
from services import image_tokens

ATA = "0fc556db-7792-44fa-9752-3f57207cf743"
OTHER = "70b497f9-4ce0-490a-885f-ca3b799a6427"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_KEY", "test-secret")


def test_valid_token_verifies():
    token = image_tokens.sign(ATA, "a.jpg")
    assert image_tokens.verify(ATA, "a.jpg", token)


def test_token_bound_to_filename_and_ata():
    token = image_tokens.sign(ATA, "a.jpg")
    assert not image_tokens.verify(ATA, "b.jpg", token)
    assert not image_tokens.verify(OTHER, "a.jpg", token)


def test_expired_token_rejected():
    token = image_tokens.sign(ATA, "a.jpg", ttl=10, now=1000)
    assert image_tokens.verify(ATA, "a.jpg", token, now=1005)
    assert not image_tokens.verify(ATA, "a.jpg", token, now=1011)


@pytest.mark.parametrize("bad", [None, "", "abc", "123.zzz", "x.y"])
def test_malformed_tokens_rejected(bad):
    assert not image_tokens.verify(ATA, "a.jpg", bad)


def test_tampered_signature_rejected():
    token = image_tokens.sign(ATA, "a.jpg")
    exp, sig = token.split(".")
    assert not image_tokens.verify(ATA, "a.jpg", f"{exp}.{'0' * len(sig)}")


def test_add_then_strip_roundtrip_only_touches_this_ata():
    html = (f'<img src="/api/atas/{ATA}/images/a.jpg"><img src="/api/atas/{OTHER}/images/b.jpg">'
            '<img src="data:image/jpeg;base64,AAAA">')
    signed = image_tokens.add_tokens(html, ATA)
    assert f"/api/atas/{ATA}/images/a.jpg?t=" in signed
    assert f"/api/atas/{OTHER}/images/b.jpg?t=" not in signed
    assert image_tokens.strip_tokens(signed, ATA) == html


def test_signed_url_token_verifies():
    signed = image_tokens.add_tokens(f'<img src="/api/atas/{ATA}/images/a.jpg">', ATA)
    token = signed.split("?t=")[1].split('"')[0]
    assert image_tokens.verify(ATA, "a.jpg", token)
