import httpx
import logging
import json
import re
import asyncio
import base64
import io
import os
import markdown
from config import settings

logger = logging.getLogger(__name__)

# Prompts - equivalentes aos que rodavam no n8n
# ===========================================================================
PROMPT_FORMAL = """Você é um especialista jurídico encarregado de elaborar Atas Notariais.
Sua tarefa é organizar conversas de WhatsApp para fins judiciais, garantindo absoluta fidelidade e clareza.

REGRAS DE OURO:
1. Agrupe as mensagens por DIA usando títulos formatados como: `### DD/MM/AAAA`.
2. Mantenha a ORDEM CRONOLÓGICA rigorosa.
3. Formato das mensagens: `[DD/MM/AAAA HH:MM] Nome_do_Participante: **"Conteúdo da mensagem"**`
   - O conteúdo deve estar SEMPRE entre aspas duplas e em **negrito**.
   - IMPORTANTE: Substitua "Nome_do_Participante" pelo nome real da pessoa que enviou a mensagem (ex: João, Maria, etc). NÃO use a palavra genérica "Remetente".
4. Áudios transcritos: `[DD/MM/AAAA HH:MM] Nome_do_Participante: 🎙️ [ÁUDIO TRANSCRITO]: **"Conteúdo do áudio..."**`
   - CRÍTICO: Mensagens marcadas com 🎙️ [ÁUDIO TRANSCRITO] DEVEM manter esse prefixo EXATAMENTE como está.
   - NUNCA remova o marcador 🎙️ [ÁUDIO TRANSCRITO] das mensagens de áudio. Ele é essencial para a validade jurídica.
5. Mídias: `[DD/MM/AAAA HH:MM] Nome_do_Participante: [TIPO DE MÍDIA ANEXADA]`
6. Imagens anexadas: `[DD/MM/AAAA HH:MM] Nome_do_Participante: 📷 [IMAGEM ANEXADA: nome_arquivo.jpg]`
   - CRÍTICO: NUNCA remova ou altere tags no formato `[IMAGEM ANEXADA: ...]`. Elas serão substituídas pela imagem real no pós-processamento.
   - Mantenha a tag EXATAMENTE como aparece no input, incluindo o nome do arquivo.
7. NÃO resuma, não interprete e não pule mensagens. Transcreva tudo o que for fornecido.

ESTRUTURA DO DOCUMENTO:
1. TÍTULO: # ATA NOTARIAL DE CONSTATAÇÃO DE CONTEÚDO DIGITAL
2. IDENTIFICAÇÃO (Participantes e Período)
3. CONTEÚDO CONSTATADO (Transcrição organizada por dia)
4. CONCLUSÃO (Resumo técnico do que foi observado, sem juízo de valor)

OBSERVAÇÃO SOBRE PARTES:
Se o texto for enviado em partes (chunks), siga as instruções específicas de cada parte para que o documento final possa ser unido sem duplicidade de títulos.
"""

PROMPT_PREPARATORIO = """Você é um assistente jurídico especializado.

Sua tarefa: organizar a conversa de WhatsApp abaixo de forma ESTRUTURADA para um advogado ler e preparar a ata notarial.

REGRAS:
1. Identificar TODOS os participantes.
2. Agrupar as mensagens por DIA usando títulos `### DD/MM/AAAA`.
3. Manter a ordem cronológica estrita.
4. Formato das mensagens (Estilo Limpo): `[DD/MM/AAAA HH:MM] Nome_do_Participante: **"Conteúdo da mensagem"**`.
   - SUBSTITUA "Nome_do_Participante" pelo nome real de quem enviou a mensagem. NÃO escreva literalmente a palavra "Autor".
   - O timestamp [DD/MM/AAAA HH:MM] e o Nome devem estar SEM negrito.
   - O conteúdo textual deve estar sempre entre aspas e em **negrito**.
5. Incluir índice navegável no início (apenas na primeira parte).
   - O índice deve conter links internos para cada dia no formato: [DD/MM/AAAA](#data-ddmmaaaa)
   - Exemplo: [02/08/2021](#data-02082021)
6. Áudios transcritos DEVEM ser indicados exatamente como: `[DD/MM/AAAA HH:MM] Nome_do_Participante: 🎙️ [ÁUDIO TRANSCRITO]: **"Conteúdo transcrito..."**`
   - CRÍTICO: O prefixo 🎙️ [ÁUDIO TRANSCRITO]: NUNCA deve ser removido ou alterado.
   - Este marcador indica que a mensagem original era um áudio e foi transcrita automaticamente.
   - Mesmo que o conteúdo pareça texto normal, MANTENHA o marcador se ele estiver presente no input.
7. Imagens anexadas: `[DD/MM/AAAA HH:MM] Nome_do_Participante: 📷 [IMAGEM ANEXADA: nome_arquivo.jpg]`
   - CRÍTICO: NUNCA remova ou altere tags `[IMAGEM ANEXADA: ...]`. Mantenha EXATAMENTE como no input.
8. Remover mensagens de sistema irrelevantes.

FORMATO DE SAÍDA:
# Relatório Preparatório - Ata Notarial

## Participantes
- [Nome/Número]

## Índice
- [DD/MM/AAAA](#data-ddmmaaaa)

## Conteúdo Organizado
### DD/MM/AAAA
[DD/MM/AAAA HH:MM] Carlos: **"Mensagem..."**
[DD/MM/AAAA HH:MM] Ana: 🎙️ [ÁUDIO TRANSCRITO]: **"Transcrição do áudio..."**
[DD/MM/AAAA HH:MM] Mário: 📷 [IMAGEM ANEXADA: IMG-20230915-WA0001.jpg]

### DD/MM/AAAA
[DD/MM/AAAA HH:MM] Carlos: **"Mensagem..."**
"""

