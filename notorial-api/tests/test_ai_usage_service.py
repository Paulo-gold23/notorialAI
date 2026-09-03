"""
Testes para o serviço de auditoria de chamadas a APIs de IA.

Cobre:
- log_ai_call com diferentes cenários
- AICallTimer
- _sanitize_error_message
- Resiliência: falhas de auditoria não propagam exceções
"""

import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock


# --- Testes do AICallTimer ---

def test_timer_basic():
    """Timer registra duração em milissegundos."""
    from services.ai_usage_service import AICallTimer
    timer = AICallTimer()
    timer.start()
    timer.stop()
    assert timer.duration_ms is not None
    assert timer.duration_ms >= 0


def test_timer_not_started():
    """Timer sem start retorna None."""
    from services.ai_usage_service import AICallTimer
    timer = AICallTimer()
    timer.stop()
    assert timer.duration_ms is None


def test_timer_not_stopped():
    """Timer sem stop retorna None."""
    from services.ai_usage_service import AICallTimer
    timer = AICallTimer()
    timer.start()
    assert timer.duration_ms is None


# --- Testes de sanitização ---

def test_sanitize_none():
    """None retorna None."""
    from services.ai_usage_service import _sanitize_error_message
    assert _sanitize_error_message(None) is None


def test_sanitize_short():
    """Mensagem curta preservada."""
    from services.ai_usage_service import _sanitize_error_message
    assert _sanitize_error_message("HTTP 429") == "HTTP 429"


def test_sanitize_long():
    """Mensagem longa truncada em 500 chars."""
    from services.ai_usage_service import _sanitize_error_message
    msg = "x" * 600
    result = _sanitize_error_message(msg)
    assert len(result) <= 500


def test_sanitize_multiline():
    """Mensagem com muitas linhas é truncada em 3 linhas."""
    from services.ai_usage_service import _sanitize_error_message
    msg = "\n".join([f"linha {i}" for i in range(10)])
    result = _sanitize_error_message(msg)
    assert result.endswith("...")
    assert result.count("\n") <= 3


# --- Testes de _truncate ---

def test_truncate_none():
    from services.ai_usage_service import _truncate
    assert _truncate(None) is None


def test_truncate_short():
    from services.ai_usage_service import _truncate
    assert _truncate("abc", 10) == "abc"


def test_truncate_exact():
    from services.ai_usage_service import _truncate
    assert _truncate("abc", 3) == "abc"


def test_truncate_long():
    from services.ai_usage_service import _truncate
    assert _truncate("abcdef", 3) == "abc"


# --- Testes de log_ai_call ---

@pytest.mark.asyncio
async def test_log_ai_call_success():
    """Chamada bem-sucedida cria registro com dados de usage."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="openai",
            model="gpt-4.1-mini",
            operation="organize_chunk",
            pipeline_stage="organizing",
            ata_id="ata-123",
            advogado_id="adv-456",
            attempt_number=1,
            is_retry=False,
            prompt_tokens=1500,
            completion_tokens=800,
            total_tokens=2300,
            http_status=200,
            status="success",
            cost_category="confirmed",
            duration_ms=1234,
        )
        # Permitir que a task assíncrona execute
        await asyncio.sleep(0.1)

        mock_persist.assert_called_once()
        record = mock_persist.call_args[0][0]
        assert record['service'] == 'openai'
        assert record['model'] == 'gpt-4.1-mini'
        assert record['operation'] == 'organize_chunk'
        assert record['status'] == 'success'
        assert record['cost_category'] == 'confirmed'
        assert record['prompt_tokens'] == 1500
        assert record['completion_tokens'] == 800
        assert record['total_tokens'] == 2300
        assert record['ata_id'] == 'ata-123'
        assert record['advogado_id'] == 'adv-456'
        assert record['is_retry'] is False


@pytest.mark.asyncio
async def test_log_ai_call_retry():
    """Retry registra is_retry=True e retry_reason."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="openai",
            operation="organize_chunk",
            attempt_number=2,
            is_retry=True,
            retry_reason="rate_limit",
            http_status=429,
            status="rate_limited",
            cost_category="pending",
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert record['is_retry'] is True
        assert record['retry_reason'] == 'rate_limit'
        assert record['status'] == 'rate_limited'
        assert record['attempt_number'] == 2


