import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
from fastapi import HTTPException

# We import the functions and objects to test
from routers.atas import merge_images_into_html, list_atas, delete_ata, AuthContext

# ──────────────────────────────────────────────────────────────────────────────
# 1. Tests for merge_images_into_html
# ──────────────────────────────────────────────────────────────────────────────

def test_merge_images_empty_current():
    incoming = "<p>New Content</p>"
    result = merge_images_into_html(incoming, "")
    assert result == incoming


def test_merge_images_no_img_in_current():
    incoming = "<p>New Content</p>"
    current = "<p>Old Content without images</p>"
    result = merge_images_into_html(incoming, current)
    assert result == incoming


def test_merge_images_restore_base64_src():
    # Frontend loses the base64 src during editing, but preserves the class and alt
    incoming = '<p>Some text</p><img class="ata-imagem-anexada" alt="imagem_1.jpg" src="" /><p>More text</p>'
    # Banco contains the base64 src
    current = '<p>Some text</p><img class="ata-imagem-anexada" alt="imagem_1.jpg" src="data:image/jpeg;base64,ABCDEF==" /><p>More text</p>'
    
    result = merge_images_into_html(incoming, current)
    assert 'src="data:image/jpeg;base64,ABCDEF=="' in result
    assert 'alt="imagem_1.jpg"' in result


def test_merge_images_missing_with_context():
    # Frontend completely lost the image tag, but we want to restore it using text context
    incoming = '<p>O réu confessou o crime naquele dia.</p><p>As provas documentais estão anexas.</p>'
    current = '<p>O réu confessou o crime naquele dia.</p><img class="ata-imagem-anexada" alt="confissao.jpg" src="data:image/jpeg;base64,XYZ==" /><p>As provas documentais estão anexas.</p>'
    
    result = merge_images_into_html(incoming, current)
    # The image should be restored after the context text "O réu confessou o crime naquele dia."
    assert 'alt="confissao.jpg"' in result
    assert 'src="data:image/jpeg;base64,XYZ=="' in result


def test_merge_images_missing_no_context_falls_back_to_end():
    # Frontend completely lost the image tag, and there's no matching context text
    incoming = '<p>Texto totalmente diferente do original.</p>'
    current = '<p>O réu confessou o crime naquele dia.</p><img class="ata-imagem-anexada" alt="confissao.jpg" src="data:image/jpeg;base64,XYZ==" />'
    
    result = merge_images_into_html(incoming, current)
    # The image should be appended at the end of incoming HTML
    assert result.endswith('<p><img class="ata-imagem-anexada" alt="confissao.jpg" src="data:image/jpeg;base64,XYZ==" /></p>')

# ──────────────────────────────────────────────────────────────────────────────
# 2. Tests for Soft Delete
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_atas_filters_deleted_at_null():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [
        {"id": "ata-1", "titulo": "Ata Ativa", "deleted_at": None}
    ]
    # Set up mock chain with order and range pagination
    mock_is = mock_client.table.return_value.select.return_value.is_
    mock_order = mock_is.return_value.order
    mock_range = mock_order.return_value.range
    mock_range.return_value.execute.return_value = mock_response

    mock_auth_ctx = MagicMock(spec=AuthContext)
    mock_auth_ctx.client = mock_client
    mock_auth_ctx.advogado_id = "test-advogado"

    res = await list_atas(auth_ctx=mock_auth_ctx)
    assert len(res) == 1
    assert res[0]["id"] == "ata-1"
    # Verify that the correct chain was called
    mock_client.table.assert_called_with("atas")
    mock_client.table.return_value.select.assert_called_with("*")
    mock_is.assert_called_with("deleted_at", "null")
    mock_order.assert_called_with("created_at", desc=True)
    mock_range.assert_called_with(0, 49)


@pytest.mark.asyncio
async def test_delete_ata_performs_soft_delete():
    import uuid
    valid_ata_id = str(uuid.uuid4())

    mock_client = MagicMock()
    # Mock the ownership check chain: .select().eq().eq().is_().execute()
    mock_select_chain = MagicMock()
    mock_select_chain.execute.return_value.data = [{"id": valid_ata_id}]
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.is_.return_value = mock_select_chain

    # Mock the update chain: .update().eq().eq().execute()
    mock_update_chain = MagicMock()
    mock_update_chain.execute.return_value.data = [{"id": valid_ata_id, "deleted_at": "2026-01-01T00:00:00Z"}]
    mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value = mock_update_chain

    mock_auth_ctx = MagicMock(spec=AuthContext)
    mock_auth_ctx.client = mock_client
    mock_auth_ctx.advogado_id = "test-advogado"

    # Patch get_supabase_admin_client to return None so fallback user-token path is tested
    with patch("routers.atas.get_supabase_admin_client", return_value=None):
        res = await delete_ata(ata_id=valid_ata_id, auth_ctx=mock_auth_ctx)

    assert res == {"status": "success"}

    # Verify that update was called with a deleted_at timestamp
    update_args = mock_client.table.return_value.update.call_args[0][0]
    assert "deleted_at" in update_args
    assert isinstance(update_args["deleted_at"], str)

