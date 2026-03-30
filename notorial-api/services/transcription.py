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
) -> tuple[str, str]:
    """
    Transcreve um único áudio usando a API Groq com retry automático.
    Trata rate-limit (429), timeouts e erros de servidor (5xx).
    """
    # Validação de tamanho
    size_mb = len(audio_bytes) / (1024 * 1024)
    if len(audio_bytes) > MAX_FILE_SIZE:
        logger.warning(f"[{filename}] Áudio muito grande ({size_mb:.1f}MB > 25MB), pulando")
        return filename, f"[Áudio muito grande: {size_mb:.1f}MB - limite é 25MB]"

    if len(audio_bytes) < 100:
        logger.warning(f"[{filename}] Áudio vazio ou corrompido ({len(audio_bytes)} bytes)")
        return filename, "[Arquivo de áudio vazio ou corrompido]"

    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    mime = _get_mime(filename)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # Usa apenas o nome do arquivo, sem o caminho (WhatsApp pode vir com Media/audio.opus)
            safe_filename = os.path.basename(filename)
            files = {"file": (safe_filename, audio_bytes, mime)}
            data = {
                "model": "whisper-large-v3",
                "response_format": "json",
                "language": "pt",          # força português para melhor accuracy
            }

            response = await client.post(
                url,
                headers=headers,
                data=data,
                files=files,
                timeout=120.0,  # 2 min para áudios longos
            )

            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "").strip()
                if not text:
                    return filename, "[Áudio sem fala detectada]"
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
                await asyncio.sleep(wait)
                continue

            # -- Erro de servidor (5xx) - retry com backoff --
            if response.status_code >= 500:
                wait = RETRY_BASE_DELAY * attempt
                logger.warning(
                    f"[{filename}] Erro servidor {response.status_code}, "
                    f"tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
                )
                await asyncio.sleep(wait)
                continue

            # -- Erro cliente (4xx exceto 429) - não adianta retry --
            error_detail = response.text[:200]
            logger.error(
                f"[{filename}] Erro {response.status_code}: {error_detail}"
            )
            return filename, f"[Erro {response.status_code} na transcrição]"

        except httpx.TimeoutException:
            wait = RETRY_BASE_DELAY * attempt
            logger.warning(
                f"[{filename}] Timeout na transcrição ({size_mb:.1f}MB), "
                f"tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
                continue
            return filename, "[Timeout - áudio muito longo para transcrever]"

        except httpx.ConnectError:
            wait = RETRY_BASE_DELAY * attempt
            logger.warning(
                f"[{filename}] Erro de conexão, tentativa {attempt}/{MAX_RETRIES}"
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
                continue
            return filename, "[Erro de conexão com serviço de transcrição]"

        except Exception as e:
            logger.error(f"[{filename}] Exceção inesperada: {e}", exc_info=True)
            return filename, f"[Erro inesperado na transcrição: {type(e).__name__}]"

    # Esgotou todas as tentativas
    logger.error(f"[{filename}] Falhou após {MAX_RETRIES} tentativas")
    return filename, "[Falha após múltiplas tentativas de transcrição]"


async def transcribe_all(
    audios: dict[str, bytes],
    on_progress=None,
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
            result = await _transcribe_single_audio(client, filename, byte_data)
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
