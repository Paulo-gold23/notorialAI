import zipfile
import re
import io
import os
import logging
import unicodedata
import time
from datetime import datetime

logger = logging.getLogger(__name__)

# Aceita mÃºltiplos formatos de data do WhatsApp:
PATTERNS = [
    # Android PT-BR: 09/03/2025, 14:30 - Nome: msg
    re.compile(r'^(\d{2}/\d{2}/\d{4}),?\s+(\d{2}:\d{2})\s*-\s*([^:]+):\s*(.+)'),
    # Android PT-BR com ano curto: 09/03/25, 14:30 - Nome: msg
    re.compile(r'^(\d{2}/\d{2}/\d{2}),?\s+(\d{2}:\d{2})\s*-\s*([^:]+):\s*(.+)'),
    # iOS: [09/03/2025, 14:30:00] Nome: msg
    re.compile(r'^\[(\d{2}/\d{2}/\d{4}),?\s+(\d{2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s*(.+)'),
    # Formato US: MM/DD/YY, H:MM AM/PM - Nome: msg
    re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*([^:]+):\s*(.+)'),
]

# Palavras-chave que indicam Ã¡udio
AUDIO_KEYWORDS = ['.opus', '.ogg', '.m4a', 'Ã¡udio omitido', 'audio omitted', 'audio omitido', 'PTT-', 'AUD-']

# Palavras-chave que indicam mÃ­dia omitida
MEDIA_OMITTED_KEYWORDS = [
    '<media omitted>', '<mÃ­dia oculta>', '<arquivo de mÃ­dia oculto>',
    'mÃ­dia omitida', 'media omitted', 'imagem omitida', 'image omitted',
    'vÃ­deo omitido', 'video omitted', 'figurinha omitida', 'sticker omitted',
    'gif omitido', 'gif omitted', 'documento omitido', 'document omitted',
]

IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
VIDEO_EXTENSIONS = ['.mp4', '.3gp']
AUDIO_EXTENSIONS = ('.opus', '.ogg', '.m4a')

# PrÃ©-compilar regex de extraÃ§Ã£o de nome de arquivo de Ã¡udio
AUDIO_FILE_RE = re.compile(r'((?:PTT|AUD|MSG|AUDIO)-[^\s<>()\[\]]+\.(?:opus|ogg|m4a))', re.IGNORECASE)


def _normalize_for_match(value: str) -> str:
    """
    Normaliza texto para comparacoes mais robustas (remove acentos e baixa caixa).
    """
    lowered = value.lower()
    return ''.join(
        ch for ch in unicodedata.normalize('NFKD', lowered)
        if not unicodedata.combining(ch)
    )


NORMALIZED_AUDIO_KEYWORDS = tuple(_normalize_for_match(kw) for kw in AUDIO_KEYWORDS)
NORMALIZED_MEDIA_OMITTED_KEYWORDS = tuple(_normalize_for_match(kw) for kw in MEDIA_OMITTED_KEYWORDS)


def _find_chat_txt(z: zipfile.ZipFile) -> list[str]:
    """Encontra os arquivos de conversa do WhatsApp no ZIP."""
    all_files = z.namelist()
    txt_files = [
        f for f in all_files
        if f.lower().endswith('.txt')
        and '__MACOSX' not in f
        and not os.path.basename(f).startswith('.')
    ]
    
    if not txt_files:
        return []
    
    chat_files = []
    
    for f in txt_files:
        if f.endswith('_chat.txt') or os.path.basename(f) == '_chat.txt':
            chat_files.append(f)
            continue
            
        try:
            # Le apenas um trecho inicial para evitar descompactar txts grandes.
            with z.open(f) as fp:
                sample = fp.read(2048).decode('utf-8', errors='ignore')
            for pattern in PATTERNS:
                if pattern.search(sample):
                    chat_files.append(f)
                    break
        except Exception:
            continue
    
    if not chat_files and txt_files:
        txt_with_sizes = [(f, z.getinfo(f).file_size) for f in txt_files]
        txt_with_sizes.sort(key=lambda x: x[1], reverse=True)
        chat_files.append(txt_with_sizes[0][0])
    
    return chat_files