# ===========================================================================
# Converter chat parsed -> texto limpo para a IA (economiza tokens)
# ===========================================================================

def _chat_to_text(chat_json: dict) -> str:
    """
    Converte o chat parseado em texto limpo para enviar à OpenAI.
    Adiciona aspas ao conteúdo para garantir que a IA identifique o início e fim.
    """
    lines = []
    
    # Header com contexto (metadata)
    participantes = chat_json.get("participantes", [])
    periodo = chat_json.get("periodo", {})
    lines.append(f"PARTICIPANTES: {', '.join(participantes)}")
    lines.append(f"PERÍODO: {periodo.get('inicio', '?')} a {periodo.get('fim', '?')}")
    lines.append(f"TOTAL DE MENSAGENS: {chat_json.get('total_mensagens', 0)}")
    lines.append(f"TOTAL DE ÁUDIOS: {chat_json.get('total_audios', 0)}")
    lines.append("---")
    lines.append("")
    
    for msg in chat_json.get("mensagens", []):
        data = msg.get("data", "")
        hora = msg.get("hora", "")
        remetente = msg.get("remetente", "")
        tipo = msg.get("tipo", "texto")
        conteudo = msg.get("conteudo", "")
        transcricao = msg.get("transcricao")
        
        timestamp = f"[{data} {hora}]"
        
        # Escapa aspas duplas no conteúdo para não quebrar a formatação da IA
        clean_content = str(conteudo).replace('"', '\\"')
        
        if tipo == "audio" and transcricao:
            clean_trans = str(transcricao).replace('"', '\\"')
            lines.append(f'{timestamp} {remetente}: \U0001f399\ufe0f [ÁUDIO TRANSCRITO]: "{clean_trans}"')
        elif tipo == "audio":
            lines.append(f"{timestamp} {remetente}: \U0001f399\ufe0f [ÁUDIO - sem transcrição]")
        elif tipo == "imagem":
            arquivo = msg.get("arquivo")
            if arquivo:
                img_name = os.path.basename(arquivo)
                lines.append(f"{timestamp} {remetente}: \U0001f4f7 [IMAGEM ANEXADA: {img_name}]")
            else:
                lines.append(f"{timestamp} {remetente}: \U0001f4f7 [IMAGEM ANEXADA]")
        elif tipo == "video":
            lines.append(f"{timestamp} {remetente}: \U0001f3a5 [VÍDEO ANEXADO]")
        elif tipo == "midia_omitida":
            lines.append(f"{timestamp} {remetente}: \U0001f4ce [MÍDIA OMITIDA]")
        elif tipo == "arquivo":
            lines.append(f"{timestamp} {remetente}: \U0001f4c4 [DOCUMENTO ANEXADO]")
        else:
            lines.append(f'{timestamp} {remetente}: "{clean_content}"')
    
    return "\n".join(lines)


# ===========================================================================
# Chunking: dividir texto em pedaços se for muito grande
# ===========================================================================

