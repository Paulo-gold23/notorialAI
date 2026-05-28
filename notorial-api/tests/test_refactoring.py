import pytest
from services.pdf_generator import sanitize_user_html
from routers.atas import get_ata_status, AuthContext
from unittest.mock import MagicMock, AsyncMock, patch

def test_sanitize_user_html_security():
    # 1. Tests blocking of script tags
    dirty_html = "<p>Texto normal <script>alert('XSS')</script></p>"
    clean_html = sanitize_user_html(dirty_html)
    assert "<script>" not in clean_html
    assert "alert" not in clean_html

    # 2. Tests blocking of file:// schemes (prevent SSRF / Local File Read)
    ssrf_html = '<a href="file:///etc/passwd">Clique aqui</a> <img src="file:///var/log/syslog" />'
    clean_ssrf = sanitize_user_html(ssrf_html)
    assert "file://" not in clean_ssrf
    # Allowed tags but without the banned url schemes
    assert "href" not in clean_ssrf
    assert "src" not in clean_ssrf

    # 3. Tests preserving base64 data URIs and safe styles
    img_b64 = '<img src="data:image/jpeg;base64,dGVzdGU=" style="max-width: 70%;" />'
    clean_img = sanitize_user_html(img_b64)
    assert 'src="data:image/jpeg;base64,dGVzdGU="' in clean_img
    assert 'style="max-width: 70%;"' in clean_img

@pytest.mark.asyncio
async def test_get_ata_status_progress_parsing():
    # Mock auth context and client
    mock_client = MagicMock()
    # Mocking supabase table execute response
    mock_response = MagicMock()
    mock_response.data = [{
        "status": "transcribing",
        "status_message": "35%: Transcrevendo áudios: 1/3 (0 erros)",
        "error_message": None
    }]
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

    mock_auth_ctx = MagicMock(spec=AuthContext)
    mock_auth_ctx.client = mock_client
    mock_auth_ctx.advogado_id = "test-advogado"

    with patch("routers.atas.local_results", {}):
        # We call the FastAPI router get_ata_status helper
        res = await get_ata_status(ata_id="test-ata-id", auth_ctx=mock_auth_ctx)
        
        # Verify that we extracted progress and cleaned status_message
        assert res["progress"] == 35
        assert res["status_message"] == "Transcrevendo áudios: 1/3 (0 erros)"
        assert res["status"] == "transcribing"
