import pytest
import respx
import httpx
import json
from services.ai_organizer import (
    _chat_to_text, 
    _split_into_chunks, 
    _apply_formatting,
    organize_chat_with_ai
)

def test_chat_to_text_formatting():
    chat_json = {
        "participantes": ["Alice", "Bob"],
        "periodo": {"inicio": "01/01/2024", "fim": "02/01/2024"},
        "mensagens": [
            {
                "data": "01/01/2024",
                "hora": "10:00",
                "remetente": "Alice",
                "tipo": "texto",
                "conteudo": "Olá Bob"
            },
            {
                "data": "01/01/2024",
                "hora": "10:01",
                "remetente": "Bob",
                "tipo": "audio",
                "transcricao": "Oi Alice"
            }
        ]
    }
    text = _chat_to_text(chat_json)
    assert "PARTICIPANTES: Alice, Bob" in text
    assert '[01/01/2024 10:00] Alice: "Olá Bob"' in text
    assert '\U0001f399\ufe0f [ÁUDIO TRANSCRITO]: "Oi Alice"' in text

def test_apply_formatting_quotes():
    input_text = 'O remetente enviou "Isso é um teste" para o destinatário.'
    output_text = _apply_formatting(input_text)
    assert '**"Isso é um teste"**' in output_text

def test_apply_formatting_error():
    input_text = '[01/01/2024 10:00] Alice: 🎙️ [ÁUDIO TRANSCRITO]: [Erro na transcrição]'
    output_text = _apply_formatting(input_text)
    # Line should be bolded
    assert '**[01/01/2024 10:00] Alice: 🎙️ [ÁUDIO TRANSCRITO]: [Erro na transcrição]**' in output_text

def test_split_into_chunks():
    # MAX_CHARS_PER_CHUNK is 40000
    long_text = "a" * 50000
    chunks = _split_into_chunks(long_text)
    assert len(chunks) == 2

from unittest.mock import patch

@pytest.mark.asyncio
async def test_organize_chat_with_ai_mock():
    chat_json = {
        "participantes": ["A"],
        "mensagens": [{"data":"1","hora":"1","remetente":"A","conteudo":"oi"}]
    }
    
    with respx.mock:
        respx.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(200, json={
                "choices": [{"message": {"content": "# Título\nCorpo do documento"}}],
                "usage": {"total_tokens": 10}
            })
        )
        
        with patch("services.ai_organizer.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = "dummy-key"
            result = await organize_chat_with_ai(chat_json)
            assert "H1" in result["conteudo"].upper() or "Título" in result["conteudo"]
