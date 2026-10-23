"""Piloto: imagens anexadas maiores no PDF v2 (somente admins)."""
from services.pdf_generator import _wrap_html_for_pdf_v2

_HTML = '<h1>R</h1><p><img class="ata-imagem-anexada" src="data:image/jpeg;base64,dGVzdGU=" alt="a.jpg" /></p>'


def test_default_keeps_original_image_limits():
    out = _wrap_html_for_pdf_v2(_HTML, ata_id="e55349b0-aaaa")

    assert "max-height: 260px;" in out
    assert "max-height: 340px;" not in out


def test_larger_images_flag_appends_override_after_base_css():
    out = _wrap_html_for_pdf_v2(_HTML, ata_id="e55349b0-aaaa", larger_images=True)

    assert "max-height: 340px;" in out
    assert "max-width: 78%;" in out
    assert "break-inside: avoid;" in out
    # Override must come after the base rule to win the cascade
    assert out.index("max-height: 340px;") > out.index("max-height: 260px;")
