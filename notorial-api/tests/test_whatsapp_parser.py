import pytest
import zipfile
import io
from datetime import datetime
from services.whatsapp_parser import parse_whatsapp_zip

def create_test_zip(chat_content: str, media_files: list = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr("_chat.txt", chat_content)
        if media_files:
            for name, content in media_files:
                z.writestr(name, content)
    return buf.getvalue()

def test_parse_android_ptbr():
    content = "09/03/2025, 14:30 - User A: Olá mundo\n09/03/2025, 14:31 - User B: Tudo bem?"
    zip_data = create_test_zip(content)
    
    result = parse_whatsapp_zip(zip_data)
    
    assert len(result["mensagens"]) == 2
    assert result["total_mensagens"] == 2
    assert "User A" in result["participantes"]
    assert "User B" in result["participantes"]
    assert result["mensagens"][0]["conteudo"] == "Olá mundo"
    assert result["periodo"]["inicio"] == "2025-03-09"

def test_parse_android_short_year():
    content = "09/03/25, 14:30 - User A: Teste ano curto"
    zip_data = create_test_zip(content)
    
    result = parse_whatsapp_zip(zip_data)
    
    assert result["mensagens"][0]["data"] == "09/03/2025"

def test_parse_ios_format():
    content = "[09/03/2025, 14:30:00] User A: Olá do iOS"
    zip_data = create_test_zip(content)
    
    result = parse_whatsapp_zip(zip_data)
    
    assert result["mensagens"][0]["remetente"] == "User A"
    assert result["mensagens"][0]["conteudo"] == "Olá do iOS"

def test_parse_multiline():
    content = "09/03/2025, 14:30 - User A: Linha 1\nLinha 2 continua aqui\n09/03/2025, 14:31 - User B: Nova msg"
    zip_data = create_test_zip(content)
    
    result = parse_whatsapp_zip(zip_data)
    
    assert len(result["mensagens"]) == 2
    assert result["mensagens"][0]["conteudo"] == "Linha 1\nLinha 2 continua aqui"

def test_audio_detection():
    content = "09/03/2025, 14:30 - User A: Áudio: PTT-20250309-WA0001.opus (5 s)"
    zip_data = create_test_zip(content, [("PTT-20250309-WA0001.opus", b"fake-audio")])
    
    result = parse_whatsapp_zip(zip_data)
    
    assert result["mensagens"][0]["tipo"] == "audio"
    assert result["total_audios"] == 1
    assert "PTT-20250309-WA0001.opus" in result["arquivos_extraidos"]

def test_media_omitted():
    content = "09/03/2025, 14:30 - User A: <Mídia oculta>"
    zip_data = create_test_zip(content)
    
    result = parse_whatsapp_zip(zip_data)
    
    assert result["mensagens"][0]["tipo"] == "midia_omitida"
    assert result["mensagens"][0]["arquivo"] is None

def test_date_filter():
    content = (
        "01/03/2025, 10:00 - User: Msg 1\n"
        "10/03/2025, 10:00 - User: Msg 2\n"
        "20/03/2025, 10:00 - User: Msg 3"
    )
    zip_data = create_test_zip(content)
    
    # Filtro: do dia 5 ao dia 15
    result = parse_whatsapp_zip(zip_data, start_date="2025-03-05", end_date="2025-03-15")
    
    assert len(result["mensagens"]) == 1
    assert result["mensagens"][0]["data"] == "10/03/2025"


def test_extracts_only_filtered_audios():
    content = (
        "01/03/2025, 10:00 - User: Áudio: PTT-20250301-WA0001.opus\n"
        "10/03/2025, 10:00 - User: Áudio: PTT-20250310-WA0002.opus"
    )
    zip_data = create_test_zip(
        content,
        [
            ("PTT-20250301-WA0001.opus", b"audio-1"),
            ("PTT-20250310-WA0002.opus", b"audio-2"),
        ],
    )

    result = parse_whatsapp_zip(zip_data, start_date="2025-03-10", end_date="2025-03-10")

    assert len(result["mensagens"]) == 1
    assert result["mensagens"][0]["arquivo"].endswith("PTT-20250310-WA0002.opus")
    assert len(result["arquivos_extraidos"]) == 1
    assert "PTT-20250310-WA0002.opus" in result["arquivos_extraidos"]

def test_empty_zip_error():
    zip_data = create_test_zip("", []) # empty content
    # Remove the _chat.txt to test "no chat found"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr("trash.txt", "nothing here")
    zip_data = buf.getvalue()
    
    with pytest.raises(ValueError, match="formato reconhecido"):
        parse_whatsapp_zip(zip_data)


# ── Regressão Bug 1: formatos de data/hora ao longo dos anos ─────────────────
import pytest
from services.whatsapp_parser import _parse_line


@pytest.mark.parametrize("line,data,hora", [
    ("09/03/2017, 14:30:25 - A: x", "09/03/2017", "14:30"),            # Android com segundos
    ("09/03/2017 14:30:25 - A: x", "09/03/2017", "14:30"),             # sem virgula
    ("9/3/2017, 14:30 - A: x", "09/03/2017", "14:30"),                 # 1 digito
    ("09/03/17, 14:30:15 - A: x", "09/03/2017", "14:30"),              # ano curto
    ("[09/03/17, 14:30:00] A: x", "09/03/2017", "14:30"),              # iOS ano curto
    ("[9/3/17, 14:30:00] A: x", "09/03/2017", "14:30"),                # iOS 1 digito
    ("[09/03/2025, 2:30:00 PM] A: x", "09/03/2025", "14:30"),          # iOS 12h
    ("09/03/2025, 2:30\u202fPM - A: x", "09/03/2025", "14:30"),        # U+202F
    ("09/03/2025, 12:05 AM - A: x", "09/03/2025", "00:05"),            # meia-noite
    ("09/03/2025, 12:05 PM - A: x", "09/03/2025", "12:05"),            # meio-dia
    ("09/03/2017 \u00e0s 14:30 - A: x", "09/03/2017", "14:30"),        # 'as'
    ("09.03.2017, 14:30 - A: x", "09/03/2017", "14:30"),               # separador ponto
    ("09/03/2025, 14:30 - A: x", "09/03/2025", "14:30"),               # formato original
    ("[09/03/2025, 14:30:00] A: x", "09/03/2025", "14:30"),            # iOS original
])
def test_parse_line_supported_formats(line, data, hora):
    parsed = _parse_line(line)
    assert parsed is not None, f"linha nao reconhecida: {line!r}"
    assert parsed["data"] == data
    assert parsed["hora"] == hora
    assert parsed["remetente"] == "A"


def test_mixed_formats_across_years_import_every_message():
    """Conversa com formato mudando entre 'versoes do app': nada pode ser perdido."""
    content = "\n".join([
        "09/03/17, 08:00 - A: msg 1",
        "09/03/2018, 09:00:10 - B: msg 2",
        "[10/03/19, 10:00:00] A: msg 3",
        "[11/03/2020, 1:00:00 PM] B: msg 4",
        "12/03/2021, 14:30 - A: msg 5\ncontinuacao multilinha",
    ])
    result = parse_whatsapp_zip(create_test_zip(content))

    assert result["total_mensagens"] == 5
    assert result["periodo"] == {"inicio": "2017-03-09", "fim": "2021-03-12"}
    assert result["mensagens"][-1]["conteudo"] == "msg 5\ncontinuacao multilinha"


def test_12h_messages_sort_chronologically():
    content = "\n".join([
        "09/03/2025, 11:50 PM - A: tarde",
        "09/03/2025, 12:10 AM - A: madrugada",
    ])
    result = parse_whatsapp_zip(create_test_zip(content))
    assert [m["conteudo"] for m in result["mensagens"]] == ["madrugada", "tarde"]


# ── Bug 3: dia final inclusivo, dia seguinte excluido ────────────────────────
def test_end_date_includes_whole_day_and_excludes_next():
    content = "\n".join([
        "21/09/2025, 23:59 - A: ontem",
        "22/09/2025, 00:01 - A: m1",
        "22/09/2025, 12:00 - B: m2",
        "22/09/2025, 23:59 - A: m3",
        "23/09/2025, 00:01 - B: amanha",
    ])
    result = parse_whatsapp_zip(create_test_zip(content), start_date="2025-09-22", end_date="2025-09-22")
    assert [m["conteudo"] for m in result["mensagens"]] == ["m1", "m2", "m3"]