def _normalize_date(date_str: str) -> str:
    """Normaliza datas com ano curto (25) para ano longo (2025)."""
    parts = date_str.split('/')
    if len(parts) == 3 and len(parts[2]) == 2:
        year = int(parts[2])
        parts[2] = str(2000 + year) if year < 50 else str(1900 + year)
    return '/'.join(parts)


def _parse_line(line: str) -> dict | None:
    """Tenta parsear uma linha com todos os padrÃµes conhecidos."""
    for pattern in PATTERNS:
        match = pattern.search(line)
        if match:
            data, hora, remetente, conteudo = match.groups()
            return {
                "data": _normalize_date(data.strip()),
                "hora": hora.strip(),
                "remetente": remetente.strip(),
                "conteudo": conteudo.strip()
            }
    return None

def _build_audio_lookup(audio_paths: list[str]) -> tuple[set[str], dict[str, str]]:
    """Cria indices para lookup de audio por caminho completo e basename."""
    exact = set(audio_paths)
    by_basename = {}
    for path in audio_paths:
        base = os.path.basename(path)
        by_basename.setdefault(base, path)
    return exact, by_basename


def _classify_message(conteudo: str, audio_exact_paths: set[str], audio_by_basename: dict[str, str]) -> tuple:
    """Classifica o tipo da mensagem e extrai nome do arquivo se aplicÃ¡vel."""
    conteudo_lower = conteudo.lower()
    conteudo_norm = _normalize_for_match(conteudo)
    
    # Verificar se Ã© Ã¡udio
    for kw in NORMALIZED_AUDIO_KEYWORDS:
        if kw in conteudo_norm:
            file_match = AUDIO_FILE_RE.search(conteudo)
            if file_match:
                filename = file_match.group(1)
                if filename in audio_exact_paths:
                    return 'audio', filename
                mapped = audio_by_basename.get(filename)
                if mapped:
                    return 'audio', mapped
                return 'audio', filename
            
            if 'omitido' in conteudo_lower or 'omitted' in conteudo_lower:
                return 'midia_omitida', None
            return 'audio', None
    
    # Verificar mÃ­dia omitida
    for kw in NORMALIZED_MEDIA_OMITTED_KEYWORDS:
        if kw in conteudo_norm:
            return 'midia_omitida', None
    if 'midia oculta' in conteudo_norm or 'media oculta' in conteudo_norm:
        return 'midia_omitida', None
    
    if any(ext in conteudo_lower for ext in IMAGE_EXTENSIONS):
        return 'imagem', None
    
    if any(ext in conteudo_lower for ext in VIDEO_EXTENSIONS):
        return 'video', None
    
    if '(arquivo anexado)' in conteudo_lower or '(file attached)' in conteudo_lower:
        return 'arquivo', None
    
    return 'texto', None


def _read_chat_content(z: zipfile.ZipFile, chat_filenames: list[str]) -> str:
    """LÃª e concatena o conteÃºdo dos arquivos de chat com detecÃ§Ã£o de encoding."""
    parts = []
    for chat_filename in chat_filenames:
        raw_bytes = z.read(chat_filename)
        content = None
        for encoding in ('utf-8', 'utf-8-sig', 'latin-1', 'cp1252'):
            try:
                content = raw_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if content is None:
            content = raw_bytes.decode('utf-8', errors='replace')
        parts.append(content)
    return "\n".join(parts)


def _list_audio_files(all_files: list[str]) -> list[str]:
    """Lista os caminhos de audio presentes no ZIP sem carregar bytes na memoria."""
    return [
        name for name in all_files
        if name.lower().endswith(AUDIO_EXTENSIONS) and '__MACOSX' not in name
    ]


def _extract_selected_audio_files(
    z: zipfile.ZipFile,
    all_files: list[str],
    selected_files: set[str]
) -> dict[str, bytes]:
    """
    Extrai somente os audios realmente necessarios.
    Aceita selecao por caminho completo e por basename.
    """
    if not selected_files:
        return {}

    selected_basenames = {os.path.basename(f) for f in selected_files}
    audios = {}

    for name in all_files:
        if not name.lower().endswith(AUDIO_EXTENSIONS) or '__MACOSX' in name:
            continue

        if name in selected_files or os.path.basename(name) in selected_basenames:
            audios[name] = z.read(name)

    return audios