MAX_CHARS_PER_CHUNK = 40000  # ~10k tokens por chunk (4 chars = 1 token em PT-BR)


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
    temperature: float = 0.2
) -> str:
    """
    Faz uma chamada para a API da OpenAI com retry automático e tratamento de erros.
    """
    if not settings.OPENAI_API_KEY:
        raise Exception("OpenAI API Key não configurada.")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": temperature,
        "max_completion_tokens": 16000
    }
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            if client is None:
                # Fallback se não providenciado cliente persistente
                async with httpx.AsyncClient() as temp_client:
                    response = await temp_client.post(url, json=payload, headers=headers, timeout=600.0)
            else:
                response = await client.post(url, json=payload, headers=headers, timeout=600.0)
            
            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]
            
            # Rate limit or server error
            if response.status_code in [429, 500, 502, 503, 504]:
                wait = 2 ** attempt
                logger.warning(f"OpenAI {response.status_code} na tentativa {attempt}. Aguardando {wait}s...")
                await asyncio.sleep(wait)
                continue
                
            # Erro fatal (4xx)
            error_msg = response.text[:500]
            logger.error(f"OpenAI Erro Fatal {response.status_code}: {error_msg}")
            break

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            wait = 2 ** attempt
            logger.warning(f"Conexão OpenAI falhou ({type(e).__name__}). Tentativa {attempt}. Aguardando {wait}s...")
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


def _restore_audio_markers(ai_output: str, original_input: str) -> str:
    """
    Garante que marcadores de áudio transcrito (🎙️ [ÁUDIO TRANSCRITO]) não sejam
    removidos pela IA. Se a IA omitir o marcador mas o conteúdo da transcrição
    estiver presente, re-injeta o marcador.
    """
    # Extrai todas as transcrições do input original
    audio_pattern = re.compile(
        r'\[(\d{2}/\d{2}/\d{4} \d{2}:\d{2})\]\s+([^:]+):\s+\U0001f399\ufe0f\s*\[ÁUDIO TRANSCRITO\]:\s*"([^"]+)"'
    )
    transcriptions = {}
    for match in audio_pattern.finditer(original_input):
        timestamp = match.group(1)
        author = match.group(2).strip()
        trans_text = match.group(3).strip()
        # Usa primeiros 40 chars como chave de busca
        key = trans_text[:40].lower()
        transcriptions[key] = {
            'timestamp': timestamp,
            'author': author,
            'full_text': trans_text
        }
    
    if not transcriptions:
        return ai_output
    
    # Verifica se existem transcrições no output SEM o marcador
    output_lines = ai_output.split('\n')
    result_lines = []
    audio_marker_re = re.compile(r'\U0001f399\ufe0f?\s*\[ÁUDIO(?:\s+TRANSCRITO)?\]')
    
    for line in output_lines:
        # Se a linha já tem marcador de áudio, manter como está
        if audio_marker_re.search(line):
            result_lines.append(line)
            continue
        
        # Verifica se a linha contém conteúdo de alguma transcrição conhecida
        # mas sem o marcador de áudio
        for key, info in transcriptions.items():
            if key in line.lower() and info['author'].lower().split()[0] in line.lower():
                # A IA incluiu o conteúdo da transcrição mas removeu o marcador
                fix_pattern = re.compile(
                    r'(\[' + re.escape(info['timestamp']) + r'\]\s+' + re.escape(info['author']) + r':\s*)'
                )
                fix_match = fix_pattern.search(line)
                if fix_match:
                    prefix = fix_match.group(1)
                    rest = line[fix_match.end():]
                    line = f"{prefix}\U0001f399\ufe0f [ÁUDIO TRANSCRITO]: {rest}"
                    break
        
        result_lines.append(line)
    
    return '\n'.join(result_lines)


def _unify_index_section(md_text: str) -> str:
    """
    Unifica todas as seções de índice em uma única seção:
    - Mantém apenas um cabeçalho "## Índice"
    - Junta todos os links do índice em uma única linha
    - Remove cabeçalhos de índice duplicados e seus blocos
    """
    lines = md_text.split('\n')
    output = []
    collected_links = []

    heading_pattern = re.compile(r'^\s{0,3}#{1,6}\s+')
    index_heading_pattern = re.compile(r'^\s{0,3}##\s+(?:[Íí]ndice|[Ii]ndice)\b')
    md_link_pattern = re.compile(r'\[([^\]]+)\]\((#[^)]+)\)')

    i = 0
    while i < len(lines):
        line = lines[i]

        if index_heading_pattern.match(line):
            i += 1
            while i < len(lines):
                current = lines[i]
                if heading_pattern.match(current):
                    break

                for label, anchor in md_link_pattern.findall(current):
                    link = f"[{label}]({anchor})"
                    if link not in collected_links:
                        collected_links.append(link)
                i += 1
            continue

        output.append(line)
        i += 1

    if collected_links:
        insert_at = None
        for idx, line in enumerate(output):
            if line.strip().startswith('# '):
                insert_at = idx + 1
                break

        unified_block = ['', '## Índice', ' | '.join(collected_links), '']
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
        logger.warning(f"Falha ao comprimir imagem: {e}")
        return base64.b64encode(img_bytes).decode('utf-8')


