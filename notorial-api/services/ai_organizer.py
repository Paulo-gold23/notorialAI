import httpx
import logging
import json
import re
import unicodedata
import asyncio
import base64
import io
import os
import markdown
from collections import defaultdict
from config import settings

logger = logging.getLogger(__name__)

# Prompts - equivalentes aos que rodavam no n8n
# ===========================================================================

# Carrega os prompts dinamicamente de arquivos externos para facilidade de edição e redução do tamanho do código
from pathlib import Path

def _load_prompt(name: str) -> str:
    path = Path(__file__).parent.parent / "prompts" / f"{name}.md"
    return path.read_text(encoding="utf-8")

try:
    _SHARED_RULES = _load_prompt("shared_rules")
    PROMPT_PREPARATORIO = _load_prompt("preparatorio").replace("{{SHARED_RULES}}", _SHARED_RULES)
except Exception as e:
    logger.error(f"Erro ao carregar prompts externos: {e}")
    # Fallback inline para segurança contra falhas de IO
    _SHARED_RULES = """\
-----------------------
REGRAS ABSOLUTAS (CRÍTICO)
-----------------------
1. PROIBIDO interpretar, resumir ou corrigir qualquer conteúdo.
2. PROIBIDO alterar nomes de remetentes.
3. PROIBIDO inferir contexto.
4. PROIBIDO agrupar mensagens.
5. PROIBIDO omitir qualquer linha.
6. PROIBIDO reorganizar por data ou lógica."""
    PROMPT_PREPARATORIO = f"Você é um assistente jurídico especializado.\n\n{_SHARED_RULES}"

# ===========================================================================
# Converter chat parsed -> texto limpo para a IA (economiza tokens)
# ===========================================================================

def _remove_duplicate_headers(text: str) -> str:
    """
    Remove cabeçalhos duplicados gerados pela IA em transições de chunks.
    Preserva apenas a primeira ocorrência do bloco 'Relatório Preparatório' ou 'Ata Notarial'.
    Funciona tanto no markdown (pré-HTML) quanto nos restos de markdown com ## ou ###.
    """
    # #{1,4} cobre #, ##, ### e #### que a IA pode usar
    pattern_prep = re.compile(
        r'(?i)^\s*#{0,4}\s*Relat[oó]rio\s+Preparat[oó]rio.*?(?:Conte[uú]do\s+(?:Organizado|Constatado))\s*$', 
        re.MULTILINE | re.DOTALL
    )
    pattern_formal = re.compile(
        r'(?i)^\s*#{0,4}\s*ATA\s+NOTARIAL\s+DE\s+CONSTATA[CÇ][AÃ]O.*?(?:CONTE[UÚ]DO\s+CONSTATADO|Conte[uú]do\s+Constatado|Conte[uú]do\s+Organizado)\s*$', 
        re.MULTILINE | re.DOTALL
    )

    for pattern in [pattern_prep, pattern_formal]:
        matches = list(pattern.finditer(text))
        if len(matches) > 1:
            logger.info(f"[DEDUP] Encontrados {len(matches)} headers duplicados — removendo {len(matches)-1} cópias")
            first_end = matches[0].end()
            rest = text[first_end:]
            rest_cleaned = pattern.sub('', rest)
            text = text[:first_end] + rest_cleaned
            
    return text

# ===========================================================================

def _chat_to_text(chat_json: dict) -> tuple[str, list[dict], list[dict]]:
    """
    Converte o chat parseado em texto limpo para enviar à OpenAI.

    Estratégia AI-bypass para imagens:
    - Imagens  -> placeholder opaco  %%IMG_N%%  (a IA nao reconhece como algo a editar/remover)
    - Audios   -> marcador com remetente embutido [AUDIO TRANSCRITO de {remetente}]

    Retorna: (chat_text, img_schedule, audio_schedule)
      img_schedule   - lista [{pos, ts, remetente}] indexada por N (1-based)
      audio_schedule - lista [{ts, remetente, transcricao}] em ordem de aparicao
    """
    lines = []
    img_schedule: list[dict] = []
    audio_schedule: list[dict] = []
    img_counter = 1
    audio_counter = 1

    participantes = chat_json.get("participantes", [])
    phone_map = chat_json.get("phone_map", {})
    periodo = chat_json.get("periodo", {})

    participantes_fmt = []
    for p in participantes:
        num = phone_map.get(p, "")
        participantes_fmt.append(f"{p} ({num})" if num and num != p else p)

    lines.append("PARTICIPANTES (copie EXATAMENTE na secao de participantes do documento):")
    for pf in participantes_fmt:
        lines.append(f"  - {pf}")
    lines.append(f"PERIODO: {periodo.get('inicio', '?')} a {periodo.get('fim', '?')}")
    lines.append(f"TOTAL DE MENSAGENS: {chat_json.get('total_mensagens', 0)}")
    lines.append(f"TOTAL DE AUDIOS: {chat_json.get('total_audios', 0)}")
    lines.append("---")
    lines.append("")

    mensagens = chat_json.get("mensagens", [])
    i = 0
    while i < len(mensagens):
        msg = mensagens[i]
        data = msg.get("data", "")
        hora = msg.get("hora", "")
        remetente = msg.get("remetente", "")
        tipo = msg.get("tipo", "texto")
        conteudo = msg.get("conteudo", "")
        transcricao = msg.get("transcricao")

        timestamp = f"[{data} {hora}]"
        ts_raw = f"{data} {hora}"
        clean_content = str(conteudo).replace('"', '\\"')

        if tipo == "audio" and transcricao:
            clean_trans = str(transcricao).replace('"', '\\"')
            arquivo_str = os.path.basename(msg.get("arquivo", "")) if msg.get("arquivo") else "audio.opus"
            lines.append(f'{timestamp} {remetente}: %%AUDIO_{audio_counter}%% "{clean_trans}"')
            audio_schedule.append({"pos": audio_counter, "ts": ts_raw, "remetente": remetente, "transcricao": transcricao, "arquivo": arquivo_str})
            audio_counter += 1
            i += 1
        elif tipo == "audio":
            arquivo_str = os.path.basename(msg.get("arquivo", "")) if msg.get("arquivo") else "audio.opus"
            lines.append(f"{timestamp} {remetente}: %%AUDIO_{audio_counter}%%")
            audio_schedule.append({"pos": audio_counter, "ts": ts_raw, "remetente": remetente, "transcricao": None, "arquivo": arquivo_str})
            audio_counter += 1
            i += 1
        elif tipo == "imagem":
            arquivo_str = os.path.basename(msg.get("arquivo", "")) if msg.get("arquivo") else f"imagem_{img_counter}.jpg"
            img_schedule.append({"pos": img_counter, "ts": ts_raw, "remetente": remetente, "arquivo": arquivo_str})
            lines.append(f"{timestamp} {remetente}: %%IMG_{img_counter}%%")
            img_counter += 1
            i += 1
        elif tipo == "video":
            arquivo = msg.get("arquivo")
            vid_name = os.path.basename(arquivo) if arquivo else "video.mp4"
            lines.append(f"{timestamp} {remetente}: [Vídeo: {vid_name}]")
            i += 1
        elif tipo == "midia_omitida":
            # Trata mídia oculta como imagem potencial — gera marcador %%IMG_N%%
            # para que o schedule possa mapear bytes reais do ZIP via FIFO
            arquivo_str = f"midia_oculta_{img_counter}.jpg"
            img_schedule.append({"pos": img_counter, "ts": ts_raw, "remetente": remetente, "arquivo": arquivo_str})
            lines.append(f"{timestamp} {remetente}: %%IMG_{img_counter}%%")
            img_counter += 1
            i += 1
        elif tipo == "figurinha":
            i += 1
            continue
        elif tipo == "arquivo":
            arquivo_str = msg.get("arquivo")
            file_basename = os.path.basename(arquivo_str) if arquivo_str else "documento.pdf"
            lines.append(f"{timestamp} {remetente}: [Documento: {file_basename}]")
            i += 1
        else:
            # Descarta mensagens de texto com conteúdo vazio ou apenas whitespace
            # (artefato comum em exports iOS — stickers/mídia removida)
            if not clean_content.strip():
                i += 1
                continue
            lines.append(f'{timestamp} {remetente}: "{clean_content}"')
            i += 1

    return "\n".join(lines), img_schedule, audio_schedule