def _parse_messages(
    chat_content: str,
    audio_exact_paths: set[str],
    audio_by_basename: dict[str, str]
) -> tuple[list, set, int, int, int]:
    """Parseia as linhas do chat em mensagens estruturadas."""
    mensagens = []
    participantes = set()
    total_audios = 0
    total_imagens = 0
    total_videos = 0
    
    current_msg = None
    
    for line in chat_content.split('\n'):
        line = line.strip()
        if not line:
            continue
        
        parsed = _parse_line(line)
        
        if parsed:
            if current_msg:
                tipo, arquivo = _classify_message(current_msg["conteudo"], audio_exact_paths, audio_by_basename)
                current_msg["tipo"] = tipo
                current_msg["arquivo"] = arquivo
                current_msg["transcricao"] = None
                
                if tipo == 'audio': total_audios += 1
                elif tipo == 'imagem': total_imagens += 1
                elif tipo == 'video': total_videos += 1
                
                participantes.add(current_msg["remetente"])
                mensagens.append(current_msg)
            
            current_msg = parsed
        elif current_msg:
            current_msg["conteudo"] += f"\n{line}"
    
    # Ãšltima mensagem
    if current_msg:
        tipo, arquivo = _classify_message(current_msg["conteudo"], audio_exact_paths, audio_by_basename)
        current_msg["tipo"] = tipo
        current_msg["arquivo"] = arquivo
        current_msg["transcricao"] = None
        if tipo == 'audio': total_audios += 1
        elif tipo == 'imagem': total_imagens += 1
        elif tipo == 'video': total_videos += 1
        participantes.add(current_msg["remetente"])
        mensagens.append(current_msg)
    
    return mensagens, participantes, total_audios, total_imagens, total_videos


def _filter_by_date(mensagens: list, filter_start, filter_end, start_date_str: str, end_date_str: str) -> list:
    """Filtra mensagens por perÃ­odo e recalcula estatÃ­sticas."""
    if not filter_start and not filter_end:
        return mensagens
    
    total_antes = len(mensagens)
    filtered = []
    for msg in mensagens:
        try:
            msg_date = datetime.strptime(msg['data'], "%d/%m/%Y")
            if filter_start and msg_date < filter_start:
                continue
            if filter_end and msg_date > filter_end:
                continue
            filtered.append(msg)
        except ValueError:
            filtered.append(msg)

    logger.info(f"Filtro de data: {total_antes} msgs â†’ {len(filtered)} msgs sobreviveram")

    if not filtered:
        datas_chat = sorted({m['data'] for m in mensagens})
        primeira = datas_chat[0] if datas_chat else "?"
        ultima = datas_chat[-1] if datas_chat else "?"
        raise ValueError(
            f"Nenhuma mensagem encontrada no perÃ­odo selecionado "
            f"({start_date_str} a {end_date_str}). "
            f"O chat contÃ©m mensagens de {primeira} a {ultima}."
        )

    return filtered


def _sort_messages(mensagens: list) -> list:
    """Ordena mensagens cronologicamente."""
    try:
        def sort_key(msg):
            try:
                return datetime.strptime(f"{msg['data']} {msg['hora']}", "%d/%m/%Y %H:%M")
            except ValueError:
                return datetime.min
        mensagens.sort(key=sort_key)
    except Exception:
        pass
    return mensagens


