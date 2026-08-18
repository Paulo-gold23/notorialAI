import zipfile
import re
import io
import os
import logging
import unicodedata
import time
from datetime import datetime

logger = logging.getLogger(__name__)

# Aceita m├â┬║ltiplos formatos de data do WhatsApp:
PATTERNS = [
    # Android PT-BR: 09/03/2025, 14:30 - Nome: msg
    re.compile(r'^(\d{2}/\d{2}/\d{4}),?\s+(\d{2}:\d{2})\s*-\s*([^:]+):\s*(.*)'),
    # Android PT-BR com ano curto: 09/03/25, 14:30 - Nome: msg
    re.compile(r'^(\d{2}/\d{2}/\d{2}),?\s+(\d{2}:\d{2})\s*-\s*([^:]+):\s*(.*)'),
    # iOS: [09/03/2025, 14:30:00] Nome: msg
    re.compile(r'^\[(\d{2}/\d{2}/\d{4}),?\s+(\d{2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s*(.*)'),
    # Formato US: MM/DD/YY, H:MM AM/PM - Nome: msg
    re.compile(r'^(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*([^:]+):\s*(.*)'),
]

# Palavras-chave que indicam ├â┬íudio
AUDIO_KEYWORDS = ['.opus', '.ogg', '.m4a', '├â┬íudio omitido', 'audio omitted', 'audio omitido', 'PTT-', 'AUD-']

# Palavras-chave que indicam m├â┬¡dia omitida
MEDIA_OMITTED_KEYWORDS = [
    '<media omitted>', '<m├â┬¡dia oculta>', '<arquivo de m├â┬¡dia oculto>',
    'm├â┬¡dia omitida', 'media omitted', 'imagem omitida', 'image omitted',
    'v├â┬¡deo omitido', 'video omitted', 'figurinha omitida', 'sticker omitted',
    'gif omitido', 'gif omitted', 'documento omitido', 'document omitted',
]

IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']
VIDEO_EXTENSIONS = ['.mp4', '.3gp']
AUDIO_EXTENSIONS = ('.opus', '.ogg', '.m4a', '.mp3', '.aac', '.wav', '.webm')

# Prefixos de arquivo que indicam sticker/figurinha (excluir de imagens)
STICKER_PREFIXES = ('sticker', 'stk-')

# Pr├®-compilar regex de extra├º├úo de nome de arquivo de ├íudio
# Cobre todos os formatos conhecidos do WhatsApp:
# PTT-YYYYMMDD-WAxxxx.opus, AUD-xxx.opus, aud-xxx.opus, VN_..., etc.
AUDIO_FILE_RE = re.compile(
    r'([\w\-\(\)\.]+\.(?:opus|ogg|m4a|mp3|aac|wav|flac|webm))',
    re.IGNORECASE
)
IMAGE_EXTENSIONS_TUPLE = tuple(IMAGE_EXTENSIONS)
IMAGE_FILE_RE = re.compile(r'([^\s<>()\[\]"]+\.(?:jpg|jpeg|png))', re.IGNORECASE)
VIDEO_FILE_RE = re.compile(r'([^\s<>()\[\]"]+\.(?:mp4|3gp))', re.IGNORECASE)

# Documentos comuns que podem ser anexados
DOC_EXTENSIONS = ('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.zip', '.rar')
DOC_FILE_RE = re.compile(
    r'([^\s<>()\[\]"]+\.(?:pdf|docx?|xlsx?|pptx?|csv|zip|rar))',
    re.IGNORECASE
)

# iOS/Android: <anexado: filename>
_ANEXADO_RE = re.compile(r'<anexado:\s*([^>]+)>', re.IGNORECASE)


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
    """Tenta parsear uma linha com todos os padr├â┬Áes conhecidos."""
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


def _build_image_lookup(image_paths: list[str]) -> tuple[set[str], dict[str, str]]:
    """Cria indices para lookup de imagem por caminho completo e basename."""
    exact = set(image_paths)
    by_basename = {}
    for path in image_paths:
        base = os.path.basename(path)
        by_basename.setdefault(base, path)
    return exact, by_basename


