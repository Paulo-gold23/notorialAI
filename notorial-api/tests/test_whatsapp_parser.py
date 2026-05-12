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
    
    assert result["mensagens"][0]["tipo"] == "imagem"
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