# ===========================================================================
# Chunking: dividir texto em pedaços se for muito grande
# ===========================================================================

MAX_CHARS_PER_CHUNK = 15000  # ~3.7k tokens por chunk (mais rápido e evita timeouts)


def _split_into_chunks(text: str) -> list[str]:
    """
    Divide o texto em chunks de tamanho aproximado respeitando as quebras de mensagens.
    Evita cortar no meio de uma frase ou no meio de um bloco de metadados.
    """
    if len(text) <= MAX_CHARS_PER_CHUNK:
        return [text]
    
    # Divide por linhas (cada linha é uma mensagem no nosso formato _chat_to_text)
    lines = text.split('\n')
    chunks = []
    current_chunk = []
    current_size = 0
    
    # Padrão de início de mensagem: [DD/MM/AAAA HH:MM]
    msg_start_pattern = re.compile(r'^\[\d{2}/\d{2}/\d{4} \d{2}:\d{2}\]')
    
    for line in lines:
        line_size = len(line) + 1 # +1 do \n
        
        # Se for uma linha de mensagem nova e estourar o tamanho, fecha o chunk atual
        if current_size + line_size > MAX_CHARS_PER_CHUNK and msg_start_pattern.match(line):
            if current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                current_size = 0
        
        # Caso especial: se a linha sozinha for maior que o chunk (raro mas possível em transcrições gigantes)
        if line_size > MAX_CHARS_PER_CHUNK:
            # Primeiro descarta o que já temos
            if current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                current_size = 0
            
            # Corta a linha bruta mesmo (não tem jeito)
            start = 0
            while start < len(line):
                chunks.append(line[start:start + MAX_CHARS_PER_CHUNK])
                start += MAX_CHARS_PER_CHUNK
            continue

        current_chunk.append(line)
        current_size += line_size
        
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    return chunks


# ===========================================================================
# Chamada para OpenAI
# ===========================================================================

async def _call_openai(
    system_prompt: str, 
    user_content: str, 
    client: httpx.AsyncClient = None,
    temperature: float = 0.2,
    *,
    ata_id: str = None,
    advogado_id: str = None,
    operation: str = "unknown",
    pipeline_stage: str = None,
    chunk_index: int = None,
    total_chunks: int = None,
) -> str:
    """
    Faz uma chamada para a API da OpenAI com retry automático e tratamento de erros.
    Registra cada tentativa (sucesso, retry, erro) na tabela ai_usage_log.
    """
    from services.ai_usage_service import log_ai_call, AICallTimer

    if not settings.OPENAI_API_KEY:
        raise Exception("OpenAI API Key não configurada.")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": temperature,
        "max_completion_tokens": 8000
    }

    input_chars = len(user_content)
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        timer = AICallTimer()
        is_retry = attempt > 1
        retry_reason = None

        try:
            from database import get_http_client
            active_client = client if client is not None else get_http_client()
            timer.start()
            response = await active_client.post(url, json=payload, headers=headers, timeout=180.0)
            timer.stop()
            
            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]

                # Captura usage retornado pela API
                usage = result.get("usage") or {}
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="openai", model=settings.OPENAI_MODEL,
                    operation=operation, pipeline_stage=pipeline_stage,
                    attempt_number=attempt, is_retry=is_retry,
                    input_size_chars=input_chars,
                    chunk_index=chunk_index, total_chunks=total_chunks,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"),
                    total_tokens=usage.get("total_tokens"),
                    http_status=200, status="success",
                    cost_category="confirmed" if usage.get("total_tokens") else "estimated",
                    duration_ms=timer.duration_ms,
                )
                return content
            
            # Rate limit or server error — log e retry
            if response.status_code in [429, 500, 502, 503, 504]:
                wait = 2 ** attempt
                retry_reason = "rate_limit" if response.status_code == 429 else "server_error"
                logger.warning(f"OpenAI {response.status_code} na tentativa {attempt}. Aguardando {wait}s...")
                log_ai_call(
                    ata_id=ata_id, advogado_id=advogado_id,
                    service="openai", model=settings.OPENAI_MODEL,
                    operation=operation, pipeline_stage=pipeline_stage,
                    attempt_number=attempt, is_retry=is_retry,
                    retry_reason=retry_reason if is_retry else None,
                    input_size_chars=input_chars,
                    chunk_index=chunk_index, total_chunks=total_chunks,
                    http_status=response.status_code,
                    status="rate_limited" if response.status_code == 429 else "error",
                    error_category=f"PROVIDER_OPENAI_{retry_reason.upper()}",
                    error_message=f"HTTP {response.status_code}",
                    cost_category="pending",
                    duration_ms=timer.duration_ms,
                )
                await asyncio.sleep(wait)
                continue
                
            # Erro fatal (4xx) — log e break
            error_msg = response.text[:500]
            logger.error(f"OpenAI Erro Fatal {response.status_code}: {error_msg}")
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="openai", model=settings.OPENAI_MODEL,
                operation=operation, pipeline_stage=pipeline_stage,
                attempt_number=attempt, is_retry=is_retry,
                input_size_chars=input_chars,
                chunk_index=chunk_index, total_chunks=total_chunks,
                http_status=response.status_code, status="error",
                error_category="PROVIDER_OPENAI_ERROR",
                error_message=f"HTTP {response.status_code}: {error_msg[:200]}",
                cost_category="none",
                duration_ms=timer.duration_ms,
            )
            break

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            timer.stop()
            wait = 2 ** attempt
            exc_name = type(e).__name__
            is_timeout = isinstance(e, httpx.TimeoutException)
            retry_reason = "timeout" if is_timeout else "connection_error"
            logger.warning(f"Conexão OpenAI falhou ({exc_name}). Tentativa {attempt}. Aguardando {wait}s...")
            log_ai_call(
                ata_id=ata_id, advogado_id=advogado_id,
                service="openai", model=settings.OPENAI_MODEL,
                operation=operation, pipeline_stage=pipeline_stage,
                attempt_number=attempt, is_retry=is_retry,
                retry_reason=retry_reason if is_retry else None,
                input_size_chars=input_chars,
                chunk_index=chunk_index, total_chunks=total_chunks,
                status="timeout" if is_timeout else "error",
                error_category=f"PROVIDER_OPENAI_{retry_reason.upper()}",
                error_message=f"{exc_name}: {str(e)[:200]}",
                cost_category="pending" if is_timeout else "none",
                duration_ms=timer.duration_ms,
            )
            await asyncio.sleep(wait)
            continue
            
    raise Exception("Falha ao comunicar com OpenAI após múltiplas tentativas.")