def _find_image_bytes(filename: str, image_bytes_dict: dict) -> bytes | None:
    """Busca bytes da imagem por caminho exato, basename, ou correspondência parcial."""
    # 1. Exact path match
    if filename in image_bytes_dict:
        return image_bytes_dict[filename]

    basename = os.path.basename(filename).lower()

    # 2. Case-insensitive basename match
    for key, data in image_bytes_dict.items():
        if os.path.basename(key).lower().replace('\u200e', '').replace('\u200f', '') == basename:
            return data

    # 3. Stem match (ignore extension differences e.g. .jpg vs .jpeg)
    stem = os.path.splitext(basename)[0]
    for key, data in image_bytes_dict.items():
        if os.path.splitext(os.path.basename(key).lower().replace('\u200e', '').replace('\u200f', ''))[0] == stem:
            return data

    # 4. Partial match (filename in key or key ends with filename)
    for key, data in image_bytes_dict.items():
        key_lower = key.lower().replace('\u200e', '').replace('\u200f', '')
        if key_lower.endswith(basename) or basename in key_lower:
            return data

    logger.debug(f"Imagem nao encontrada: {filename!r} | disponiveis: {list(image_bytes_dict.keys())[:5]}")
    return None


def _inject_images_base64(html_str: str, image_bytes_dict: dict) -> str:
    """Substitui marcadores [IMAGEM ANEXADA: filename] por tags <img> base64."""
    IMAGE_MARKER_RE = re.compile(r'\[IMAGEM ANEXADA:\s*([^\]]+?)\]')
    markers_found = IMAGE_MARKER_RE.findall(html_str)

    if not markers_found:
        logger.info("inject_images: nenhum marcador [IMAGEM ANEXADA:] encontrado no HTML")
        return html_str

    logger.info(f"inject_images: {len(markers_found)} marcadores encontrados: {markers_found[:5]}")
    logger.info(f"inject_images: {len(image_bytes_dict)} imagens disponíveis: {list(image_bytes_dict.keys())[:5]}")

    if not image_bytes_dict:
        logger.warning("inject_images: image_bytes_dict VAZIO — imagens não foram extraídas do ZIP")
        return html_str

    injected = 0
    missed = []

    def replace_marker(match):
        nonlocal injected
        filename = match.group(1).strip().replace('\u200e', '').replace('\u200f', '')
        img_data = _find_image_bytes(filename, image_bytes_dict)
        if not img_data:
            missed.append(filename)
            return f'<em>[Imagem não encontrada: {filename}]</em>'
        injected += 1
        b64 = _compress_image_to_base64(img_data)
        return f'<img class="ata-imagem-anexada" src="data:image/jpeg;base64,{b64}" alt="{filename}" />'

    result = IMAGE_MARKER_RE.sub(replace_marker, html_str)
    logger.info(f"inject_images: {injected} injetadas, {len(missed)} não encontradas: {missed}")
    return result


