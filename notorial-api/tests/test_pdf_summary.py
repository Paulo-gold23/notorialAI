"""Sprint 1 — texto e contagens do quadro-resumo e numeração de anotações no PDF."""
import re

from services.pdf_generator import (
    inject_final_verification_box,
    inject_ressalva_blocks_for_pdf,
    sanitize_user_html,
    _wrap_html_for_pdf_v2,
)


def _day(date: str, body: str) -> str:
    return f'<h3 id="data-{date.replace("/", "")}">{date}</h3>{body}'


def _audio(ts: str, sender: str, inner: str) -> str:
    return f"<p>\U0001f399\ufe0f \u00c1udio Transcrito &mdash; [{ts}] {sender}: {inner}</p>"


def _summary(html: str) -> str:
    return inject_final_verification_box(html, use_v2_style=True)


# ── Quadro-resumo: redação ───────────────────────────────────────────────────

def test_summary_uses_neutral_title_and_drops_unsupported_claims():
    out = _summary(_day("01/01/2024", "<p>[01/01/2024 10:00] Ana: oi</p>"))

    assert "QUADRO-RESUMO DO PROCESSAMENTO" in out
    for forbidden in (
        "CERTID\u00c3O",
        "FORENSE",
        "100% de paridade",
        "carimbo temporal",
        "fidelidade sem\u00e2ntica",
        "27037",
        "preservados",
    ):
        assert forbidden not in out, forbidden
    assert "declara\u00e7\u00e3o da pr\u00f3pria plataforma" in out
    assert "sem avalia\u00e7\u00e3o independente" in out


def test_banner_has_no_iso_conformity_seal():
    wrapped = _wrap_html_for_pdf_v2("<h1>Relat\u00f3rio</h1><p>texto</p>", ata_id="e55349b0-aaaa")
    assert "CONFORMIDADE" not in wrapped
    assert "27037" not in wrapped
    assert "PROTOCOLO:" in wrapped


def test_message_count_is_labelled_as_document_count():
    html = _day(
        "01/01/2024",
        "<p>[01/01/2024 10:00] Ana: a</p><p>[01/01/2024 10:01:05] Bruno: b</p>",
    )
    out = _summary(html)
    assert "2 registros datados no corpo deste documento" in out


# ── Áudios ───────────────────────────────────────────────────────────────────

def test_audio_classification_separates_transcribed_missing_and_failed():
    html = _day(
        "01/01/2024",
        _audio("01/01/2024 10:00", "Ana", "<strong>&ldquo;ol\u00e1 tudo bem&rdquo;</strong>")
        + _audio("01/01/2024 10:01", "Ana", "<strong>&ldquo;segunda fala&rdquo;</strong>")
        + _audio("01/01/2024 10:02", "Bruno", "<em>(\u00e1udio sem transcri\u00e7\u00e3o)</em>")
        + _audio("01/01/2024 10:03", "Bruno", "<strong>&ldquo;[Erro 500 na transcri\u00e7\u00e3o]&rdquo;</strong>")
        + _audio("01/01/2024 10:04", "Bruno", "<strong>&ldquo;[\u00c1udio sem fala detectada]&rdquo;</strong>"),
    )
    out = _summary(html)

    assert "05 \u00e1udios no documento" in out
    assert "2 com transcri\u00e7\u00e3o autom\u00e1tica" in out
    assert "1 sem transcri\u00e7\u00e3o" in out
    assert "2 com falha ou sem fala detectada" in out


def test_audio_classification_handles_literal_quote_characters():
    html = _day(
        "01/01/2024",
        _audio("01/01/2024 10:00", "Ana", "<strong>\u201c[Timeout - \u00e1udio muito longo para transcrever]\u201d</strong>"),
    )
    out = _summary(html)
    assert "01 \u00e1udio no documento" in out
    assert "0 com transcri\u00e7\u00e3o autom\u00e1tica" in out
    assert "1 com falha ou sem fala detectada" in out


def test_no_audio_message():
    out = _summary(_day("01/01/2024", "<p>[01/01/2024 10:00] Ana: oi</p>"))
    assert "nenhum \u00e1udio" in out