def _classify_message(conteudo: str, audio_exact_paths: set[str], audio_by_basename: dict[str, str], image_exact_paths: set[str] = None, image_by_basename: dict[str, str] = None) -> tuple:
    """Classifica o tipo da mensagem e extrai nome do arquivo se aplic├â┬ível."""
    conteudo_lower = conteudo.lower()
    conteudo_norm = _normalize_for_match(conteudo)
    
    # Verificar se ├® ├íudio
    for kw in NORMALIZED_AUDIO_KEYWORDS:
        if kw in conteudo_norm:
            file_match = AUDIO_FILE_RE.search(conteudo)
            if file_match:
                filename = file_match.group(1).replace('\u200e', '').replace('\u200f', '').strip()
                # Valida├º├úo m├¡nima: deve ter extens├úo de ├íudio
                if not any(filename.lower().endswith(ext) for ext in ('.opus', '.ogg', '.m4a', '.mp3', '.aac', '.wav', '.flac', '.webm')):
                    filename = None
                
                if filename:
                    if filename in audio_exact_paths:
                        return 'audio', filename
                    mapped = audio_by_basename.get(filename)
                    if mapped:
                        return 'audio', mapped
                    # N├úo est├í no ZIP (pode ter sido filtrado), mas ainda ├® ├íudio
                    logger.debug(f"Audio file found in text but not in ZIP: {filename}")
                    return 'audio', filename
            
            if 'omitido' in conteudo_norm or 'omitted' in conteudo_norm:
                return 'midia_omitida', None
            return 'audio', None
    
    # ÔöÇÔöÇ Verificar IMAGEM ÔÇö antes de "m├¡dia omitida" para capturar o filename ÔöÇÔöÇ
    if any(ext in conteudo_lower for ext in IMAGE_EXTENSIONS):
        file_match = IMAGE_FILE_RE.search(conteudo)
        if file_match:
            filename = file_match.group(1).replace('\u200e', '').replace('\u200f', '')
            # Detectar sticker por prefixo do nome do arquivo (STICKER-xxx.jpg)
            basename_lower = os.path.basename(filename).lower()
            if basename_lower.startswith(STICKER_PREFIXES):
                return 'figurinha', None
            if image_exact_paths and filename in image_exact_paths:
                return 'imagem', filename
            if image_by_basename:
                mapped = image_by_basename.get(filename)
                if mapped:
                    return 'imagem', mapped
            return 'imagem', filename
        # Extension found but no filename match ÔÇö still mark as imagem
        return 'imagem', None

    # Verificar Figurinha (Stickers .webp animados/est├íticos anexos)
    if '.webp' in conteudo_lower:
        return 'figurinha', None

    # Verificar m├¡dia omitida gen├®rica (sem extens├úo de imagem reconhec├¡vel)
    for kw in NORMALIZED_MEDIA_OMITTED_KEYWORDS:
        if kw in conteudo_norm:
            return 'midia_omitida', None
    if 'midia oculta' in conteudo_norm or 'media oculta' in conteudo_norm:
        return 'midia_omitida', None
    
    if any(ext in conteudo_lower for ext in VIDEO_EXTENSIONS):
        file_match = VIDEO_FILE_RE.search(conteudo)
        if file_match:
            filename = file_match.group(1).replace('\u200e', '').replace('\u200f', '')
            return 'video', filename
        return 'video', None
    
    if '(arquivo anexado)' in conteudo_lower or '(file attached)' in conteudo_lower:
        file_match = re.search(r'^(.+?)\s*\((?:arquivo anexado|file attached)\)', conteudo, re.IGNORECASE)
        if file_match:
            filename = file_match.group(1).replace('\u200e', '').replace('\u200f', '').strip()
            return 'arquivo', filename
        return 'arquivo', None

    # Documentos por extensão: .pdf, .docx, .xls, etc.
    if any(ext in conteudo_lower for ext in DOC_EXTENSIONS):
        doc_match = DOC_FILE_RE.search(conteudo)
        if doc_match:
            filename = doc_match.group(1).replace('\u200e', '').replace('\u200f', '').strip()
            return 'arquivo', os.path.basename(filename)
        return 'arquivo', None

    # iOS <anexado: filename> catch-all para tipos ainda não identificados
    anexado_match = _ANEXADO_RE.search(conteudo)
    if anexado_match:
        filename = anexado_match.group(1).replace('\u200e', '').replace('\u200f', '').strip()
        ext = os.path.splitext(filename)[1].lower()
        # Imagens e áudios já foram tratados acima; cobre PDF, ZIP, etc.
        if ext not in ('.jpg', '.jpeg', '.png', '.webp') and not filename.lower().endswith(AUDIO_EXTENSIONS):
            return 'arquivo', os.path.basename(filename)

    return 'texto', None