async def organize_chat_with_ai(chat_json: dict, is_formal: bool = True, on_progress: callable = None, image_bytes: dict = None) -> dict:
    """
    Transforma o chat parseado em documento organizado via OpenAI.
    Usa texto limpo (não JSON bruto) para economizar tokens.
    Suporta chunking se o chat for muito grande.
    """
    tipo = "FORMAL" if is_formal else "PREPARATÓRIO"
    system_prompt = PROMPT_FORMAL if is_formal else PROMPT_PREPARATORIO
    
    async with httpx.AsyncClient() as client:
        try:
            # Converter para texto limpo
            chat_text = _chat_to_text(chat_json)
            logger.info(f"[{tipo}] Texto para IA gerado: {len(chat_text)} chars")
            
            # Dividir em chunks se necessário
            chunks = _split_into_chunks(chat_text)
            
            if len(chunks) == 1:
                # Caso simples - tudo em uma chamada
                if on_progress:
                    await on_progress(f"Enviando para IA ({tipo})...", 10)
                result = await _call_openai(system_prompt, chat_text, client)
                if on_progress:
                    await on_progress(f"IA ({tipo}) concluída.", 100)
                content = _restore_audio_markers(result, chat_text)
                content = _unify_index_section(_apply_formatting(content))
                html = _markdown_to_html(content)
                if image_bytes:
                    html = _inject_images_base64(html, image_bytes)
                return {"conteudo": html}
            
            # Caso com chunks - processa cada parte e depois unifica
            logger.info(f"[{tipo}] Chat dividido em {len(chunks)} chunks (concorrência máxima: 3)")
            
            sem = asyncio.Semaphore(3) # Reduzido de 10 para 3 para maior estabilidade
            completed_chunks = 0
            
            async def _process_chunk(i: int, chunk: str) -> str:
                nonlocal completed_chunks
                async with sem:
                    is_first = (i == 0)
                    is_last = (i == len(chunks) - 1)
                    
                    # Instrução específica para garantir junção perfeita
                    if is_first and is_last:
                        instruction = "Gere o documento completo seguindo a estrutura pedida."
                    elif is_first:
                        instruction = "Esta é a PRIMEIRA PARTE. Gere o Título, Identificação, Índice e inicie a seção de Conteúdo Constatado."
                    elif is_last:
                        instruction = "Esta é a ÚLTIMA PARTE. Continue a transcrição das mensagens e finalize com a seção de Conclusão."
                    else:
                        instruction = f"Esta é a parte {i+1}. NÃO repita títulos ou cabeçalhos iniciais. Mantenha APENAS a transcrição fiel das mensagens obedecendo ao formato padrão."

                    chunk_prompt = f"INSTRUÇÃO DE SEGURANÇA: {instruction}\n\nCONTEÚDO PARA PROCESSAR:\n{chunk}"
                    
                    logger.info(f"[{tipo}] Processando Chunk {i + 1}/{len(chunks)}...")
                    if on_progress:
                        prog = int((completed_chunks / len(chunks)) * 100)
                        await on_progress(f"[{tipo}] Processando parte {i + 1} de {len(chunks)}...", prog)
                    
                    res = await _call_openai(system_prompt, chunk_prompt, client)
                    
                    completed_chunks += 1
                    return res

            # Executa chunks em paralelo com semáforo
            tasks = [_process_chunk(i, chunk) for i, chunk in enumerate(chunks)]
            partial_results = await asyncio.gather(*tasks)
            
            # Filtra possíveis repetições de título que a IA possa ter ignorado
            # Une tudo com espaçamento duplo
            final_content = "\n\n".join(partial_results)
            final_content = _restore_audio_markers(final_content, chat_text)
            content = _unify_index_section(_apply_formatting(final_content))
            html = _markdown_to_html(content)
            if image_bytes:
                html = _inject_images_base64(html, image_bytes)
            return {"conteudo": html}
            
        except Exception as e:
            logger.error(f"[{tipo}] Falha no organize_chat_with_ai: {e}", exc_info=True)
            return {"conteudo": f"ERRO IA: {str(e)}"}

async def transform_content_with_ai(content: str, action: str, client: httpx.AsyncClient = None) -> dict:
    """
    Realiza uma transformação rápida no conteúdo fornecido usando IA.
    Ações suportadas: resumir, formalizar, corrigir, extrair_datas.
    """
    prompts = {
        "resumir": "Você é um assistente notarial. Sua tarefa é criar um resumo executivo e conciso do texto fornecido, destacando os pontos principais e os participantes envolvidos.",
        "formalize": "Você é um revisor jurídico experiente. Sua tarefa é reescrever o texto fornecido utilizando uma linguagem formal, clara e adequada para documentos notariais brasileiros, mantendo fielmente o sentido original.",
        "corrigir": "Você é um revisor de textos profissional. Sua tarefa é corrigir erros de ortografia, gramática e concordância do texto fornecido, sem alterar substancialmente o estilo ou o sentido.",
        "extrair_datas": "Você é um assistente de organização. Sua tarefa é extrair todas as datas e horários mencionados no texto e listá-los em ordem cronológica com uma breve menção ao evento associado."
    }
    
    system_prompt = prompts.get(action, "Você é um assistente notarial prestativo e especializado em documentos digitais.")
    user_content = f"TRANSFORMAÇÃO SOLICITADA: {action}\n\nCONTEÚDO:\n{content}"
    
    try:
        result = await _call_openai(system_prompt, user_content, client)
        # Para transformações rápidas, retornamos o texto sem converter para HTML
        # pois o editor TipTap pode inserir inline.
        return {"conteudo": result}
    except Exception as e:
        logger.error(f"Falha no transform_content_with_ai: {e}")
        return {"error": str(e)}