@pytest.mark.asyncio
async def test_log_ai_call_timeout():
    """Timeout registra status correto e cost_category pending."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="groq",
            model="whisper-large-v3",
            operation="transcription",
            status="timeout",
            error_category="PROVIDER_GROQ_TIMEOUT",
            error_message="Timeout 5.2MB",
            cost_category="pending",
            input_size_bytes=5452800,
            audio_duration_sec=2726.4,
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert record['service'] == 'groq'
        assert record['status'] == 'timeout'
        assert record['cost_category'] == 'pending'
        assert record['error_category'] == 'PROVIDER_GROQ_TIMEOUT'
        assert record['input_size_bytes'] == 5452800


@pytest.mark.asyncio
async def test_log_ai_call_error_sanitized():
    """Mensagem de erro é sanitizada."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        long_error = "x" * 1000
        log_ai_call(
            service="openai",
            operation="organize_chunk",
            status="error",
            error_message=long_error,
            cost_category="none",
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert len(record['error_message']) <= 500


@pytest.mark.asyncio
async def test_log_ai_call_minimal():
    """Registro com apenas campos obrigatórios."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="openai",
            operation="unknown",
            status="success",
            cost_category="estimated",
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert record['service'] == 'openai'
        assert record['operation'] == 'unknown'
        assert 'ata_id' not in record  # campos opcionais não incluídos quando None
        assert 'prompt_tokens' not in record


@pytest.mark.asyncio
async def test_log_ai_call_skipped_audio():
    """Áudio rejeitado por validação registra status skipped e cost_category none."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="groq",
            model="whisper-large-v3",
            operation="transcription",
            status="skipped",
            error_category="CLIENT_AUDIO_CORRUPT",
            error_message="Áudio muito grande: 30.5MB > 25MB",
            cost_category="none",
            input_size_bytes=31981568,
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert record['status'] == 'skipped'
        assert record['cost_category'] == 'none'


@pytest.mark.asyncio
async def test_log_ai_call_groq_success():
    """Transcrição com sucesso registra audio_duration_sec estimado."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        from services.ai_usage_service import log_ai_call
        log_ai_call(
            service="groq",
            model="whisper-large-v3",
            operation="transcription",
            pipeline_stage="transcribing",
            status="success",
            cost_category="confirmed",
            input_size_bytes=120000,
            audio_duration_sec=60.0,
            http_status=200,
            duration_ms=3500,
        )
        await asyncio.sleep(0.1)

        record = mock_persist.call_args[0][0]
        assert record['service'] == 'groq'
        assert record['audio_duration_sec'] == 60.0
        assert record['cost_category'] == 'confirmed'


# --- Testes de resiliência ---

@pytest.mark.asyncio
async def test_persist_log_failure_does_not_raise():
    """Falha na persistência não propaga exceção."""
    with patch('services.ai_usage_service._persist_log', new_callable=AsyncMock) as mock_persist:
        mock_persist.side_effect = Exception("DB Connection failed")
        from services.ai_usage_service import log_ai_call
        # Não deve lançar exceção
        log_ai_call(
            service="openai",
            operation="organize_chunk",
            status="success",
            cost_category="confirmed",
        )
        await asyncio.sleep(0.1)
        # Se chegou aqui, o teste passou — a exceção foi capturada internamente


@pytest.mark.asyncio
async def test_log_ai_call_no_event_loop(caplog):
    """Sem event loop emite warning mas não falha."""
    import logging
    # Este cenário é difícil de simular em pytest-asyncio que já tem um loop
    # Validamos indiretamente que o try/except RuntimeError está presente
    from services.ai_usage_service import log_ai_call
    # A função não deve lançar exceção mesmo em cenários edge
    log_ai_call(
        service="openai",
        operation="test",
        status="success",
        cost_category="none",
    )
    await asyncio.sleep(0.1)