def _read_chat_content(z: zipfile.ZipFile, chat_filenames: list[str]) -> str:
    """L├â┬¬ e concatena o conte├â┬║do dos arquivos de chat com detec├â┬º├â┬úo de encoding."""
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
    found = [
        name for name in all_files
        if name.lower().endswith(AUDIO_EXTENSIONS) and '__MACOSX' not in name
    ]
    logger.info(f"_list_audio_files: {len(all_files)} arquivos no ZIP ÔåÆ {len(found)} ├íudios detectados: {found[:10]}")
    return found


def _is_sticker_file(filepath: str) -> bool:
    """Detecta se um arquivo ├® um sticker/figurinha pelo prefixo do nome."""
    basename = os.path.basename(filepath).lower()
    return basename.startswith(STICKER_PREFIXES)


def _list_image_files(all_files: list[str]) -> list[str]:
    """Lista os caminhos de imagem presentes no ZIP, excluindo stickers."""
    return [
        name for name in all_files
        if name.lower().endswith(IMAGE_EXTENSIONS_TUPLE)
        and '__MACOSX' not in name
        and not _is_sticker_file(name)
    ]


MAX_SINGLE_MEDIA_BYTES = 50 * 1024 * 1024  # 50 MB max per media file
MAX_TOTAL_CATEGORY_BYTES = 250 * 1024 * 1024  # 250 MB max per media category

def _extract_selected_files(
    z: zipfile.ZipFile,
    all_files: list[str],
    selected_files: set[str],
    extensions_filter: tuple[str, ...],
    max_total_bytes: int = MAX_TOTAL_CATEGORY_BYTES
) -> dict[str, bytes]:
    """
    Extrai do ZIP somente os arquivos (áudio ou imagem) referenciados.
    Evita carregamento desnecessário na memória e filtra __MACOSX.
    Protegido contra Zip Bomb e esgotamento de memória (OOM).
    """
    if not selected_files:
        return {}

    selected_basenames = {os.path.basename(f) for f in selected_files}
    extracted = {}
    total_bytes = 0

    for name in all_files:
        if not name.lower().endswith(extensions_filter) or '__MACOSX' in name:
            continue

        if name in selected_files or os.path.basename(name) in selected_basenames:
            try:
                info = z.getinfo(name)
                # Zip bomb / oversize single file check
                if info.file_size > MAX_SINGLE_MEDIA_BYTES:
                    logger.warning(f"[PARSER] Arquivo {name} excede o limite individual ({info.file_size} bytes). Ignorado para proteger memória.")
                    continue
                if total_bytes + info.file_size > max_total_bytes:
                    logger.warning(f"[PARSER] Limite total de extração de mídia atingido ({max_total_bytes} bytes).")
                    break
                data = z.read(name)
                extracted[name] = data
                total_bytes += len(data)
            except Exception as e:
                logger.warning(f"[PARSER] Erro ao extrair {name}: {e}")

    return extracted


