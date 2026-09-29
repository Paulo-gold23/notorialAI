"""
Serviço de auditoria de chamadas a APIs externas de IA.

Registra cada chamada individual (OpenAI, Groq) com metadados de consumo,
tokens, retries, status e classificação de custo na tabela ai_usage_log.

PRINCÍPIO DE RESILIÊNCIA:
  - Falha no registro NUNCA interrompe o pipeline principal.
  - Erros de auditoria são logados via logger.warning (capturados pelo Sentry).
  - O registro é fire-and-forget via asyncio.create_task.
"""

import time
import asyncio
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)


def _truncate(text: Optional[str], max_len: int = 500) -> Optional[str]:
    """Trunca texto para evitar armazenar dados excessivos."""
    if text is None:
        return None
    return text[:max_len] if len(text) > max_len else text


def _sanitize_error_message(msg: Optional[str]) -> Optional[str]:
    """
    Remove potenciais dados sensíveis de mensagens de erro.
    Preserva códigos HTTP, nomes de exceção e mensagens técnicas.
    Trunca para 500 caracteres.
    """
    if msg is None:
        return None
    # Não armazenar respostas completas de API que podem conter conteúdo do prompt
    sanitized = msg
    # Truncar linhas muito longas (respostas de erro podem conter JSON grande)
    lines = sanitized.split('\n')
    if len(lines) > 3:
        sanitized = '\n'.join(lines[:3]) + '...'
    return _truncate(sanitized, 500)


class AICallTimer:
    """
    Context manager para medir duração de chamadas de IA.

    Uso:
        timer = AICallTimer()
        timer.start()
        # ... chamada de API ...
        timer.stop()
        duration_ms = timer.duration_ms
    """

    def __init__(self):
        self._start: Optional[float] = None
        self._end: Optional[float] = None

    def start(self):
        self._start = time.monotonic()

    def stop(self):
        self._end = time.monotonic()

    @property
    def duration_ms(self) -> Optional[int]:
        if self._start is None or self._end is None:
            return None
        return int((self._end - self._start) * 1000)

    @property
    def started_epoch(self) -> Optional[float]:
        return self._start


# Batch buffer for ai_usage_log inserts — reduces individual DB writes by ~95%
_log_buffer: list[dict] = []
_buffer_lock = threading.Lock()
_last_flush_time = time.time()
_BUFFER_MAX_SIZE = 20
_BUFFER_MAX_AGE_S = 10.0


async def _flush_buffer():
    """Flush accumulated log records as a single bulk insert."""
    global _last_flush_time
    with _buffer_lock:
        if not _log_buffer:
            return
        batch = _log_buffer.copy()
        _log_buffer.clear()
        _last_flush_time = time.time()
    
    try:
        from database import get_supabase_admin_client, get_supabase_client
        supabase = get_supabase_admin_client() or get_supabase_client()
        if supabase:
            supabase.table('ai_usage_log').insert(batch).execute()
            logger.debug(f"[AI Usage] Flushed {len(batch)} log records")
    except Exception as e:
        logger.warning(f"[AI Usage] Failed to flush {len(batch)} log records: {e}")


async def flush_ai_logs():
    """Public function to force-flush remaining logs. Call at end of pipeline."""
    await _flush_buffer()


async def _persist_log(record: dict):
    """Buffer a log record and flush when batch is full or time threshold exceeded."""
    global _last_flush_time
    should_flush = False
    
    with _buffer_lock:
        _log_buffer.append(record)
        if len(_log_buffer) >= _BUFFER_MAX_SIZE:
            should_flush = True
        elif (time.time() - _last_flush_time) >= _BUFFER_MAX_AGE_S:
            should_flush = True
    
    if should_flush:
        await _flush_buffer()


def log_ai_call(
    *,
    # Vínculo com entidades
    ata_id: Optional[str] = None,
    advogado_id: Optional[str] = None,
    # Identificação da chamada
    service: str,                       # 'openai', 'groq'
    model: Optional[str] = None,
    operation: str,                     # 'organize_chunk', 'transcription', 'transform'
    pipeline_stage: Optional[str] = None,
    # Tentativas
    attempt_number: int = 1,
    is_retry: bool = False,
    retry_reason: Optional[str] = None,
    # Input metadata
    input_size_chars: Optional[int] = None,
    input_size_bytes: Optional[int] = None,
    chunk_index: Optional[int] = None,
    total_chunks: Optional[int] = None,
    # Usage (OpenAI)
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
    # Usage (Groq)
    audio_duration_sec: Optional[float] = None,
    # Resultado
    http_status: Optional[int] = None,
    status: str = 'success',            # 'success', 'error', 'timeout', 'rate_limited', 'skipped'
    error_category: Optional[str] = None,
    error_message: Optional[str] = None,
    # Custo
    cost_category: str = 'pending',     # 'confirmed', 'estimated', 'none', 'pending'
    # Timing
    duration_ms: Optional[int] = None,
) -> None:
    """
    Registra uma chamada a API de IA de forma assíncrona e não-bloqueante.
    
    FIRE-AND-FORGET: Esta função agenda o registro como uma task assíncrona.
    Não bloqueia o caller e nunca propaga exceções.
    
    Parâmetros obrigatórios:
        service: 'openai' ou 'groq'
        operation: tipo da operação ('organize_chunk', 'transcription', 'transform')
        status: resultado da chamada
    """
    record = {
        'service': service,
        'operation': operation,
        'status': status,
        'cost_category': cost_category,
        'attempt_number': attempt_number,
        'is_retry': is_retry,
    }

    # Campos opcionais — só incluir se tiverem valor (evita NULLs desnecessários no JSON)
    if ata_id is not None:
        record['ata_id'] = ata_id
    if advogado_id is not None:
        record['advogado_id'] = advogado_id
    if model is not None:
        record['model'] = model
    if pipeline_stage is not None:
        record['pipeline_stage'] = pipeline_stage
    if retry_reason is not None:
        record['retry_reason'] = retry_reason
    if input_size_chars is not None:
        record['input_size_chars'] = input_size_chars
    if input_size_bytes is not None:
        record['input_size_bytes'] = input_size_bytes
    if chunk_index is not None:
        record['chunk_index'] = chunk_index
    if total_chunks is not None:
        record['total_chunks'] = total_chunks
    if prompt_tokens is not None:
        record['prompt_tokens'] = prompt_tokens
    if completion_tokens is not None:
        record['completion_tokens'] = completion_tokens
    if total_tokens is not None:
        record['total_tokens'] = total_tokens
    if audio_duration_sec is not None:
        record['audio_duration_sec'] = audio_duration_sec
    if http_status is not None:
        record['http_status'] = http_status
    if error_category is not None:
        record['error_category'] = error_category
    if error_message is not None:
        record['error_message'] = _sanitize_error_message(error_message)
    if duration_ms is not None:
        record['duration_ms'] = duration_ms

    # Fire-and-forget: agenda a persistência sem bloquear o caller
    try:
        asyncio.create_task(_persist_log(record))
    except RuntimeError:
        # Sem event loop ativo (ex: testes síncronos, shutdown)
        logger.warning("[ai_usage] Sem event loop — registro descartado")
