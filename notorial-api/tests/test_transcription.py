import pytest
import respx
import httpx
from services.transcription import transcribe_all, _transcribe_single_audio

@pytest.mark.asyncio
async def test_transcribe_all_empty():
    results = await transcribe_all({})
    assert results == {}

@pytest.mark.asyncio
async def test_transcribe_single_success():
    filename = "audio1.opus"
    audio_bytes = b"f" * 200
    
    with respx.mock:
        respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "Transcrito com sucesso"})
        )
        
        async with httpx.AsyncClient() as client:
            fname, text = await _transcribe_single_audio(client, filename, audio_bytes)
            assert fname == filename
            assert text == "Transcrito com sucesso"

@pytest.mark.asyncio
async def test_transcribe_single_rate_limit_retry():
    filename = "audio1.opus"
    audio_bytes = b"f" * 200
    
    with respx.mock:
        # Mocking 429 then 200
        route = respx.post("https://api.groq.com/openai/v1/audio/transcriptions")
        route.side_effect = [
            httpx.Response(429, headers={"retry-after": "0.1"}),
            httpx.Response(200, json={"text": "Sucesso após retry"})
        ]
        
        async with httpx.AsyncClient() as client:
            fname, text = await _transcribe_single_audio(client, filename, audio_bytes)
            assert text == "Sucesso após retry"

@pytest.mark.asyncio
async def test_transcribe_single_too_large():
    filename = "huge.opus"
    audio_bytes = b"a" * (26 * 1024 * 1024) # 26MB
    
    async with httpx.AsyncClient() as client:
        fname, text = await _transcribe_single_audio(client, filename, audio_bytes)
        assert "muito grande" in text.lower()

@pytest.mark.asyncio
async def test_transcribe_all_parallel():
    audio_data = b"a" * 200
    audios = {
        "a1.opus": audio_data,
        "a2.opus": audio_data,
        "a3.opus": audio_data
    }
    
    with respx.mock:
        respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "ok"})
        )
        
        results = await transcribe_all(audios)
        assert len(results) == 3
        assert results["a1.opus"] == "ok"
        assert results["a2.opus"] == "ok"
        assert results["a3.opus"] == "ok"
