import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from middleware.auth import get_current_user_id
import hashlib

# Override get_current_user_id dependency to return a dummy user
MOCK_USER_ID = "test-user-uuid"
app.dependency_overrides[get_current_user_id] = lambda: MOCK_USER_ID

# Disable rate limiting for testing
if hasattr(app.state, "limiter"):
    app.state.limiter.enabled = False

client = TestClient(app)

# Helper function to compute hash for assertions
def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256((pin + salt).encode("utf-8")).hexdigest()

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@pytest.fixture
def mock_supabase():
    with patch("routers.auth.supabase_admin") as mock_admin:
        # Mock database response structures for builder pattern
        mock_table = MagicMock()
        mock_admin.table.return_value = mock_table
        
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        
        mock_eq = MagicMock()
        mock_select.eq.return_value = mock_eq
        
        mock_execute = MagicMock()
        mock_eq.execute.return_value = mock_execute
        
        yield mock_admin, mock_table, mock_execute


def test_set_signature_pin_success(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    # Mock successful update and select email query
    mock_execute.data = [{"email": "test@legisvox.com.br"}]
    
    payload = {
        "pin": "1234",
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/set", json=payload)
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Assert PIN hash update was called
    expected_hash = _hash_pin("1234", MOCK_USER_ID)
    mock_table.update.assert_any_call({
        "senha_assinatura_hash": expected_hash,
        "senha_assinatura_erros": 0,
        "senha_assinatura_bloqueado": False
    })


def test_set_signature_pin_invalid_digits(mock_supabase):
    payload = {
        "pin": "abcd", # Not numeric
        "device_fingerprint": "mock-fingerprint-1"
    }
    response = client.post("/api/auth/signature-pin/set", json=payload)
    assert response.status_code == 422


def test_verify_signature_pin_success(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    # Mock data returned by database when reading advocate profile
    expected_hash = _hash_pin("9999", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": expected_hash,
        "senha_assinatura_erros": 0,
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "9999",
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/verify", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Should update/reset error count to 0
    mock_table.update.assert_any_call({"senha_assinatura_erros": 0})


def test_verify_signature_pin_failed_attempts(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    expected_hash = _hash_pin("9999", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": expected_hash,
        "senha_assinatura_erros": 2, # Already has 2 errors
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "0000", # Incorrect PIN
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/verify", json=payload)
    assert response.status_code == 401
    assert "tentativa" in response.json()["detail"]
    
    # Errors incremented to 3, blocked is still False
    mock_table.update.assert_any_call({
        "senha_assinatura_erros": 3,
        "senha_assinatura_bloqueado": False
    })


def test_verify_signature_pin_lockout(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    expected_hash = _hash_pin("9999", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": expected_hash,
        "senha_assinatura_erros": 4, # Next failure will be 5th
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "0000", # Incorrect PIN
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/verify", json=payload)
    assert response.status_code == 403
    assert "bloqueada" in response.json()["detail"]
    
    # Should set blocked = True
    mock_table.update.assert_any_call({
        "senha_assinatura_erros": 5,
        "senha_assinatura_bloqueado": True
    })


def test_verify_signature_pin_already_locked(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": "some-hash",
        "senha_assinatura_erros": 5,
        "senha_assinatura_bloqueado": True
    }]
    
    payload = {
        "pin": "9999",
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/verify", json=payload)
    assert response.status_code == 403
    assert "bloqueada" in response.json()["detail"]


def test_forgot_signature_pin_generates_token(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    mock_execute.data = [{"email": "test@legisvox.com.br"}]
    
    payload = {
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    with patch("routers.auth.settings") as mock_settings:
        mock_settings.ALLOW_TEST_BYPASS = True
        
        response = client.post("/api/auth/signature-pin/forgot", json=payload)
        
        assert response.status_code == 200
        assert "test_token_bypass" in response.json()
        assert len(response.json()["test_token_bypass"]) == 6
        
        # Verify token hash update was called
        mock_table.update.assert_called()


def test_reset_signature_pin_success(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    token = "654321"
    hashed_token = _hash_token(token)
    
    # Mock check token query
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_token_hash": hashed_token,
        "senha_assinatura_token_exp": "2030-01-01T12:00:00+00:00" # Far in the future
    }]
    
    payload = {
        "token": token,
        "new_pin": "5555",
        "device_fingerprint": "mock-fingerprint-1"
    }
    
    response = client.post("/api/auth/signature-pin/reset", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Should update and reset all PIN fields
    expected_new_hash = _hash_pin("5555", MOCK_USER_ID)
    mock_table.update.assert_any_call({
        "senha_assinatura_hash": expected_new_hash,
        "senha_assinatura_erros": 0,
        "senha_assinatura_bloqueado": False,
        "senha_assinatura_token_hash": None,
        "senha_assinatura_token_exp": None
    })


def test_set_signature_pin_requires_current_pin_if_exists(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    # Mock user having an existing PIN hash
    existing_hash = _hash_pin("1234", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": existing_hash,
        "senha_assinatura_erros": 0,
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "5678", # New PIN
        "device_fingerprint": "mock-fingerprint-1"
        # current_pin is missing!
    }
    
    response = client.post("/api/auth/signature-pin/set", json=payload)
    
    assert response.status_code == 400
    assert "atual é obrigatória" in response.json()["detail"]


def test_set_signature_pin_wrong_current_pin(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    existing_hash = _hash_pin("1234", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": existing_hash,
        "senha_assinatura_erros": 1,
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "5678", # New PIN
        "device_fingerprint": "mock-fingerprint-1",
        "current_pin": "0000" # Wrong current PIN
    }
    
    response = client.post("/api/auth/signature-pin/set", json=payload)
    
    assert response.status_code == 400
    assert "atual incorreta" in response.json()["detail"]
    
    # Errors incremented to 2, blocked remains False
    mock_table.update.assert_any_call({
        "senha_assinatura_erros": 2,
        "senha_assinatura_bloqueado": False
    })


def test_set_signature_pin_lockout(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    existing_hash = _hash_pin("1234", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": existing_hash,
        "senha_assinatura_erros": 4, # 4 errors already
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "5678", # New PIN
        "device_fingerprint": "mock-fingerprint-1",
        "current_pin": "0000" # 5th incorrect attempt
    }
    
    response = client.post("/api/auth/signature-pin/set", json=payload)
    
    assert response.status_code == 403
    assert "bloqueada" in response.json()["detail"]
    
    # Locked out
    mock_table.update.assert_any_call({
        "senha_assinatura_erros": 5,
        "senha_assinatura_bloqueado": True
    })


def test_set_signature_pin_correct_current_pin_success(mock_supabase):
    mock_admin, mock_table, mock_execute = mock_supabase
    
    existing_hash = _hash_pin("1234", MOCK_USER_ID)
    mock_execute.data = [{
        "email": "test@legisvox.com.br",
        "senha_assinatura_hash": existing_hash,
        "senha_assinatura_erros": 3,
        "senha_assinatura_bloqueado": False
    }]
    
    payload = {
        "pin": "5678", # New PIN
        "device_fingerprint": "mock-fingerprint-1",
        "current_pin": "1234" # Correct current PIN
    }
    
    response = client.post("/api/auth/signature-pin/set", json=payload)
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Should update and reset all errors
    expected_new_hash = _hash_pin("5678", MOCK_USER_ID)
    mock_table.update.assert_any_call({
        "senha_assinatura_hash": expected_new_hash,
        "senha_assinatura_erros": 0,
        "senha_assinatura_bloqueado": False
    })


# ── Tests for GET /signature-pin/status ─────────────────────────────────────

def test_get_signature_pin_status_no_pin(mock_supabase):
    """User with no PIN: has_pin=False, bloqueado=False, 5 attempts remaining."""
    mock_admin, mock_table, mock_execute = mock_supabase
    mock_execute.data = [{
        "senha_assinatura_hash": None,
        "senha_assinatura_bloqueado": False,
        "senha_assinatura_erros": 0,
    }]

    response = client.get("/api/auth/signature-pin/status")
    assert response.status_code == 200
    body = response.json()
    assert body["has_pin"] is False
    assert body["bloqueado"] is False
    assert body["tentativas_restantes"] == 5
    # Hash must never be returned
    assert "senha_assinatura_hash" not in body


def test_get_signature_pin_status_with_pin(mock_supabase):
    """User with a PIN: has_pin=True, bloqueado=False, full attempts remaining."""
    mock_admin, mock_table, mock_execute = mock_supabase
    mock_execute.data = [{
        "senha_assinatura_hash": _hash_pin("1234", MOCK_USER_ID),
        "senha_assinatura_bloqueado": False,
        "senha_assinatura_erros": 0,
    }]

    response = client.get("/api/auth/signature-pin/status")
    assert response.status_code == 200
    body = response.json()
    assert body["has_pin"] is True
    assert body["bloqueado"] is False
    assert body["tentativas_restantes"] == 5
    assert "senha_assinatura_hash" not in body


def test_get_signature_pin_status_locked(mock_supabase):
    """User with a locked account: has_pin=True, bloqueado=True, 0 attempts remaining."""
    mock_admin, mock_table, mock_execute = mock_supabase
    mock_execute.data = [{
        "senha_assinatura_hash": _hash_pin("1234", MOCK_USER_ID),
        "senha_assinatura_bloqueado": True,
        "senha_assinatura_erros": 5,
    }]

    response = client.get("/api/auth/signature-pin/status")
    assert response.status_code == 200
    body = response.json()
    assert body["has_pin"] is True
    assert body["bloqueado"] is True
    assert body["tentativas_restantes"] == 0
    assert "senha_assinatura_hash" not in body


def test_get_signature_pin_status_partial_errors(mock_supabase):
    """User with 3 failed attempts: 2 remaining."""
    mock_admin, mock_table, mock_execute = mock_supabase
    mock_execute.data = [{
        "senha_assinatura_hash": _hash_pin("1234", MOCK_USER_ID),
        "senha_assinatura_bloqueado": False,
        "senha_assinatura_erros": 3,
    }]

    response = client.get("/api/auth/signature-pin/status")
    assert response.status_code == 200
    body = response.json()
    assert body["has_pin"] is True
    assert body["tentativas_restantes"] == 2


def test_get_signature_pin_status_not_found(mock_supabase):
    """User not found in DB: 404."""
    mock_admin, mock_table, mock_execute = mock_supabase
    mock_execute.data = []

    response = client.get("/api/auth/signature-pin/status")
    assert response.status_code == 404
