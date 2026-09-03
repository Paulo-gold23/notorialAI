import hashlib
import httpx
import logging
import asyncio
import os
from config import settings

logger = logging.getLogger(__name__)

# -- Mapeamento de extensão -> MIME type --------------------------
MIME_MAP = {
    ".opus": "audio/ogg",
    ".ogg":  "audio/ogg",
    ".mp3":  "audio/mpeg",
    ".m4a":  "audio/mp4",
    ".mp4":  "audio/mp4",
    ".wav":  "audio/wav",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
    ".aac":  "audio/aac",
}

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB (limite Whisper)
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # segundos


def _get_mime(filename: str) -> str:
    """Retorna o MIME type baseado na extensão do arquivo."""
    ext = os.path.splitext(filename)[1].lower()
    return MIME_MAP.get(ext, "audio/ogg")  # fallback seguro


async def _transcribe_single_audio(
    client: httpx.AsyncClient,
    filename: str,
    audio_bytes: bytes,
    *,
    ata_id: str = None,
    advogado_id: str = None,
) -> tuple[str, str]:
    """
    Transcreve um único áudio usando a API Groq com retry automático.
    Trata rate-limit (429), timeouts e erros de servidor (5xx).
    Registra cada tentativa na tabela ai_usage_log.
    """
    from services.ai_usage_service import log_ai_call, AICallTimer

    audio_size = len(audio_bytes)
    size_mb = audio_size / (1024 * 1024)

    # Estimativa de duração: Opus WhatsApp ≈ 2KB/s (heurística do credits.py)
    estimated_duration = audio_size / 2000.0

    # Validação de tamanho — nenhuma chamada de API, custo = none
    if audio_size > MAX_FILE_SIZE:
        logger.warning(f"[{filename}] Áudio muito grande ({size_mb:.1f}MB > 25MB), pulando")
        log_ai_call(
            ata_id=ata_id, advogado_id=advogado_id,
            service="groq", model="whisper-large-v3",
            operation="transcription", pipeline_stage="transcribing",
            input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
            status="skipped", error_category="CLIENT_AUDIO_CORRUPT",
            error_message=f"Áudio muito grande: {size_mb:.1f}MB > 25MB",
            cost_category="none",
        )
        return filename, f"[Áudio muito grande: {size_mb:.1f}MB - limite é 25MB]"

    if audio_size < 100:
        logger.warning(f"[{filename}] Áudio vazio ou corrompido ({audio_size} bytes)")
        log_ai_call(
            ata_id=ata_id, advogado_id=advogado_id,
            service="groq", model="whisper-large-v3",
            operation="transcription", pipeline_stage="transcribing",
            input_size_bytes=audio_size,
            status="skipped", error_category="CLIENT_AUDIO_CORRUPT",
            error_message=f"Áudio vazio ou corrompido: {audio_size} bytes",
            cost_category="none",
        )
        return filename, "[Arquivo de áudio vazio ou corrompido]"

    # ── Cache lookup: evita reprocessamento (e custo) de áudios já transcritos ──
    audio_hash = hashlib.sha256(audio_bytes).hexdigest()
    try:
        from database import get_supabase_client
        _cache_client = get_supabase_client()
        if _cache_client:
            cache_resp = _cache_client.table("audio_transcription_cache") \
                .select("transcription_text") \
                .eq("audio_hash", audio_hash) \
                .execute()
            if cache_resp.data and len(cache_resp.data) > 0:
                cached_text = cache_resp.data[0]["transcription_text"]
                # Incrementa hit_count para auditoria
                try:
                    _cache_client.table("audio_transcription_cache") \
                        .update({"hit_count": cache_resp.data[0].get("hit_count", 0) + 1, "last_hit_at": "now()"}) \
                        .eq("audio_hash", audio_hash) \
                        .execute()
                except Exception:
                    pass  # hit_count é nice-to-have, não crítico
                logger.info(f"[{filename}] Cache HIT — hash={audio_hash[:12]}... reutilizando transcrição")
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="groq", model="whisper-large-v3",
                    operation="transcription", pipeline_stage="transcribing",
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    status="cached",
                    cost_category="none",
                )
                return filename, cached_text
    except Exception as cache_err:
        logger.warning(f"[{filename}] Cache lookup failed (proceeding without cache): {cache_err}")

    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    mime = _get_mime(filename)

    for attempt in range(1, MAX_RETRIES + 1):
        timer = AICallTimer()
        is_retry = attempt > 1

        try:
            # Usa apenas o nome do arquivo, sem o caminho (WhatsApp pode vir com Media/audio.opus)
            # A API do Whisper pode rejeitar a extensão .opus silenciosamente. A solução recomendada 
            # é usar .ogg (container ogg) que é perfeitamente suportado.
            safe_filename = os.path.basename(filename)
            if safe_filename.lower().endswith('.opus'):
                safe_filename = safe_filename[:-5] + ".ogg"
                
            files = {"file": (safe_filename, audio_bytes, mime)}
            data = {
                "model": "whisper-large-v3",
                "response_format": "json",
                "language": "pt",          # força português para melhor accuracy
            }

            timer.start()
            response = await client.post(
                url,
                headers=headers,
                data=data,
                files=files,
                timeout=120.0,  # 2 min para áudios longos
            )
            timer.stop()

            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "").strip()
                if not text:
                    log_ai_call(
                        ata_id=ata_id, advogado_id=advogado_id,
                        service="groq", model="whisper-large-v3",
                        operation="transcription", pipeline_stage="transcribing",
                        attempt_number=attempt, is_retry=is_retry,
                        input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                        http_status=200, status="success",
                        cost_category="confirmed",
                        duration_ms=timer.duration_ms,
                    )
                    return filename, "[Áudio sem fala detectada]"
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="groq", model="whisper-large-v3",
                    operation="transcription", pipeline_stage="transcribing",
                    attempt_number=attempt, is_retry=is_retry,
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    http_status=200, status="success",
                    cost_category="confirmed",
                    duration_ms=timer.duration_ms,
                )
                # ── Cache write: salva transcrição para evitar custo em reprocessamentos ──
                try:
                    from database import get_supabase_client
                    _cache_w = get_supabase_client()
                    if _cache_w:
                        _cache_w.table("audio_transcription_cache").upsert({
                            "audio_hash": audio_hash,
                            "transcription_text": text,
                            "audio_size_bytes": audio_size,
                            "audio_duration_sec": estimated_duration,
                            "filename_sample": os.path.basename(filename),
                        }).execute()
                except Exception as cw_err:
                    logger.warning(f"[{filename}] Cache write failed (non-critical): {cw_err}")
                return filename, text

            # -- Rate limit (429) - esperar e tentar novamente --
            if response.status_code == 429:
                retry_after = response.headers.get("retry-after")
                wait = float(retry_after) if retry_after else RETRY_BASE_DELAY * attempt
                wait = min(wait, 30)  # máx 30s de espera
                logger.warning(
                    f"[{filename}] Rate limit (429), tentativa {attempt}/{MAX_RETRIES}, "
                    f"aguardando {wait:.1f}s..."
                )
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="groq", model="whisper-large-v3",
                    operation="transcription", pipeline_stage="transcribing",
                    attempt_number=attempt, is_retry=is_retry,
                    retry_reason="rate_limit" if is_retry else None,
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    http_status=429, status="rate_limited",
                    error_category="PROVIDER_GROQ_RATE_LIMIT",
                    error_message=f"Rate limit 429, retry-after={retry_after}",
                    cost_category="pending",
                    duration_ms=timer.duration_ms,
                )
                await asyncio.sleep(wait)
                continue

            # -- Erro de servidor (5xx) - retry com backoff --
            if response.status_code >= 500:
                wait = RETRY_BASE_DELAY * attempt
                logger.warning(
                    f"[{filename}] Erro servidor {response.status_code}, "
                    f"tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
                )
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="groq", model="whisper-large-v3",
                    operation="transcription", pipeline_stage="transcribing",
                    attempt_number=attempt, is_retry=is_retry,
                    retry_reason="server_error" if is_retry else None,
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    http_status=response.status_code, status="error",
                    error_category="PROVIDER_GROQ_ERROR",
                    error_message=f"HTTP {response.status_code}",
                    cost_category="pending",
                    duration_ms=timer.duration_ms,
                )
                await asyncio.sleep(wait)
                continue

            # -- Erro cliente (4xx exceto 429) - não adianta retry --
            error_detail = response.text[:200]
            logger.error(
                f"[{filename}] Erro {response.status_code}: {error_detail}"
            )
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="groq", model="whisper-large-v3",
                operation="transcription", pipeline_stage="transcribing",
                attempt_number=attempt, is_retry=is_retry,
                input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                http_status=response.status_code, status="error",
                error_category="PROVIDER_GROQ_ERROR",
                error_message=f"HTTP {response.status_code}: {error_detail[:200]}",
                cost_category="none",
                duration_ms=timer.duration_ms,
            )
            return filename, f"[Erro {response.status_code} na transcrição]"

        except httpx.TimeoutException:
            timer.stop()
            wait = RETRY_BASE_DELAY * attempt
            logger.warning(
                f"[{filename}] Timeout na transcrição ({size_mb:.1f}MB), "
                f"tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
            )
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="groq", model="whisper-large-v3",
                operation="transcription", pipeline_stage="transcribing",
                attempt_number=attempt, is_retry=is_retry,
                retry_reason="timeout" if is_retry else None,
                input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                status="timeout",
                error_category="PROVIDER_GROQ_TIMEOUT",
                error_message=f"Timeout {size_mb:.1f}MB",
                cost_category="pending",
                duration_ms=timer.duration_ms,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
                continue
            return filename, "[Timeout - áudio muito longo para transcrever]"

        except httpx.ConnectError:
            timer.stop()
            wait = RETRY_BASE_DELAY * attempt
            logger.warning(
                f"[{filename}] Erro de conexão, tentativa {attempt}/{MAX_RETRIES}"
            )
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="groq", model="whisper-large-v3",
                operation="transcription", pipeline_stage="transcribing",
                attempt_number=attempt, is_retry=is_retry,
                retry_reason="connection_error" if is_retry else None,
                input_size_bytes=audio_size,
                status="error",
                error_category="INFRA_NETWORK",
                error_message="ConnectError",
                cost_category="none",
                duration_ms=timer.duration_ms,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
                continue
            return filename, "[Erro de conexão com serviço de transcrição]"

        except Exception as e:
            timer.stop()
            logger.error(f"[{filename}] Exceção inesperada: {e}", exc_info=True)
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="groq", model="whisper-large-v3",
                operation="transcription", pipeline_stage="transcribing",
                attempt_number=attempt, is_retry=is_retry,
                input_size_bytes=audio_size,
                status="error",
                error_category="SYSTEM_BUG",
                error_message=f"{type(e).__name__}: {str(e)[:200]}",
                cost_category="none",
                duration_ms=timer.duration_ms,
            )
            return filename, f"[Erro inesperado na transcrição: {type(e).__name__}]"

    # Esgotou todas as tentativas
    logger.error(f"[{filename}] Falhou após {MAX_RETRIES} tentativas")
    return filename, "[Falha após múltiplas tentativas de transcrição]"