def _apply_formatting(text: str) -> str:
    """
    Pós-processamento para garantir formatação consistente no documento gerado.
    A IA nem sempre aplica as regras de formatação, então aplicamos via regex.
    """
    lines = text.split('\n')
    result = []
    
    for line in lines:
        # 1. Linhas com erro de transcrição -> toda a linha em negrito
        if '[Erro na transcrição]' in line or '[Erro na\ntranscrição]' in line:
            # Remove negrito existente para evitar duplicação
            clean = line.replace('**', '')
            # Aplica negrito na linha inteira (mas preserva heading markers)
            if clean.strip():
                # Preserve qualquer prefixo markdown (-, *, números)
                match = re.match(r'^(\s*(?:[-*]|\d+\.)\s*)', clean)
                if match:
                    prefix = match.group(1)
                    rest = clean[len(prefix):]
                    line = f"{prefix}**{rest.strip()}**"
                else:
                    line = f"**{clean.strip()}**"
        else:
            # 2. Conteúdo entre aspas -> negrito
            # Aplica negrito em texto entre aspas que ainda não está em negrito
            # Pattern: aspas que NÃO são precedidas por ** nem seguidas por **
            line = re.sub(
                r'(?<!\*)"([^"]{2,})"(?!\*)',
                r'**"\1"**',
                line
            )
        
        result.append(line)
    
    return '\n'.join(result)


_IMG_MARKER_RE = re.compile(r'%%IMG_(\d+)%%')
# Pre-compiled regex — matches %%AUDIO_N%%
_AUDIO_MARKER_RE = re.compile(r'%%AUDIO_(\d+)%%')


def _restore_missing_image_markers(md_text: str, expected: int | set[int]) -> str:
    """
    Re-insere marcadores %%IMG_N%% que a IA removeu, ANTES da conversão para HTML.

    Estratégia:
    - Se a IA preservou pelo menos UM marcador: insere os ausentes adjacentes ao
      vizinho mais próximo, mantendo grupos de álbum (mesmo timestamp) juntos.
    - Se a IA removeu TODOS: appenda um bloco sequencial no final do markdown para
      que Phase 1 de _inject_images_by_timestamp_schedule os capture corretamente.
    """
    if isinstance(expected, int):
        if expected == 0:
            return md_text
        all_expected = set(range(1, expected + 1))
    else:
        if not expected:
            return md_text
        all_expected = expected

    present = {int(m) for m in _IMG_MARKER_RE.findall(md_text)}
    missing = sorted(all_expected - present)

    if not missing:
        return md_text

    logger.info(f"[IMG_RESTORE] IA removeu {len(missing)}/{len(all_expected)} marcadores — re-inserindo: {missing[:10]}")

    if not present:
        # IA removeu TUDO — appenda bloco sequencial ao final.
        block = '\n'.join(f'%%IMG_{n}%%' for n in sorted(all_expected))
        return md_text + f'\n\n{block}\n'

    # Mapeia cada marcador ausente ao seu vizinho presente mais próximo.
    present_sorted = sorted(present)
    insertions: dict[int, dict] = {p: {'before': [], 'after': []} for p in present_sorted}
    for m in missing:
        nearest = min(present_sorted, key=lambda p: abs(p - m))
        side = 'before' if m < nearest else 'after'
        insertions[nearest][side].append(m)

    def _insert_around(match: re.Match) -> str:
        n = int(match.group(1))
        info = insertions.get(n, {})
        parts = []
        if info.get('before'):
            before = '\n'.join(f'%%IMG_{x}%%' for x in info['before']) + '\n'
            parts.append(before)
        parts.append(match.group(0))
        if info.get('after'):
            after = '\n' + '\n'.join(f'%%IMG_{x}%%' for x in info['after'])
            parts.append(after)
        return '\n'.join(parts)

    return _IMG_MARKER_RE.sub(_insert_around, md_text)


def _restore_missing_audio_markers(md_text: str, expected: int | set[int]) -> str:
    """
    Re-insere marcadores %%AUDIO_N%% que a IA removeu, ANTES da conversão para HTML.
    Mantém a ordem seqüencial baseando-se no vizinho mais próximo.
    """
    if isinstance(expected, int):
        if expected == 0:
            return md_text
        all_expected = set(range(1, expected + 1))
    else:
        if not expected:
            return md_text
        all_expected = expected

    present = {int(m) for m in _AUDIO_MARKER_RE.findall(md_text)}
    missing = sorted(all_expected - present)

    if not missing:
        return md_text

    logger.info(f"[AUDIO_RESTORE] IA removeu {len(missing)}/{len(all_expected)} marcadores — re-inserindo: {missing[:10]}")

    if not present:
        block = '\n'.join(f'%%AUDIO_{n}%%' for n in sorted(all_expected))
        return md_text + f'\n\n{block}\n'

    present_sorted = sorted(present)
    insertions: dict[int, dict] = {p: {'before': [], 'after': []} for p in present_sorted}
    for m in missing:
        nearest = min(present_sorted, key=lambda p: abs(p - m))
        side = 'before' if m < nearest else 'after'
        insertions[nearest][side].append(m)

    def _insert_around(match: re.Match) -> str:
        n = int(match.group(1))
        info = insertions.get(n, {})
        parts = []
        if info.get('before'):
            before = '\n'.join(f'%%AUDIO_{x}%%' for x in info['before']) + '\n'
            parts.append(before)
        parts.append(match.group(0))
        if info.get('after'):
            after = '\n' + '\n'.join(f'%%AUDIO_{x}%%' for x in info['after'])
            parts.append(after)
        return '\n'.join(parts)

    return _AUDIO_MARKER_RE.sub(_insert_around, md_text)