def _parse_messages(
    chat_content: str,
    audio_exact_paths: set[str],
    audio_by_basename: dict[str, str],
    image_exact_paths: set[str] = None,
    image_by_basename: dict[str, str] = None
) -> tuple[list, set, int, int, int]:
    """Parseia as linhas do chat em mensagens estruturadas."""
    mensagens = []
    participantes = set()
    total_audios = 0
    total_imagens = 0
    total_videos = 0
    
    current_msg = None
    
    for line in chat_content.split('\n'):
        line = line.replace('\u200e', '').replace('\u200f', '').replace('\ufeff', '').strip()
        if not line:
            continue
        
        parsed = _parse_line(line)
        
        if parsed:
            if current_msg:
                tipo, arquivo = _classify_message(current_msg["conteudo"], audio_exact_paths, audio_by_basename, image_exact_paths, image_by_basename)
                current_msg["tipo"] = tipo
                current_msg["arquivo"] = arquivo
                current_msg["transcricao"] = None

                # Descarta linhas de texto vazio (artefato iOS antes de álbuns)
                if tipo == 'texto' and not current_msg["conteudo"].strip():
                    current_msg = parsed
                    continue

                if tipo == 'audio': total_audios += 1
                elif tipo == 'imagem': total_imagens += 1
                elif tipo == 'video': total_videos += 1

                participantes.add(current_msg["remetente"])
                mensagens.append(current_msg)

            current_msg = parsed
        elif current_msg:
            current_msg["conteudo"] += f"\n{line}"
    
    # Última mensagem
    if current_msg:
        tipo, arquivo = _classify_message(current_msg["conteudo"], audio_exact_paths, audio_by_basename, image_exact_paths, image_by_basename)
        current_msg["tipo"] = tipo
        current_msg["arquivo"] = arquivo
        current_msg["transcricao"] = None
        # Descarta linhas de texto vazio (artefato iOS)
        if not (tipo == 'texto' and not current_msg["conteudo"].strip()):
            if tipo == 'audio': total_audios += 1
            elif tipo == 'imagem': total_imagens += 1
            elif tipo == 'video': total_videos += 1
            participantes.add(current_msg["remetente"])
            mensagens.append(current_msg)
    
    return mensagens, participantes, total_audios, total_imagens, total_videos