async def transcribe_all(
    audios: dict[str, bytes],
    on_progress=None,
    *,
    ata_id: str = None,
    advogado_id: str = None,
) -> dict[str, str]:
    """
    Recebe {nome_arquivo: bytes} e transcreve todos com:
    - Semáforo para limitar paralelismo (evita rate limit)
    - Retry automático com backoff exponencial
    - Progresso reportado via callback
    """
    if not audios:
        return {}

    sem = asyncio.Semaphore(3)  # reduzido de 5→3 para evitar rate limit
    total = len(audios)
    completed = 0
    errors = 0

    async def _safe_transcribe(
        client: httpx.AsyncClient,
        filename: str,
        byte_data: bytes,
    ) -> tuple[str, str]:
        nonlocal completed, errors
        async with sem:
            result = await _transcribe_single_audio(
                client, filename, byte_data,
                ata_id=ata_id, advogado_id=advogado_id,
            )
            completed += 1
            if result[1].startswith("["):
                errors += 1
            if on_progress:
                progress = int((completed / total) * 100)
                err_suffix = f" ({errors} erro{'s' if errors > 1 else ''})" if errors else ""
                await on_progress(
                    f"Transcrevendo áudios: {completed}/{total}{err_suffix}",
                    progress,
                )
            return result

    async with httpx.AsyncClient() as client:
        tasks = [
            _safe_transcribe(client, filename, byte_data)
            for filename, byte_data in audios.items()
        ]
        results = await asyncio.gather(*tasks)

    # Log resumo final
    success = sum(1 for _, t in results if not t.startswith("["))
    fail = total - success
    logger.info(
        f"Transcrição concluída: {success}/{total} sucesso"
        + (f", {fail} falha(s)" if fail else "")
    )

    return {fname: text for fname, text in results}