# ── Mídias ───────────────────────────────────────────────────────────────────

def test_media_unavailable_distinguishes_export_absence_from_processing():
    html = _day(
        "01/01/2024",
        "<p>[01/01/2024 10:00] Ana: [M\u00eddia n\u00e3o dispon\u00edvel no export]</p>"
        "<p>[01/01/2024 10:01] Ana: [M\u00eddia n\u00e3o dispon\u00edvel no export]</p>"
        '<div class="ata-midia-ausente">\u26a0\ufe0f Imagem referenciada n\u00e3o encontrada no ZIP: IMG-1.jpg</div>',
    )
    out = _summary(html)
    assert "2 ausente(s) na exporta\u00e7\u00e3o recebida" in out
    assert "1 n\u00e3o incorporada(s)" in out


def test_images_and_documents_are_counted_without_preservation_claim():
    html = _day(
        "01/01/2024",
        '<p><img class="ata-imagem-anexada" src="data:image/jpeg;base64,AAAA" alt="a.jpg"></p>'
        '<p><img class="ata-imagem-anexada" src="data:image/jpeg;base64,BBBB" alt="b.jpg"></p>'
        "<p>[01/01/2024 10:02] Ana: [Documento: contrato.pdf]</p>",
    )
    out = _summary(html)
    assert "2 imagem(ns) incorporada(s) em resolu\u00e7\u00e3o reduzida" in out
    assert "1 documento(s) indicado(s)" in out
    assert "preservad" not in out


# ── Anotações: contagem = numeração ──────────────────────────────────────────

def _numbers(html: str) -> list[int]:
    return [int(n) for n in re.findall(r'pdf-ressalva-num">\[(\d+)\]', html)]


def _full_pipeline(raw_html: str) -> str:
    sanitized = sanitize_user_html(raw_html)
    return _summary(inject_ressalva_blocks_for_pdf(sanitized))


def test_note_inside_day_header_is_numbered_and_counted():
    raw = (
        '<h3 id="data-01012024">01/01/2024</h3>'
        '<p>[01/01/2024 10:00] A: <span data-user-note="Primeira" class="user-note-wrapper">x</span></p>'
        '<h3 id="data-02012024"><span data-user-note="No cabecalho" class="user-note-wrapper">02/01/2024</span></h3>'
        '<p>[02/01/2024 10:00] B: <span data-user-note="Nao" class="user-note-wrapper">y</span></p>'
    )
    out = _full_pipeline(raw)

    assert _numbers(out) == [1, 2, 3]
    assert "3 anota\u00e7\u00f5es" in out and "[1] a [3]" in out


def test_wrapper_without_note_text_is_neither_numbered_nor_counted():
    raw = (
        '<h3 id="data-01012024">01/01/2024</h3>'
        '<p><span class="user-note-wrapper">orfao</span> '
        '<span data-user-note="Valida" class="user-note-wrapper">z</span></p>'
    )
    out = _full_pipeline(raw)

    assert _numbers(out) == [1]
    assert "1 anota\u00e7\u00e3o numerada" in out


def test_declared_count_always_equals_numbers_printed():
    raw = (
        '<h3 id="data-01012024"><span data-user-note="H1" class="user-note-wrapper">01/01/2024</span></h3>'
        '<p><span data-user-note="A" class="user-note-wrapper">a</span>'
        '<strong><span data-user-note="A" class="user-note-wrapper">b</span></strong></p>'
        '<p><span class="user-note-wrapper">sem nota</span></p>'
    )
    out = _full_pipeline(raw)
    printed = _numbers(out)
    declared = re.search(r"(\d+) anota\u00e7", out)

    assert declared is not None
    assert int(declared.group(1)) == len(printed) == 3
    assert printed == list(range(1, len(printed) + 1))


def test_no_notes_message():
    out = _full_pipeline(_day("01/01/2024", "<p>[01/01/2024 10:00] A: x</p>"))
    assert "nenhuma anota\u00e7\u00e3o inserida" in out