def _filter_by_date(mensagens: list, filter_start, filter_end, start_date_str: str, end_date_str: str) -> list:
    """Filtra mensagens por per├â┬¡odo e recalcula estat├â┬¡sticas."""
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

    logger.info(f"Filtro de data: {total_antes} msgs ├óÔÇáÔÇÖ {len(filtered)} msgs sobreviveram")

    if not filtered:
        datas_chat = sorted({m['data'] for m in mensagens})
        primeira = datas_chat[0] if datas_chat else "?"
        ultima = datas_chat[-1] if datas_chat else "?"
        raise ValueError(
            f"Nenhuma mensagem encontrada no per├â┬¡odo selecionado "
            f"({start_date_str} a {end_date_str}). "
            f"O chat cont├â┬®m mensagens de {primeira} a {ultima}."
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


def _extract_phone_map(chat_content: str, participantes: set, all_files: list = None) -> dict:
    """
    Tenta associar n├║meros de telefone aos nomes dos participantes.
    Estrategias (em ordem de confiabilidade):
    1. Se o pr├│prio remetente j├í ├® um n├║mero, mapeia nome=n├║mero.
    2. Extrai n├║mero do nome da pasta/arquivo dentro do ZIP
       (ex: 'WhatsApp Chat with +55 41 99999-9999/_chat.txt').
    3. Busca padr├Áes '+55...' em mensagens de sistema do WhatsApp
       (ex: 'Paulo Goldner adicionou +55 41 99999-9999' em grupos).
    Retorna dict: {nome_display: numero_telefone}
    """
    phone_re = re.compile(r'\+\d{1,3}[\s\-]?\(?\d{2,3}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}')
    result = {}

    # --- Estrategia 1: remetente JA ├® um n├║mero ---
    for p in participantes:
        clean_p = p.strip()
        if clean_p.startswith('+') or re.fullmatch(r'[\d\s\(\)\-\+]{9,20}', clean_p):
            result[p] = clean_p

    def is_phone_already_mapped(phone: str) -> bool:
        normalized = re.sub(r'\D', '', phone)
        for mapped_phone in result.values():
            if re.sub(r'\D', '', mapped_phone) == normalized:
                return True
        return False

    # --- Estrategia 2: n├║mero no nome da pasta ou arquivo do ZIP ---
    if all_files:
        for f in all_files:
            # Pega o componente raiz (pasta) ou tenta buscar em todo o caminho
            match = phone_re.search(f)
            if match:
                found_phone = match.group(0).strip()
                match_found = False
                # Tenta associar ao participante cujo nome aparece no caminho
                for p in participantes:
                    if p not in result:
                        p_lower = p.lower().strip()
                        if p_lower in f.lower():
                            result[p] = found_phone
                            match_found = True
                            break
                
                if not match_found and not is_phone_already_mapped(found_phone):
                    # Fallback
                    sem_numero = [p for p in participantes if p not in result]
                    if len(sem_numero) == 1:
                        result[sem_numero[0]] = found_phone
                    elif len(sem_numero) == 2:
                        # Se temos 2 participantes sem n├║mero, e um deles ├® o dono ("Voc├¬", "Eu")
                        # associa o telefone ao outro participante
                        dono_labels = ['voc├¬', 'voce', 'eu', 'me', 'you']
                        if sem_numero[0].lower().strip() in dono_labels:
                            result[sem_numero[1]] = found_phone
                        elif sem_numero[1].lower().strip() in dono_labels:
                            result[sem_numero[0]] = found_phone
                        else:
                            # Na d├║vida, associa ao primeiro encontrado no loop (arbitr├írio)
                            result[sem_numero[0]] = found_phone
                break  # Encontrou o n├║mero do arquivo, sai do loop

    # --- Estrategia 3: mensagens de sistema de grupo (O(N) pre-indexed lookup) ---
    system_re = re.compile(
        r'(?:adicionou|added|deixou o grupo|left|entrou|joined|removed|removeu)[^\n]*?(\+\d{1,3}[\s\-]?[\d\s\-]{8,})',
        re.IGNORECASE
    )
    p_digit_map = {}
    for p in participantes:
        if p not in result:
            p_dig = re.sub(r'\D', '', p)
            if len(p_dig) >= 8:
                p_digit_map[p_dig[-8:]] = p

    for m in system_re.finditer(chat_content):
        num = m.group(1).strip()
        num_digits = re.sub(r'\D', '', num)
        if len(num_digits) >= 8:
            suffix = num_digits[-8:]
            if suffix in p_digit_map:
                matched_p = p_digit_map.pop(suffix)
                if matched_p not in result:
                    result[matched_p] = num
                    
    # --- Estrategia 4: Header do documento de texto exportado ---
    header_re = re.compile(r'(?:Conversa do WhatsApp com|WhatsApp Chat with)[\s:]*(\+\d{1,3}[\s\-]?\(?\d{2,3}\)?[\s\-]?\d{4,5}[\s\-]?\d{4})', re.IGNORECASE)
    match_header = header_re.search(chat_content)
    if match_header:
        found_phone = match_header.group(1).strip()
        if not is_phone_already_mapped(found_phone):
            sem_numero = [p for p in participantes if p not in result]
            if len(sem_numero) == 1:
                result[sem_numero[0]] = found_phone
        elif len(sem_numero) == 2:
            dono_labels = ['voc├¬', 'voce', 'eu', 'me', 'you']
            if sem_numero[0].lower().strip() in dono_labels:
                result[sem_numero[1]] = found_phone
            elif sem_numero[1].lower().strip() in dono_labels:
                result[sem_numero[0]] = found_phone
                
    return result


def parse_whatsapp_zip(zip_bytes, start_date: str = None, end_date: str = None, estimate_only: bool = False) -> dict:
    """
    Parseia o ZIP do WhatsApp e retorna um JSON com as mensagens.
    Pode filtrar por período se start_date e end_date forem fornecidos.
    Se estimate_only=True, pula a extração de bytes (só metadados para estimativa de créditos).
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
            logger.warning(f"Formato de data n├â┬úo reconhecido: {date_str}")
            return None

        filter_start = _parse_filter_date(start_date)
        filter_end = _parse_filter_date(end_date)

        if filter_start or filter_end:
            logger.info(f"Filtro de data ativo: {filter_start} ├óÔÇáÔÇÖ {filter_end}")

        # Aceita caminho (str) ou bytes diretamente
        zip_source = zip_bytes if isinstance(zip_bytes, str) else io.BytesIO(zip_bytes)
        with zipfile.ZipFile(zip_source) as z:
            t_zip = time.perf_counter()
            all_files = z.namelist()
            logger.info(f"ZIP cont├â┬®m {len(all_files)} arquivos")
            
            t_chat = time.perf_counter()
            chat_filenames = _find_chat_txt(z)
            if not chat_filenames:
                raise ValueError(
                    f"Nenhum arquivo de conversa do WhatsApp encontrado no ZIP. "
                    f"Arquivos presentes: {', '.join(all_files[:10])}"
                )
            logger.info(f"Detec├â┬º├â┬úo de chat levou {time.perf_counter() - t_chat:.2f}s")
            
            t_read = time.perf_counter()
            chat_content = _read_chat_content(z, chat_filenames)
            logger.info(f"Leitura de chat levou {time.perf_counter() - t_read:.2f}s")
            audio_file_paths = _list_audio_files(all_files)
            audio_exact_paths, audio_by_basename = _build_audio_lookup(audio_file_paths)
            image_file_paths = _list_image_files(all_files)
            image_exact_paths, image_by_basename = _build_image_lookup(image_file_paths)
            
            logger.info(f"Chats: {len(chat_filenames)}, ├â┬üudios detectados: {len(audio_file_paths)}")

            t_parse = time.perf_counter()
            mensagens, participantes, total_audios, total_imagens, total_videos = _parse_messages(
                chat_content, audio_exact_paths, audio_by_basename, image_exact_paths, image_by_basename
            )
            logger.info(f"Parse de mensagens levou {time.perf_counter() - t_parse:.2f}s")

            if not mensagens:
                raise ValueError("O arquivo foi encontrado mas n├â┬úo cont├â┬®m mensagens em formato reconhecido do WhatsApp.")

            logger.info(f"Parseadas {len(mensagens)} msgs de {len(participantes)} participantes")

            # Filtrar por data
            mensagens = _filter_by_date(mensagens, filter_start, filter_end, start_date, end_date)

            # Recalcular stats ap├â┬│s filtro
            if filter_start or filter_end:
                participantes = set(m['remetente'] for m in mensagens)
                total_audios = sum(1 for m in mensagens if m['tipo'] == 'audio')
                total_imagens = sum(1 for m in mensagens if m['tipo'] == 'imagem')
                total_videos = sum(1 for m in mensagens if m['tipo'] == 'video')

            # Ordenar
            mensagens = _sort_messages(mensagens)

            t_extract = time.perf_counter()

            if estimate_only:
                needed_audio_files = {
                    m.get("arquivo")
                    for m in mensagens
                    if m.get("tipo") == "audio" and m.get("arquivo")
                }
                needed_audio_basenames = {os.path.basename(f) for f in needed_audio_files}
                audio_file_sizes = {}
                for name in all_files:
                    if not name.lower().endswith(AUDIO_EXTENSIONS) or '__MACOSX' in name:
                        continue
                    bn = os.path.basename(name)
                    if name in needed_audio_files or bn in needed_audio_basenames:
                        try:
                            audio_file_sizes[bn] = z.getinfo(name).file_size
                        except Exception:
                            pass
                arquivos_audio = {}
                arquivos_imagens = {}
                needed_image_files = set()
                logger.info(f"[estimate_only] Audio sizes: {len(audio_file_sizes)}")
            else:
                audio_file_sizes = {}
                needed_audio_files = {
                    m.get("arquivo")
                    for m in mensagens
                    if m.get("tipo") == "audio" and m.get("arquivo")
                }
                arquivos_audio = _extract_selected_files(z, all_files, needed_audio_files, AUDIO_EXTENSIONS)
                # Lista todas as imagens no zip, ordenadas (ordem cronológica/alfabética)
                all_image_paths = sorted(
                    name for name in _list_image_files(all_files)
                    if not _is_sticker_file(name)
                )

                # Extrai TODAS as imagens do ZIP — o schedule posicional do ai_organizer
                # fará o match exato + basename + FIFO, cobrindo inclusive midia_omitida
                arquivos_imagens = _extract_selected_files(
                    z, all_files, set(all_image_paths), IMAGE_EXTENSIONS_TUPLE
                )

                # Converte midia_omitida → imagem (arquivo=None).
                # Assim recebem marcador %%IMG_N%% no texto da IA e o FIFO do
                # _build_positional_image_schedule atribui a próxima imagem disponível.
                midia_omitida_count = 0
                for m in mensagens:
                    if m.get("tipo") == "midia_omitida":
                        m["tipo"] = "imagem"
                        m["arquivo"] = None
                        midia_omitida_count += 1

                needed_image_files = {
                    m.get("arquivo")
                    for m in mensagens
                    if m.get("tipo") == "imagem" and m.get("arquivo")
                }

                logger.info(
                    f"Imagens ZIP: {len(all_image_paths)} | "
                    f"Msgs imagem: {sum(1 for m in mensagens if m.get('tipo') == 'imagem')} | "
                    f"midia_omitida convertidas: {midia_omitida_count}"
                )

            logger.info(f"Imagens: {len(arquivos_imagens)} | refs: {len(needed_image_files)}")
            logger.info(f"Extracao: {time.perf_counter() - t_extract:.2f}s")
            logger.info(f"ZIP total: {time.perf_counter() - t_zip:.2f}s")
        
        def format_iso(date_str):
            if not date_str: return None
            try:
                return datetime.strptime(date_str, "%d/%m/%Y").date().isoformat()
            except Exception:
                return None

        periodo_inicio = format_iso(mensagens[0]['data']) if mensagens else None
        periodo_fim = format_iso(mensagens[-1]['data']) if mensagens else None
        
        logger.info(
            f"Parsing conclu├â┬¡do: {len(mensagens)} msgs, "
            f"{len(participantes)} participantes, "
            f"{total_audios} ├â┬íudios, {total_imagens} imgs"
        )
        logger.info(f"parse_whatsapp_zip total: {time.perf_counter() - t_total:.2f}s")

        # Mapeia nomes para telefones (best-effort: detecta remetentes que ja sao numeros
        # ou numeros em mensagens de sistema de grupos)
        phone_map = _extract_phone_map(chat_content, set(list(participantes)), all_files=all_files)

        return {
            "participantes": list(participantes),
            "phone_map": phone_map,
            "periodo": {"inicio": periodo_inicio, "fim": periodo_fim},
            "mensagens": mensagens,
            "total_mensagens": len(mensagens),
            "total_audios": total_audios,
            "total_imagens": total_imagens,
            "arquivos_extraidos": arquivos_audio,
            "imagens_extraidas": arquivos_imagens
        }
    except zipfile.BadZipFile:
        raise ValueError("Arquivo ZIP inv├â┬ílido ou corrompido")
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Erro ao processar arquivo: {e}", exc_info=True)
        raise ValueError(f"Erro interno no processamento do chat: {e}")





