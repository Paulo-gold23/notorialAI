"""Imagens anexadas maiores no PDF v2 (80% largura / 380px altura para todos os usuários)."""
from services.pdf_generator import _wrap_html_for_pdf_v2

_HTML = '<h1>R</h1><p><img class="ata-imagem-anexada" src="data:image/jpeg;base64,dGVzdGU=" alt="a.jpg" /></p>'


def test_v2_uses_enlarged_image_limits_for_all_users():
    out = _wrap_html_for_pdf_v2(_HTML, ata_id="e55349b0-aaaa")

    assert "max-width: 80%;" in out
    assert "max-height: 380px;" in out
    assert "break-inside: avoid;" in out
    assert "page-break-inside: avoid;" in out
