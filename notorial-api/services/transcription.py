import hashlib
import httpx
import logging
import asyncio
import os
import random
import time
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
MAX_RETRIES = 3  # attempts for timeouts / 5xx / connection errors
RETRY_BASE_DELAY = 2  # segundos

# Groq limits are per-minute windows: in production (09/10) 92 HTTP 429 responses came
# within ~2 min with retry-after=3, and 3 quick attempts (~9s) were not enough.
# 429s therefore get their own time budget instead of consuming regular attempts.
RATE_LIMIT_BUDGET_SECONDS = float(os.getenv("GROQ_RATE_LIMIT_BUDGET_SECONDS", "180"))
RATE_LIMIT_MAX_WAIT = 30.0
# 6 parallel calls triggered the 429 burst; 3 halves the request rate.
TRANSCRIPTION_CONCURRENCY = max(1, int(os.getenv("GROQ_TRANSCRIPTION_CONCURRENCY", "3")))
# Pause before the sequential second pass so the provider window can reset.
SECOND_PASS_COOLDOWN_SECONDS = float(os.getenv("GROQ_SECOND_PASS_COOLDOWN_SECONDS", "20"))

FAILED_MARKER = "[Falha após múltiplas tentativas de transcrição]"
RATE_LIMIT_MARKER = "[Falha na transcrição: limite de requisições do serviço excedido]"
TIMEOUT_MARKER = "[Timeout - áudio muito longo para transcrever]"
CONNECTION_MARKER = "[Erro de conexão com serviço de transcrição]"
# Transient failures worth a second, sequential attempt at the end of the batch.
RETRYABLE_MARKERS = frozenset({FAILED_MARKER, RATE_LIMIT_MARKER, TIMEOUT_MARKER, CONNECTION_MARKER})


def rate_limit_wait(retry_after: str | None, hit_number: int) -> float:
    """Exponential backoff with jitter that never undercuts the provider's retry-after."""
    try:
        floor = float(retry_after) if retry_after else 0.0
    except ValueError:
        floor = 0.0
    backoff = RETRY_BASE_DELAY * (2 ** (hit_number - 1))
    return min(max(floor, backoff) + random.uniform(0, 1.5), RATE_LIMIT_MAX_WAIT)