def _restore_audio_markers(html_text: str, audio_schedule: list[dict]) -> str:
    """
    Converte marcadores %%AUDIO_N%% em linhas HTML inline em negrito.

    Estratégia de matching (em ordem de prioridade):
    1. Marcador %%AUDIO_N%% → lookup DIRETO em pos_lookup[N] sem validação de contexto.
       O audio_schedule é a fonte de verdade para o remetente — nunca o contexto HTML.
    2. Fragmento de transcrição → fallback quando a IA removeu o marcador.
    3. FIFO → último recurso.

    Formato de saída: [timestamp] remetente: "transcricao em negrito"
    """
    if not audio_schedule:
        return html_text

    pos_lookup: dict[int, dict] = {entry["pos"]: entry for entry in audio_schedule}
    frag_lookup: list[tuple[str, dict]] = []
    for entry in audio_schedule:
        if entry.get("transcricao"):
            frag = entry["transcricao"].strip()[:60].lower()
            if frag:
                frag_lookup.append((frag, entry))

    consumed_ids: set = set()
    lines = html_text.split("\n")
    out_lines = []

    def _render_block(entry: dict) -> str:
        remetente   = entry["remetente"]
        transcricao = entry.get("transcricao") or ""
        ts          = entry.get("ts", "")
        ts_display  = f"[{ts}] " if ts else ""
        if transcricao:
            return (
                f'<p>\U0001f399\ufe0f \u00c1udio Transcrito &mdash; {ts_display}{remetente}: '
                f'<strong>&ldquo;{transcricao}&rdquo;</strong></p>'
            )
        return (
            f'<p>\U0001f399\ufe0f \u00c1udio Transcrito &mdash; {ts_display}{remetente}: '
            f'<em>(\u00e1udio sem transcri\u00e7\u00e3o)</em></p>'
        )

    for line in lines:
        marker_match = _AUDIO_MARKER_RE.search(line)
        is_audio_line = bool(marker_match) or ("<p>" in line and "\U0001f399" in line)

        if not is_audio_line:
            out_lines.append(line)
            continue

        matched_entry = None

        # 1. Marcador presente → lookup direto (sem validação de contexto).
        #    O schedule é a única fonte de verdade para o remetente.
        if marker_match:
            try:
                pos = int(marker_match.group(1))
                entry = pos_lookup.get(pos)
                if entry and id(entry) not in consumed_ids:
                    matched_entry = entry
                    consumed_ids.add(id(matched_entry))
            except ValueError:
                pass

        # 2. Sem marcador → tenta fragmento da transcrição.
        if not matched_entry:
            line_lower = line.lower()
            for frag, entry in frag_lookup:
                eid = id(entry)
                if eid not in consumed_ids and frag in line_lower:
                    matched_entry = entry
                    consumed_ids.add(eid)
                    break

        # 3. FIFO → próximo áudio não consumido.
        if not matched_entry:
            for entry in audio_schedule:
                if id(entry) not in consumed_ids:
                    matched_entry = entry
                    consumed_ids.add(id(matched_entry))
                    break

        if not matched_entry:
            out_lines.append(line)
            continue

        out_lines.append(_render_block(matched_entry))

    return "\n".join(out_lines)



def _unify_index_section(md_text: str) -> str:
    """
    Remove todos os índices gerados pela IA e constrói um índice limpo, 
    preciso e consolidado baseado nos cabeçalhos de data reais (### DD/MM/YYYY).
    Isso previne instabilidades e garante que o índice nunca desapareça.
    """
    lines = md_text.split('\n')
    output = []
    
    heading_pattern = re.compile(r'^\s{0,3}#{1,6}\s+')
    index_heading_pattern = re.compile(r'^\s{0,3}##\s+(?:[Íí]ndice|[Ii]ndice)\b')
    date_heading_pattern = re.compile(r'^###\s+(\d{2}/\d{2}/\d{4})')
    
    dates_found = []

    i = 0
    while i < len(lines):
        line = lines[i]

        if index_heading_pattern.match(line):
            i += 1
            # Pula até o próximo cabeçalho principal
            while i < len(lines):
                if heading_pattern.match(lines[i]):
                    break
                i += 1
            continue

        output.append(line)
        
        # Aproveita para coletar datas se for um cabeçalho de data
        date_match = date_heading_pattern.match(line)
        if date_match:
            date_str = date_match.group(1)
            if date_str not in dates_found:
                dates_found.append(date_str)
                
        i += 1

    if dates_found:
        index_links = []
        for d in dates_found:
            clean_id = d.replace('/', '')
            index_links.append(f"[{d}](#data-{clean_id})")
            
        insert_at = None
        for idx, line in enumerate(output):
            if line.strip().startswith('# '):
                insert_at = idx + 1
                break

        unified_block = ['', '## Índice', ' | '.join(index_links), '']
        if insert_at is None:
            output = unified_block + output
        else:
            output = output[:insert_at] + unified_block + output[insert_at:]

    return '\n'.join(output)


def _markdown_to_html(md_text: str) -> str:
    """
    Converte markdown para HTML para o TipTap editor renderizar corretamente.
    O TipTap espera HTML (<strong>, <h1>, etc), não markdown (**, #, etc).
    """
    # Adicionando IDs manuais para os títulos de data antes do markdown
    # Converte ### 02/08/2021 para <h3 id="data-02082021">02/08/2021</h3>
    def add_id(match):
        date_str = match.group(1)
        # Limpa a data para virar um ID (remove slashes)
        clean_id = date_str.replace('/', '')
        return f'<h3 id="data-{clean_id}">{date_str}</h3>'

    formatted_text = re.sub(r'^### (\d{2}/\d{2}/\d{4})', add_id, md_text, flags=re.MULTILINE)
    
    html = markdown.markdown(
        formatted_text,
        # "toc" gera custo extra em documentos longos e não é necessário aqui
        # porque os IDs dos headings de data já são inseridos manualmente.
        extensions=['tables', 'nl2br'],
        output_format='html'
    )
    return html