def parse_whatsapp_zip(zip_bytes: bytes, start_date: str = None, end_date: str = None) -> dict:
    """
    Parseia o ZIP do WhatsApp e retorna um JSON com as mensagens.
    Pode filtrar por perÃ­odo se start_date e end_date forem fornecidos.
    """
    try:
        t_total = time.perf_counter()
        # Converter filtros
        def _parse_filter_date(date_str: str):
            if not date_str:
                return None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return datetime.strptime(date_str.strip(), fmt)
                except ValueError:
                    continue
            logger.warning(f"Formato de data nÃ£o reconhecido: {date_str}")
            return None

        filter_start = _parse_filter_date(start_date)
        filter_end = _parse_filter_date(end_date)

        if filter_start or filter_end:
            logger.info(f"Filtro de data ativo: {filter_start} â†’ {filter_end}")

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            t_zip = time.perf_counter()
            all_files = z.namelist()
            logger.info(f"ZIP contÃ©m {len(all_files)} arquivos")
            
            t_chat = time.perf_counter()
            chat_filenames = _find_chat_txt(z)
            if not chat_filenames:
                raise ValueError(
                    f"Nenhum arquivo de conversa do WhatsApp encontrado no ZIP. "
                    f"Arquivos presentes: {', '.join(all_files[:10])}"
                )
            logger.info(f"DetecÃ§Ã£o de chat levou {time.perf_counter() - t_chat:.2f}s")
            
            t_read = time.perf_counter()
            chat_content = _read_chat_content(z, chat_filenames)
            logger.info(f"Leitura de chat levou {time.perf_counter() - t_read:.2f}s")
            audio_file_paths = _list_audio_files(all_files)
            audio_exact_paths, audio_by_basename = _build_audio_lookup(audio_file_paths)
            
            logger.info(f"Chats: {len(chat_filenames)}, Ãudios detectados: {len(audio_file_paths)}")

            t_parse = time.perf_counter()
            mensagens, participantes, total_audios, total_imagens, total_videos = _parse_messages(
                chat_content, audio_exact_paths, audio_by_basename
            )
            logger.info(f"Parse de mensagens levou {time.perf_counter() - t_parse:.2f}s")

            if not mensagens:
                raise ValueError("O arquivo foi encontrado mas nÃ£o contÃ©m mensagens em formato reconhecido do WhatsApp.")

            logger.info(f"Parseadas {len(mensagens)} msgs de {len(participantes)} participantes")

            # Filtrar por data
            mensagens = _filter_by_date(mensagens, filter_start, filter_end, start_date, end_date)

            # Recalcular stats apÃ³s filtro
            if filter_start or filter_end:
                participantes = set(m['remetente'] for m in mensagens)
                total_audios = sum(1 for m in mensagens if m['tipo'] == 'audio')
                total_imagens = sum(1 for m in mensagens if m['tipo'] == 'imagem')
                total_videos = sum(1 for m in mensagens if m['tipo'] == 'video')

            # Ordenar
            mensagens = _sort_messages(mensagens)

            t_extract = time.perf_counter()
            needed_audio_files = {
                m.get("arquivo")
                for m in mensagens
                if m.get("tipo") == "audio" and m.get("arquivo")
            }
            arquivos_audio = _extract_selected_audio_files(z, all_files, needed_audio_files)
            logger.info(
                f"Ãudios necessarios apÃ³s filtro: {len(needed_audio_files)} | "
                f"Ãudios extraidos: {len(arquivos_audio)}"
            )
            logger.info(f"ExtraÃ§Ã£o de Ã¡udios levou {time.perf_counter() - t_extract:.2f}s")
            logger.info(f"Processamento dentro do ZIP levou {time.perf_counter() - t_zip:.2f}s")
        
        def format_iso(date_str):
            if not date_str: return None
            try:
                return datetime.strptime(date_str, "%d/%m/%Y").date().isoformat()
            except Exception:
                return None

        periodo_inicio = format_iso(mensagens[0]['data']) if mensagens else None
        periodo_fim = format_iso(mensagens[-1]['data']) if mensagens else None
        
        logger.info(
            f"Parsing concluÃ­do: {len(mensagens)} msgs, "
            f"{len(participantes)} participantes, "
            f"{total_audios} Ã¡udios, {total_imagens} imgs"
        )
        logger.info(f"parse_whatsapp_zip total: {time.perf_counter() - t_total:.2f}s")
        
        return {
            "participantes": list(participantes),
            "periodo": {"inicio": periodo_inicio, "fim": periodo_fim},
            "mensagens": mensagens,
            "total_mensagens": len(mensagens),
            "total_audios": total_audios,
            "total_imagens": total_imagens,
            "arquivos_extraidos": arquivos_audio
        }
    except zipfile.BadZipFile:
        raise ValueError("Arquivo ZIP invÃ¡lido ou corrompido")
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Erro ao processar arquivo: {e}", exc_info=True)
        raise ValueError(f"Erro interno no processamento do chat: {e}")