def is_transcription_failure(text: str) -> bool:
    return text.startswith("[") and text != "[Áudio sem fala detectada]"


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
        from database import get_supabase_client, get_supabase_admin_client, db_exec, _db_executor
        _cache_client = get_supabase_admin_client() or get_supabase_client()
        if _cache_client:
            cache_resp = await db_exec(lambda: _cache_client.table("audio_transcription_cache")
                .select("transcription_text,hit_count")
                .eq("audio_hash", audio_hash)
                .execute())
            if cache_resp.data and len(cache_resp.data) > 0:
                cached_text = cache_resp.data[0]["transcription_text"]
                # Incrementa hit_count para auditoria (fire-and-forget)
                try:
                    _hit = cache_resp.data[0].get("hit_count", 0) + 1
                    _db_hash = audio_hash
                    _db_executor.submit(lambda: _cache_client.table("audio_transcription_cache")
                        .update({"hit_count": _hit, "last_hit_at": "now()"})
                        .eq("audio_hash", _db_hash)
                        .execute())
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

    attempt = 0
    rate_limited_hits = 0
    rate_limit_deadline = time.monotonic() + RATE_LIMIT_BUDGET_SECONDS

    while attempt < MAX_RETRIES:
        attempt += 1
        timer = AICallTimer()
        call_no = attempt + rate_limited_hits
        is_retry = call_no > 1

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
                        attempt_number=call_no, is_retry=is_retry,
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
                    attempt_number=call_no, is_retry=is_retry,
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    http_status=200, status="success",
                    cost_category="confirmed",
                    duration_ms=timer.duration_ms,
                )
                # ── Cache write: salva transcrição para evitar custo em reprocessamentos (fire-and-forget) ──
                try:
                    from database import get_supabase_client, get_supabase_admin_client, _db_executor as _cw_exec
                    _cache_w = get_supabase_admin_client() or get_supabase_client()
                    if _cache_w:
                        _cw_record = {
                            "audio_hash": audio_hash,
                            "transcription_text": text,
                            "audio_size_bytes": audio_size,
                            "audio_duration_sec": estimated_duration,
                            "filename_sample": os.path.basename(filename),
                        }
                        _cw_exec.submit(lambda r=_cw_record, c=_cache_w: c.table("audio_transcription_cache").upsert(r).execute())
                except Exception as cw_err:
                    logger.warning(f"[{filename}] Cache write failed (non-critical): {cw_err}")
                return filename, text

            # -- Rate limit (429): backoff within a time budget; does not consume a regular attempt --
            if response.status_code == 429:
                retry_after = response.headers.get("retry-after")
                rate_limited_hits += 1
                attempt -= 1
                wait = rate_limit_wait(retry_after, rate_limited_hits)
                budget_left = rate_limit_deadline - time.monotonic()
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="groq", model="whisper-large-v3",
                    operation="transcription", pipeline_stage="transcribing",
                    attempt_number=call_no, is_retry=is_retry,
                    retry_reason="rate_limit" if is_retry else None,
                    input_size_bytes=audio_size, audio_duration_sec=estimated_duration,
                    http_status=429, status="rate_limited",
                    error_category="PROVIDER_GROQ_RATE_LIMIT",
                    error_message=f"Rate limit 429, retry-after={retry_after}",
                    cost_category="pending",
                    duration_ms=timer.duration_ms,
                )
                if wait > budget_left:
                    logger.error(
                        f"[{filename}] Rate limit (429) persistente: {rate_limited_hits} respostas, "
                        f"orçamento de {RATE_LIMIT_BUDGET_SECONDS:.0f}s esgotado"
                    )
                    return filename, RATE_LIMIT_MARKER
                logger.warning(
                    f"[{filename}] Rate limit (429) #{rate_limited_hits}, aguardando {wait:.1f}s "
                    f"(orçamento restante {budget_left:.0f}s)"
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
                    attempt_number=call_no, is_retry=is_retry,
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
                attempt_number=call_no, is_retry=is_retry,
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
                attempt_number=call_no, is_retry=is_retry,
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
                attempt_number=call_no, is_retry=is_retry,
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
                attempt_number=call_no, is_retry=is_retry,
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

    sem = asyncio.Semaphore(TRANSCRIPTION_CONCURRENCY)
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
        results = dict(await asyncio.gather(*tasks))

        # Second pass: transient failures (429, timeouts, connection) retried one at a time
        # after a cooldown, so a burst limit hit during the parallel phase does not lose audios.
        retry_names = [name for name, text in results.items() if text in RETRYABLE_MARKERS]
        if retry_names:
            logger.info(
                f"[{ata_id}] Segunda passada de transcrição: {len(retry_names)} áudio(s), "
                f"aguardando {SECOND_PASS_COOLDOWN_SECONDS:.0f}s"
            )
            if on_progress:
                await on_progress(f"Retentando {len(retry_names)} áudio(s) com falha...", 100)
            await asyncio.sleep(SECOND_PASS_COOLDOWN_SECONDS)
            recovered = 0
            for idx, name in enumerate(retry_names, start=1):
                _, text = await _transcribe_single_audio(
                    client, name, audios[name], ata_id=ata_id, advogado_id=advogado_id,
                )
                if not text.startswith("["):
                    recovered += 1
                results[name] = text
                if on_progress:
                    await on_progress(f"Retentando áudios com falha: {idx}/{len(retry_names)}", 100)
            logger.info(f"[{ata_id}] Segunda passada: {recovered}/{len(retry_names)} recuperado(s)")

    # Log resumo final
    fail = sum(1 for t in results.values() if is_transcription_failure(t))
    logger.info(
        f"Transcrição concluída: {total - fail}/{total} sucesso"
        + (f", {fail} falha(s)" if fail else "")
    )

    return results