def _compress_image_to_base64(img_bytes: bytes, max_width: int = 800, quality: int = 75) -> str:
    """Comprime imagem com Pillow e retorna string base64 (JPEG)."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(img_bytes))

        if img.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            if 'A' in img.mode:
                bg.paste(img, mask=img.split()[-1])
            else:
                bg.paste(img)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=quality, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        logger.warning(f"Falha ao comprimir imagem (formato possivelmente não suportado nativamente, ex: HEIC): {e}")
        return None






def _build_positional_image_schedule(image_bytes_dict: dict, chat_json: dict) -> list[dict]:
    """
    Constrói schedule posicional de imagens alinhado com os marcadores %%IMG_N%%
    emitidos por _chat_to_text. Cada mensagem tipo 'imagem' ou 'midia_omitida'
    (em ordem cronológica) produz UMA entrada no schedule.

    Estratégia em 2 passes para evitar que midia_oculta "roube" bytes de imagens reais:

    Pass 1 — Resolve TODAS as mensagens na ordem cronológica:
      - tipo 'imagem' com filename → match exato ou basename (consome key)
      - tipo 'imagem' sem filename → FIFO fallback (consome key)
      - tipo 'midia_omitida' → reserva slot vazio (NÃO consome key)

    Pass 2 — Preenche slots vazios (midia_omitida) com bytes restantes via FIFO.
    """
    if not image_bytes_dict:
        return []

    mensagens = chat_json.get('mensagens', [])
    used_keys: set = set()

    # Pre-build basename index for fast lookup (case-insensitive, strip invisible chars)
    basename_index: dict = {}
    for key in image_bytes_dict:
        bn = os.path.basename(key).lower().replace('\u200e', '').replace('\u200f', '')
        basename_index.setdefault(bn, key)

    # ── Pass 1: Resolve imagens com filename; reserva slots para midia_omitida ──
    schedule: list[dict | None] = []  # None = slot vazio (midia_omitida pendente)

    for msg in mensagens:
        msg_tipo = msg.get('tipo', '')
        if msg_tipo not in ('imagem', 'midia_omitida'):
            continue

        arquivo = msg.get('arquivo') or ''
        data = msg.get('data', '')
        hora = msg.get('hora', '')
        ts = f"[{data} {hora}]"
        remetente = msg.get('remetente', '')

        if msg_tipo == 'imagem':
            # Tenta match por filename (exato ou basename)
            matched_key = None
            if arquivo:
                if arquivo in image_bytes_dict and arquivo not in used_keys:
                    matched_key = arquivo
                else:
                    bn = os.path.basename(arquivo).lower().replace('\u200e', '').replace('\u200f', '')
                    candidate = basename_index.get(bn)
                    if candidate and candidate not in used_keys:
                        matched_key = candidate

            if matched_key is None:
                # FIFO fallback para imagens sem filename resolvido
                for key in image_bytes_dict:
                    if key not in used_keys:
                        matched_key = key
                        break

            if matched_key:
                used_keys.add(matched_key)
                schedule.append({
                    'filename': os.path.basename(matched_key),
                    'bytes': image_bytes_dict[matched_key],
                    'ts': ts,
                    'data': data,
                    'hora': hora,
                    'remetente': remetente,
                })
            else:
                # Sem bytes disponíveis para esta imagem referenciada
                logger.warning(f"[IMG_SCHEDULE] Pass 1: sem imagem para {ts} {remetente!r} (arquivo={arquivo!r})")
                schedule.append({
                    '_placeholder': 'missing_image',
                    'filename': arquivo,
                    'ts': ts,
                    'data': data,
                    'hora': hora,
                    'remetente': remetente,
                })
        else:
            # midia_omitida: reserva slot vazio, será preenchido no Pass 2
            schedule.append({
                '_pending': True,
                'ts': ts,
                'data': data,
                'hora': hora,
                'remetente': remetente,
            })

    # ── Pass 2: Preenche slots de midia_omitida com bytes restantes (FIFO) ──
    fifo_keys = [k for k in image_bytes_dict if k not in used_keys]
    fifo_iter = iter(fifo_keys)
    pass2_filled = 0
    pass2_empty = 0

    final_schedule: list[dict] = []
    for entry in schedule:
        if entry is None:
            # Não deve acontecer com a nova lógica, mas mantém segurança
            final_schedule.append({'_placeholder': 'missing_image'})
            continue

        if entry.get('_pending'):
            # midia_omitida — tenta FIFO
            next_key = next(fifo_iter, None)
            if next_key:
                used_keys.add(next_key)
                final_schedule.append({
                    'filename': os.path.basename(next_key),
                    'bytes': image_bytes_dict[next_key],
                    'ts': entry['ts'],
                    'data': entry['data'],
                    'hora': entry['hora'],
                    'remetente': entry['remetente'],
                })
                pass2_filled += 1
            else:
                # Sem bytes restantes — slot de mídia oculta sem imagem física
                final_schedule.append({
                    '_placeholder': 'midia_omitida',
                    'ts': entry['ts'],
                    'data': entry['data'],
                    'hora': entry['hora'],
                    'remetente': entry['remetente'],
                })
                pass2_empty += 1
        else:
            # Imagem já resolvida no Pass 1
            final_schedule.append(entry)

    # Remove Nones do final (marcadores sem bytes serão ignorados pela injeção)
    # Mas mantém Nones intermediários para preservar alinhamento posicional com %%IMG_N%%

    image_msgs = [m for m in mensagens if m.get('tipo') == 'imagem']
    omitida_msgs = [m for m in mensagens if m.get('tipo') == 'midia_omitida']
    resolved = sum(1 for e in final_schedule if e is not None)

    logger.info(f"[IMG_SCHEDULE] ZIP={len(image_bytes_dict)} imgs | imagem={len(image_msgs)} | midia_omitida={len(omitida_msgs)}")
    logger.info(f"[IMG_SCHEDULE] Pass 1: {len(image_msgs)} imagens resolvidas por filename/FIFO")
    logger.info(f"[IMG_SCHEDULE] Pass 2: {pass2_filled} midia_omitida preenchidas, {pass2_empty} sem bytes")
    logger.info(f"[IMG_SCHEDULE] FINAL: {resolved}/{len(final_schedule)} entradas com bytes")

    return final_schedule

async def _compress_images_in_schedule(schedule: list[dict]) -> None:
    """Comprime imagens do schedule em paralelo em threads para não bloquear o event loop."""
    if not schedule:
        return
        
    loop = asyncio.get_running_loop()
    
    def compress_task(img_data):
        if 'bytes' not in img_data:
            return None
        return _compress_image_to_base64(img_data['bytes'])
        
    valid_items = [(i, item) for i, item in enumerate(schedule) if item is not None and not item.get('_placeholder')]
    tasks = [
        loop.run_in_executor(None, compress_task, item) 
        for _, item in valid_items
    ]
    results = await asyncio.gather(*tasks)
    
    for (_, item), b64 in zip(valid_items, results):
        item['b64'] = b64

def _inject_images_by_timestamp_schedule(html_str: str, schedule: list[dict]) -> str:
    """
    Injeta imagens no HTML gerado pela IA.
    
    Estratégia em 4 fases:
    1. Substitui marcadores %%IMG_N%% por tags <img>.
    2. Órfãs de álbum: Se a imagem N-1 foi injetada, injeta as demais do mesmo timestamp imediatamente após.
       Também tenta match relaxado por data+remetente (sem exigir hora exata).
    3. Inserção por proximidade: Imagens órfãs são inseridas próximo ao vizinho mais próximo
       já injetado, preservando a ordem cronológica no corpo do documento.
    4. Fallback final: Bloco ao final apenas para imagens que não tinham vizinhos.
    """
    if not schedule:
        return html_str
        
    injected_positions = set()
    # Mapeia posição no schedule → índice da linha em out_lines onde foi injetada
    injected_line_index: dict[int, int] = {}
    
    def render_img(pos):
        if pos < len(schedule) and schedule[pos] is not None:
            img_data = schedule[pos]
            # Verifica se é um placeholder (sem bytes reais)
            placeholder_type = img_data.get('_placeholder')
            if placeholder_type == 'midia_omitida':
                remetente_info = img_data.get('remetente', '')
                ts_info = img_data.get('ts', '')
                return (
                    f'<div class="ata-midia-ausente" style="border:1px dashed #b0b0b0;padding:8px 14px;'
                    f'color:#777;font-size:0.85em;font-style:italic;text-align:center;'
                    f'margin:8px 0;border-radius:4px;background:#fafafa;">'
                    f'📎 Mídia oculta {ts_info} ({remetente_info}) — conteúdo não disponível no export</div>'
                )
            if placeholder_type == 'missing_image':
                filename_info = img_data.get('filename', '')
                return (
                    f'<div class="ata-midia-ausente" style="border:1px dashed #e0b0b0;padding:8px 14px;'
                    f'color:#a55;font-size:0.85em;font-style:italic;text-align:center;'
                    f'margin:8px 0;border-radius:4px;background:#fff8f8;">'
                    f'⚠️ Imagem referenciada não encontrada no ZIP: {filename_info}</div>'
                )
            # Imagem real com bytes
            b64 = img_data.get('b64')
            if not b64:
                return (
                    f'<div class="ata-midia-ausente" style="border:1px dashed #ccc;padding:8px 14px;'
                    f'color:#888;font-size:0.85em;font-style:italic;text-align:center;'
                    f'margin:8px 0;border-radius:4px;">'
                    f'[Formato de imagem não suportado: {img_data.get("filename", "")}]</div>'
                )
            filename = img_data['filename']
            return f'<img class="ata-imagem-anexada" src="data:image/jpeg;base64,{b64}" alt="{filename}" />'
        return ''

    def remove_accents(input_str):
        nfkd_form = unicodedata.normalize('NFKD', input_str)
        return "".join([c for c in nfkd_form if not unicodedata.combining(c)])

    def strip_html(s):
        """Remove tags HTML para comparação de texto puro."""
        return re.sub(r'<[^>]+>', '', s)

    # Pre-group schedule by (data, hora, remetente) to handle albums together
    # Only group entries with real bytes (not placeholders)
    album_groups = {}
    for i, item in enumerate(schedule):
        if item is None or item.get('_placeholder'):
            continue
        key = (item.get('data'), item.get('hora'), item.get('remetente'))
        album_groups.setdefault(key, []).append(i)

    lines = html_str.split('\n')
    out_lines = []
    
    phase2_injected = set()
    current_date = ""

    # Padrão para extrair a data atual dos headers no HTML (ex: <h3 id="data-12032024">12/03/2024</h3>)
    date_pattern = re.compile(r'<h3[^>]*>([0-9]{2}/[0-9]{2}/[0-9]{4})</h3>')
    # Padrão mais amplo para detectar datas inline no texto (ex: dentro de <p>)
    inline_date_pattern = re.compile(r'(\d{2}/\d{2}/\d{4})')

    for line in lines:
        # Tenta atualizar a data atual baseada no header
        date_match = date_pattern.search(line)
        if date_match:
            current_date = date_match.group(1)

        injected_before = set(injected_positions)
        
        def replace_single(match):
            try:
                pos_1based = int(match.group(1))
                idx = pos_1based - 1
                if 0 <= idx < len(schedule):
                    if idx not in injected_positions:
                        injected_positions.add(idx)
                        injected_line_index[idx] = len(out_lines)
                        return render_img(idx)
                    else:
                        return 'ALREADY_INJECTED_IMG_MARKER'
                # Marker fora do range do schedule — remove silenciosamente
                logger.debug(f"[IMG_INJECT] %%IMG_{pos_1based}%% fora do range do schedule ({len(schedule)}) — removendo")
                return ''
            except ValueError:
                pass
            return ''

        new_line = re.sub(r'%%IMG_(\d+)%%', replace_single, line)
        
        # Se a imagem já foi injetada (ex: em um bloco de álbum anterior), removemos o marcador
        if 'ALREADY_INJECTED_IMG_MARKER' in new_line:
            clean_text = re.sub(r'<[^>]+>', '', new_line).replace('ALREADY_INJECTED_IMG_MARKER', '').strip()
            # Se a linha ficou apenas com um formato de remetente (ex: "[Data] Nome:") ou vazia, removemos a linha inteira
            if not clean_text or re.match(r'^(?:\[.*?\])?\s*[^:]+:\s*$', clean_text):
                continue
            new_line = new_line.replace('ALREADY_INJECTED_IMG_MARKER', '')
            
        out_lines.append(new_line)
        
        injected_now = injected_positions - injected_before
        # Texto limpo da linha para comparações (sem tags HTML, sem acentos, lowercase)
        clean_line = remove_accents(strip_html(new_line).lower())

        # Phase 2: Inject orphans for albums or matching lines
        for key in list(album_groups.keys()):
            album_indices = album_groups[key]
            orphans = [idx for idx in album_indices if idx not in injected_positions]
            
            if not orphans:
                del album_groups[key]
                continue
                
            data_val, hora_val, remetente = key
            sibling_injected = any(idx in injected_now for idx in album_indices)
            
            match_found = False
            if sibling_injected:
                match_found = True
            else:
                clean_ts = remove_accents((schedule[orphans[0]].get('ts') or '').lower())
                clean_hora = remove_accents((hora_val or '').lower())
                
                # Match se: a) A linha contém o TS completo, ou 
                #            b) A data atual do loop bate com a imagem e a linha contém a hora, ou
                #            c) A linha contém a data da imagem (match relaxado por data + remetente)
                has_time_match = (
                    (clean_ts and clean_ts in clean_line) or 
                    (current_date == data_val and clean_hora and clean_hora in clean_line) or
                    (data_val and data_val.lower() in clean_line and clean_hora and clean_hora in clean_line)
                )
                
                if has_time_match and ('<p' in new_line.lower() or '<li' in new_line.lower()):
                    clean_rem = remove_accents((remetente or '').lower())
                    rem_words = [w for w in clean_rem.split() if len(w) > 2]
                    # Accept if any word of the sender name matches, or if no words to match
                    has_rem_match = not rem_words or any(w in clean_line for w in rem_words)
                    if has_rem_match:
                        match_found = True

            if match_found:
                for p in orphans:
                    out_lines.append(f'<p>{render_img(p)}</p>')
                    injected_positions.add(p)
                    injected_line_index[p] = len(out_lines) - 1
                    phase2_injected.add(p)
                del album_groups[key]

    logger.info(f"[IMG_INJECT] Phase 1 tokens replaced: {len(injected_positions) - len(phase2_injected)}")
    logger.info(f"[IMG_INJECT] Phase 2 (albums/matching) injected: {len(phase2_injected)}")
    
    # Phase 3: Inserção por proximidade — imagens órfãs são inseridas perto do vizinho 
    # mais próximo já injetado, preservando ordem cronológica no corpo do documento
    # Só considera índices com bytes reais (não placeholders)
    remaining_indices = sorted([
        i for i in range(len(schedule))
        if i not in injected_positions
        and schedule[i] is not None
        and not schedule[i].get('_placeholder')
    ])

    if remaining_indices and injected_line_index:
        phase3_count = 0
        # Processa do final para o início para não invalidar os índices de inserção
        insertions: list[tuple[int, int]] = []  # (line_index, schedule_idx)
        
        for orphan_idx in remaining_indices:
            # Encontra o vizinho injetado mais próximo no schedule (por posição sequencial)
            best_neighbor_line = None
            best_distance = float('inf')
            
            for inj_idx, inj_line in injected_line_index.items():
                dist = abs(orphan_idx - inj_idx)
                if dist < best_distance:
                    best_distance = dist
                    best_neighbor_line = inj_line
            
            if best_neighbor_line is not None:
                # Insere logo após o vizinho mais próximo
                insertions.append((best_neighbor_line, orphan_idx))
        
        # Agrupa inserções por linha-alvo e ordena por schedule_idx
        line_insertions = defaultdict(list)
        for target_line, sched_idx in insertions:
            line_insertions[target_line].append(sched_idx)
        
        # Insere do final para o início (evita shift de índices)
        for target_line in sorted(line_insertions.keys(), reverse=True):
            sched_indices = sorted(line_insertions[target_line])
            insert_html = []
            for si in sched_indices:
                insert_html.append(f'<p>{render_img(si)}</p>')
                injected_positions.add(si)
                injected_line_index[si] = target_line + 1
                phase3_count += 1
            # Insere logo após a linha-alvo
            for offset, h in enumerate(insert_html):
                out_lines.insert(target_line + 1 + offset, h)
        
        if phase3_count:
            logger.info(f"[IMG_INJECT] Phase 3 (proximity): {phase3_count} imagens inseridas próximo aos vizinhos")
    
    # Phase 4: Fallback final — apenas para imagens reais com bytes que sobraram
    final_remaining = [
        i for i in range(len(schedule))
        if i not in injected_positions
        and schedule[i] is not None
        and not schedule[i].get('_placeholder')
    ]

    if final_remaining:
        logger.info(f"[IMG_INJECT] Phase 4 (appendix): {len(final_remaining)} imagens → bloco final sequencial")
        out_lines.append(
            '<div class="ata-imagens-secao" style="margin-top:2em;padding-top:1em;'
            'border-top:2px solid #e0e0e0;">'
        )
        out_lines.append(
            f'<p style="color:#888;font-size:0.85em;font-style:italic;">'
            f'({len(final_remaining)} imagem(ns) adicionais anexadas)</p>'
        )
        for idx in final_remaining:
            out_lines.append(f'<p>{render_img(idx)}</p>')
            injected_positions.add(idx)
        out_lines.append('</div>')
    
    total_injected = len(injected_positions)
    logger.info(f"[IMG_INJECT] Final: {total_injected}/{len(schedule)} images injected into document")
    
    return '\n'.join(out_lines)



def _inject_document_thumbnails(html_str: str) -> str:
    """Substitui marcadores [DOCUMENTO ANEXADO: filename] por um bloco HTML de thumbnail estilizado."""
    DOC_MARKER_RE = re.compile(r'\[DOCUMENTO ANEXADO:\s*([^\]]+?)\]')
    
    def render_doc_html(match):
        filename = match.group(1).strip()
        
        # Extrai extensão do arquivo
        parts = filename.split('.')
        ext = parts[-1].upper() if len(parts) > 1 else 'DOC'
        # Limita a 5 caracteres para não quebrar layout
        ext = ext[:5]
        
        # Estilo inline visando compatibilidade com PDF Chromium/wkhtmltopdf
        return f'''<div style="display: inline-flex; align-items: center; align-content: center; background-color: #f0f2f5; border-radius: 6px; padding: 6px 12px; margin: 4px 0; border: 1px solid #e0e0e0; max-width: 320px;">
    <div style="background-color: #ff5252; color: #ffffff; border-radius: 4px; padding: 4px 8px; font-weight: bold; font-family: monospace; font-size: 11px; margin-right: 10px;">
        {ext}
    </div>
    <div style="display: flex; flex-direction: column; overflow: hidden;">
        <span style="font-weight: 600; font-size: 12px; color: #111b21; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px;">{filename}</span>
        <span style="font-size: 10px; color: #667781; margin-top: 1px;">Documento Anexado</span>
    </div>
</div>'''
    
    return DOC_MARKER_RE.sub(render_doc_html, html_str)



async def organize_chat_with_ai(chat_json: dict, on_progress: callable = None, image_bytes: dict = None, *, ata_id: str = None, advogado_id: str = None) -> dict:
    """
    Transforma o chat parseado em documento organizado via OpenAI (Relatório Preparatório).
    Usa texto limpo (não JSON bruto) para economizar tokens.
    Suporta chunking se o chat for muito grande.
    """
    tipo = "PREPARATÓRIO"
    system_prompt = PROMPT_PREPARATORIO
    
    from database import get_http_client
    client = get_http_client()
    if True:
        try:
            # Converter para texto limpo
            chat_text, img_schedule, audio_schedule = _chat_to_text(chat_json)
            logger.info(
                f"[{tipo}] Texto para IA: {len(chat_text)} chars | "
                f"{len(img_schedule)} imgs | {len(audio_schedule)} audios"
            )

            # Dividir em chunks se necessário
            chunks = _split_into_chunks(chat_text)

            if len(chunks) == 1:
                if on_progress:
                    await on_progress(f"Enviando para IA ({tipo})...", 10)
                result = await _call_openai(
                    system_prompt, chat_text, client,
                    ata_id=ata_id, advogado_id=advogado_id,
                    operation="organize_chunk", pipeline_stage="organizing",
                    chunk_index=0, total_chunks=1,
                )
                if on_progress:
                    await on_progress(f"IA ({tipo}) concluída.", 100)
                # Restaura marcadores %%IMG_N%% que a IA removeu ANTES da conversão HTML.
                result = _restore_missing_image_markers(result, len(img_schedule))
                content = _unify_index_section(_apply_formatting(result))
                html = _markdown_to_html(content)
                html = _restore_audio_markers(html, audio_schedule)
                html = _inject_document_thumbnails(html)
                if image_bytes:
                    schedule = _build_positional_image_schedule(image_bytes, chat_json)
                    logger.info(f"[{tipo}] Schedule de imagens: {len(schedule)} entradas")
                    await _compress_images_in_schedule(schedule)
                    html = _inject_images_by_timestamp_schedule(html, schedule)
                return {"conteudo": html}
            
            # Caso com chunks - processa em paralelo e restaura marcadores por chunk
            logger.info(f"[{tipo}] Chat dividido em {len(chunks)} chunks (concorrência máxima: 3)")

            # Pré-indexa quais marcadores %%IMG_N%% existem em cada chunk de input
            # Cada chunk da IA só precisa preservar OS SEUS próprios marcadores
            chunk_img_indices: list[set[int]] = []
            chunk_audio_indices: list[set[int]] = []
            for chunk in chunks:
                found_img = {int(m) for m in _IMG_MARKER_RE.findall(chunk)}
                chunk_img_indices.append(found_img)
                
                found_audio = {int(m) for m in _AUDIO_MARKER_RE.findall(chunk)}
                chunk_audio_indices.append(found_audio)

            sem = asyncio.Semaphore(3)
            completed_chunks = 0

            async def _process_chunk(i: int, chunk: str) -> str:
                nonlocal completed_chunks
                async with sem:
                    # ── Checkpoint lookup: reutiliza chunk já processado ──
                    if ata_id:
                        try:
                            from database import get_supabase_client
                            _chunk_cache = get_supabase_client()
                            if _chunk_cache:
                                cached = _chunk_cache.table("ata_chunks_cache") \
                                    .select("content") \
                                    .eq("ata_id", ata_id) \
                                    .eq("chunk_index", i) \
                                    .eq("total_chunks", len(chunks)) \
                                    .execute()
                                if cached.data and len(cached.data) > 0:
                                    logger.info(f"[{tipo}] Chunk {i+1}/{len(chunks)} — CACHE HIT, reutilizando")
                                    completed_chunks += 1
                                    return cached.data[0]["content"]
                        except Exception as cc_err:
                            logger.warning(f"[{tipo}] Chunk cache lookup failed (proceeding): {cc_err}")

                    is_first = (i == 0)
                    is_last = (i == len(chunks) - 1)

                    if is_first and is_last:
                        instruction = "Gere o documento completo seguindo a estrutura pedida."
                    elif is_first:
                        instruction = "Esta é a PRIMEIRA PARTE. Gere o Título, Identificação, Índice e inicie a seção de Conteúdo Constatado."
                    elif is_last:
                        instruction = "Esta é a ÚLTIMA PARTE. Continue a transcrição das mensagens e finalize após a última mensagem. NÃO gere seção de Conclusão ou análise."
                    else:
                        instruction = f"Esta é a parte {i+1}. NÃO repita títulos ou cabeçalhos iniciais. Mantenha APENAS a transcrição fiel das mensagens obedecendo ao formato padrão."

                    chunk_prompt = f"INSTRUÇÃO DE SEGURANÇA: {instruction}\n\nCONTEÚDO PARA PROCESSAR:\n{chunk}"

                    logger.info(f"[{tipo}] Processando Chunk {i + 1}/{len(chunks)}...")
                    if on_progress:
                        prog = int((completed_chunks / len(chunks)) * 100)
                        await on_progress(f"[{tipo}] Processando parte {i + 1} de {len(chunks)}...", prog)

                    res = await _call_openai(
                        system_prompt, chunk_prompt, client,
                        ata_id=ata_id, advogado_id=advogado_id,
                        operation="organize_chunk", pipeline_stage="organizing",
                        chunk_index=i, total_chunks=len(chunks),
                    )
                    completed_chunks += 1

                    # Restaura apenas os marcadores que pertenciam a ESTE chunk
                    # (evita confundir numeração de outros chunks em paralelo)
                    expected_in_chunk = chunk_img_indices[i]
                    if expected_in_chunk:
                        present_in_res = {int(m) for m in _IMG_MARKER_RE.findall(res)}
                        missing = sorted(expected_in_chunk - present_in_res)
                        if missing:
                            logger.info(f"[IMG_RESTORE] Chunk {i+1}: IA removeu {len(missing)} marcadores — re-inserindo: {missing[:10]}")
                            # Re-insere os marcadores ausentes usando _restore_missing_image_markers
                            # passando o set de marcadores esperados APENAS para este chunk
                            res = _restore_missing_image_markers(res, expected_in_chunk)

                    expected_audio_in_chunk = chunk_audio_indices[i]
                    if expected_audio_in_chunk:
                        present_audio_in_res = {int(m) for m in _AUDIO_MARKER_RE.findall(res)}
                        missing_audio = sorted(expected_audio_in_chunk - present_audio_in_res)
                        if missing_audio:
                            logger.info(f"[AUDIO_RESTORE] Chunk {i+1}: IA removeu {len(missing_audio)} marcadores — re-inserindo: {missing_audio[:10]}")
                            res = _restore_missing_audio_markers(res, expected_audio_in_chunk)

                    # ── Checkpoint write: salva chunk processado para retomada futura ──
                    if ata_id:
                        try:
                            from database import get_supabase_client
                            _chunk_w = get_supabase_client()
                            if _chunk_w:
                                _chunk_w.table("ata_chunks_cache").upsert({
                                    "ata_id": ata_id,
                                    "chunk_index": i,
                                    "total_chunks": len(chunks),
                                    "content": res,
                                }).execute()
                        except Exception as cw_err:
                            logger.warning(f"[{tipo}] Chunk cache write failed (non-critical): {cw_err}")

                    return res

            # Executa chunks em paralelo com semáforo
            tasks = [_process_chunk(i, chunk) for i, chunk in enumerate(chunks)]
            partial_results = await asyncio.gather(*tasks)

            # Une tudo e faz passagem final para capturar qualquer marcador residual
            final_content = "\n\n".join(partial_results)
            final_content = _restore_missing_image_markers(final_content, len(img_schedule))
            final_content = _restore_missing_audio_markers(final_content, len(audio_schedule))
            
            # Remove cabeçalhos duplicados que a IA possa ter gerado nos chunks intermediários
            final_content = _remove_duplicate_headers(final_content)
            
            content = _unify_index_section(_apply_formatting(final_content))
            html = _markdown_to_html(content)
            html = _restore_audio_markers(html, audio_schedule)
            html = _inject_document_thumbnails(html)
            if image_bytes:
                schedule = _build_positional_image_schedule(image_bytes, chat_json)
                logger.info(f"[{tipo}] Schedule de imagens (multi-chunk): {len(schedule)} entradas")
                await _compress_images_in_schedule(schedule)
                html = _inject_images_by_timestamp_schedule(html, schedule)
            return {"conteudo": html}
            
        except Exception as e:
            logger.error(f"[{tipo}] Falha no organize_chat_with_ai: {e}", exc_info=True)
            return {"conteudo": f"ERRO IA: {str(e)}"}

async def transform_content_with_ai(content: str, action: str, client: httpx.AsyncClient = None, *, ata_id: str = None, advogado_id: str = None) -> dict:
    """
    Realiza uma transformação rápida no conteúdo fornecido usando IA.
    Ações suportadas: resumir, formalizar, corrigir, extrair_datas.
    """
    prompts = {
        "resumir": "Você é um assistente jurídico de organização documental. Sua tarefa é criar um resumo executivo e conciso do texto fornecido, destacando os pontos principais e os participantes envolvidos.",
        "formalize": "Você é um revisor jurídico experiente. Sua tarefa é reescrever o texto fornecido utilizando uma linguagem formal, clara e adequada para documentos jurídicos brasileiros, mantendo fielmente o sentido original.",
        "corrigir": "Você é um revisor de textos profissional. Sua tarefa é corrigir erros de ortografia, gramática e concordância do texto fornecido, sem alterar substancialmente o estilo ou o sentido.",
        "extrair_datas": "Você é um assistente de organização. Sua tarefa é extrair todas as datas e horários mencionados no texto e listá-los em ordem cronológica com uma breve menção ao evento associado."
    }
    
    system_prompt = prompts.get(action, "Você é um assistente jurídico prestativo e especializado em organização documental digital.")
    user_content = f"TRANSFORMAÇÃO SOLICITADA: {action}\n\nCONTEÚDO:\n{content}"
    
    try:
        result = await _call_openai(
            system_prompt, user_content, client,
            ata_id=ata_id, advogado_id=advogado_id,
            operation="transform", pipeline_stage=None,
        )
        # Para transformações rápidas, retornamos o texto sem converter para HTML
        # pois o editor TipTap pode inserir inline.
        return {"conteudo": result}
    except Exception as e:
        logger.error(f"Falha no transform_content_with_ai: {e}")
        return {"error": str(e)}
