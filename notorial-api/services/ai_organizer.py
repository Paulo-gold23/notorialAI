import httpx
import logging
import json
import re
import asyncio
import markdown
from config import settings

logger = logging.getLogger(__name__)

# Prompts - equivalentes aos que rodavam no n8n
# ===========================================================================
PROMPT_FORMAL = """VocÃª Ã© um especialista jurÃ­dico encarregado de elaborar Atas Notariais.
Sua tarefa Ã© organizar conversas de WhatsApp para fins judiciais, garantindo absoluta fidelidade e clareza.

REGRAS DE OURO:
1. Agrupe as mensagens por DIA usando tÃ­tulos formatados como: `### DD/MM/AAAA`.
2. Mantenha a ORDEM CRONOLÃ“GICA rigorosa.
3. Formato das mensagens: `[DD/MM/AAAA HH:MM] Remetente: **"ConteÃºdo da mensagem"**`
   - O conteÃºdo deve estar SEMPRE entre aspas duplas e em **negrito**.
4. Ãudios: `[DD/MM/AAAA HH:MM] Remetente: ðŸŽ™ï¸ [ÃUDIO TRANSCRITO]: **"ConteÃºdo do Ã¡udio..."**`
5. MÃ­dias: `[DD/MM/AAAA HH:MM] Remetente: [TIPO DE MÃDIA ANEXADA]`
6. NÃƒO resuma, nÃ£o interpreters e nÃ£o pule mensagens. Transcreva tudo o que for fornecido.

ESTRUTURA DO DOCUMENTO:
1. TÃTULO: # ATA NOTARIAL DE CONSTATAÃ‡ÃƒO DE CONTEÃšDO DIGITAL
2. IDENTIFICAÃ‡ÃƒO (Participantes e PerÃ­odo)
3. CONTEÃšDO CONSTATADO (TranscriÃ§Ã£o organizada por dia)
4. CONCLUSÃƒO (Resumo tÃ©cnico do que foi observado, sem juÃ­zo de valor)

OBSERVAÃ‡ÃƒO SOBRE PARTES:
Se o texto for enviado em partes (chunks), siga as instruÃ§Ãµes especÃ­ficas de cada parte para que o documento final possa ser unido sem duplicidade de tÃ­tulos.
"""

PROMPT_PREPARATORIO = """VocÃª Ã© um assistente jurÃ­dico especializado.

Sua tarefa: organizar a conversa de WhatsApp abaixo de forma ESTRUTURADA para um advogado ler e preparar a ata notarial.

REGRAS:
1. Identificar TODOS os participantes.
2. Agrupar as mensagens por DIA usando tÃ­tulos `### DD/MM/AAAA`.
3. Manter a ordem cronolÃ³gica estrita.
4. Formato das mensagens (Estilo Limpo): `[DD/MM/AAAA HH:MM] Autor: **"ConteÃºdo da mensagem"**`.
   - O timestamp [DD/MM/AAAA HH:MM] e o Autor devem estar SEM negrito.
   - O conteÃºdo textual deve estar sempre entre aspas e em **negrito**.
5. Incluir Ã­ndice navegÃ¡vel no inÃ­cio (apenas na primeira parte).
   - O Ã­ndice deve conter links internos para cada dia no formato: [DD/MM/AAAA](#data-ddmmaaaa)
   - Exemplo: [02/08/2021](#data-02082021)
6. Se houver Ã¡udios, indicar no texto como: `[DD/MM/AAAA HH:MM] Autor: ðŸŽ™ï¸ [ÃUDIO: TranscriÃ§Ã£o]`.
7. Remover mensagens de sistema irrelevantes.

FORMATO DE SAÃDA:
# RelatÃ³rio PreparatÃ³rio - Ata Notarial

## Participantes
- [Nome/NÃºmero]

## Ãndice
- [DD/MM/AAAA](#data-ddmmaaaa)

## ConteÃºdo Organizado
### DD/MM/AAAA
[DD/MM/AAAA HH:MM] Autor: **"Mensagem..."**

### DD/MM/AAAA
[DD/MM/AAAA HH:MM] Autor: **"Mensagem..."**
"""

# ===========================================================================
# Converter chat parsed â†’ texto limpo para a IA (economiza tokens)

# ===========================================================================

def _chat_to_text(chat_json: dict) -> str:
    """
    Converte o chat parseado em texto limpo para enviar Ã  OpenAI.
    Adiciona aspas ao conteÃºdo para garantir que a IA identifique o inÃ­cio e fim.
    """
    lines = []
    
    # Header com contexto (metadata)
    participantes = chat_json.get("participantes", [])
    periodo = chat_json.get("periodo", {})
    lines.append(f"PARTICIPANTES: {', '.join(participantes)}")
    lines.append(f"PERÃODO: {periodo.get('inicio', '?')} a {periodo.get('fim', '?')}")
    lines.append(f"TOTAL DE MENSAGENS: {chat_json.get('total_mensagens', 0)}")
    lines.append(f"TOTAL DE ÃUDIOS: {chat_json.get('total_audios', 0)}")
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
        
        # Escapa aspas duplas no conteÃºdo para nÃ£o quebrar a formataÃ§Ã£o da IA
        clean_content = str(conteudo).replace('"', '\"')
        
        if tipo == "audio" and transcricao:
            clean_trans = str(transcricao).replace('"', '\"')
            lines.append(f"{timestamp} {remetente}: ðŸŽ™ï¸ [ÃUDIO TRANSCRITO]: \"{clean_trans}\"")
        elif tipo == "audio":
            lines.append(f"{timestamp} {remetente}: ðŸŽ™ï¸ [ÃUDIO - sem transcriÃ§Ã£o]")
        elif tipo == "imagem":
            lines.append(f"{timestamp} {remetente}: ðŸ“· [IMAGEM ANEXADA]")
        elif tipo == "video":
            lines.append(f"{timestamp} {remetente}: ðŸŽ¥ [VÃDEO ANEXADO]")
        elif tipo == "midia_omitida":
            lines.append(f"{timestamp} {remetente}: ðŸ“Ž [MÃDIA OMITIDA]")
        elif tipo == "arquivo":
            lines.append(f"{timestamp} {remetente}: ðŸ“„ [DOCUMENTO ANEXADO]")
        else:
            lines.append(f"{timestamp} {remetente}: \"{clean_content}\"")
    
    return "\n".join(lines)


# ===========================================================================
# Chunking: dividir texto em pedaÃ§os se for muito grande
# ===========================================================================

MAX_CHARS_PER_CHUNK = 40000  # ~10k tokens por chunk (4 chars = 1 token em PT-BR)


def _split_into_chunks(text: str) -> list[str]:
    """
    Divide o texto em chunks de tamanho aproximado respeitando as quebras de mensagens.
    Evita cortar no meio de uma frase ou no meio de um bloco de metadados.
    """
    if len(text) <= MAX_CHARS_PER_CHUNK:
        return [text]
    
    # Divide por linhas (cada linha Ã© uma mensagem no nosso formato _chat_to_text)
    lines = text.split('\n')
    chunks = []
    current_chunk = []
    current_size = 0
    
    # PadrÃ£o de inÃ­cio de mensagem: [DD/MM/AAAA HH:MM]
    msg_start_pattern = re.compile(r'^\[\d{2}/\d{2}/\d{4} \d{2}:\d{2}\]')
    
    for line in lines:
        line_size = len(line) + 1 # +1 do \n
        
        # Se for uma linha de mensagem nova e estourar o tamanho, fecha o chunk atual
        if current_size + line_size > MAX_CHARS_PER_CHUNK and msg_start_pattern.match(line):
            if current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                current_size = 0
        
        # Caso especial: se a linha sozinha for maior que o chunk (raro mas possÃ­vel em transcriÃ§Ãµes gigantes)
        if line_size > MAX_CHARS_PER_CHUNK:
            # Primeiro descarta o que jÃ¡ temos
            if current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                current_size = 0
            
            # Corta a linha bruta mesmo (nÃ£o tem jeito)
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
    Faz uma chamada para a API da OpenAI com retry automÃ¡tico e tratamento de erros.
    """
    if not settings.OPENAI_API_KEY:
        raise Exception("OpenAI API Key nÃ£o configurada.")

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
                # Fallback se nÃ£o providenciado cliente persistente
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
            logger.warning(f"ConexÃ£o OpenAI falhou ({type(e).__name__}). Tentativa {attempt}. Aguardando {wait}s...")
            await asyncio.sleep(wait)
            continue
            
    raise Exception("Falha ao comunicar com OpenAI apÃ³s mÃºltiplas tentativas.")


def _apply_formatting(text: str) -> str:
    """
    PÃ³s-processamento para garantir formataÃ§Ã£o consistente no documento gerado.
    A IA nem sempre aplica as regras de formataÃ§Ã£o, entÃ£o aplicamos via regex.
    """
    lines = text.split('\n')
    result = []
    
    for line in lines:
        original_line = line
        
        # 1. Linhas com erro de transcriÃ§Ã£o -> toda a linha em negrito
        # Detecta padrÃµes como: [data hora] Remetente: ðŸŽ™ï¸ [ÃUDIO TRANSCRITO]: [Erro na transcriÃ§Ã£o]
        if '[Erro na transcriÃ§Ã£o]' in line or '[Erro na\ntranscriÃ§Ã£o]' in line:
            # Remove negrito existente para evitar duplicaÃ§Ã£o
            clean = line.replace('**', '')
            # Aplica negrito na linha inteira (mas preserva heading markers)
            if clean.strip():
                # Preserve qualquer prefixo markdown (-, *, nÃºmeros)
                match = re.match(r'^(\s*(?:[-*]|\d+\.)\s*)', clean)
                if match:
                    prefix = match.group(1)
                    rest = clean[len(prefix):]
                    line = f"{prefix}**{rest.strip()}**"
                else:
                    line = f"**{clean.strip()}**"
        else:
            # 2. ConteÃºdo entre aspas â†’ negrito
            # Detecta "texto" que NÃƒO estÃ¡ jÃ¡ em negrito **"texto"**
            # Evita aplicar em aspas que jÃ¡ estÃ£o dentro de negrito
            def bold_quotes(m):
                full = m.group(0)
                # Se jÃ¡ estÃ¡ em negrito, nÃ£o mexer
                return full
            
            # Aplica negrito em texto entre aspas que ainda nÃ£o estÃ¡ em negrito
            # Pattern: aspas que NÃƒO sÃ£o precedidas por ** nem seguidas por **
            line = re.sub(
                r'(?<!\*)"([^"]{2,})"(?!\*)',
                r'**"\1"**',
                line
            )
        
        result.append(line)
    
    return '\n'.join(result)


def _unify_index_section(md_text: str) -> str:
    """
    Unifica todas as secoes de indice em uma unica secao:
    - Mantem apenas um cabecalho "## Indice"
    - Junta todos os links do indice em uma unica linha
    - Remove cabecalhos de indice duplicados e seus blocos
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
    O TipTap espera HTML (<strong>, <h1>, etc), nÃ£o markdown (**, #, etc).
    """
    # Adicionando IDs manuais para os tÃ­tulos de data antes do markdown
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


async def organize_chat_with_ai(chat_json: dict, is_formal: bool = True, on_progress: callable = None) -> dict:
    """
    Transforma o chat parseado em documento organizado via OpenAI.
    Usa texto limpo (nÃ£o JSON bruto) para economizar tokens.
    Suporta chunking se o chat for muito grande.
    """
    tipo = "FORMAL" if is_formal else "PREPARATÃ“RIO"
    system_prompt = PROMPT_FORMAL if is_formal else PROMPT_PREPARATORIO
    
    async with httpx.AsyncClient() as client:
        try:
            # Converter para texto limpo
            chat_text = _chat_to_text(chat_json)
            logger.info(f"[{tipo}] Texto para IA gerado: {len(chat_text)} chars")
            
            # Dividir em chunks se necessÃ¡rio
            chunks = _split_into_chunks(chat_text)
            
            if len(chunks) == 1:
                # Caso simples - tudo em uma chamada
                if on_progress:
                    await on_progress(f"Enviando para IA ({tipo})...", 10)
                result = await _call_openai(system_prompt, chat_text, client)
                if on_progress:
                    await on_progress(f"IA ({tipo}) concluÃ­da.", 100)
                content = _unify_index_section(_apply_formatting(result))
                return {"conteudo": _markdown_to_html(content)}
            
            # Caso com chunks - processa cada parte e depois unifica
            logger.info(f"[{tipo}] Chat dividido em {len(chunks)} chunks (concorrÃªncia mÃ¡xima: 3)")
            
            sem = asyncio.Semaphore(3) # Reduzido de 10 para 3 para maior estabilidade
            completed_chunks = 0
            
            async def _process_chunk(i: int, chunk: str) -> str:
                nonlocal completed_chunks
                async with sem:
                    is_first = (i == 0)
                    is_last = (i == len(chunks) - 1)
                    
                    # InstruÃ§Ã£o especÃ­fica para garantir junÃ§Ã£o perfeita
                    if is_first and is_last:
                        instruction = "Gere o documento completo seguindo a estrutura pedida."
                    elif is_first:
                        instruction = "Esta Ã© a PRIMEIRA PARTE. Gere o TÃ­tulo, IdentificaÃ§Ã£o, Ãndice e inicie a seÃ§Ã£o de ConteÃºdo Constatado."
                    elif is_last:
                        instruction = "Esta Ã© a ÃšLTIMA PARTE. Continue a transcriÃ§Ã£o das mensagens e finalize com a seÃ§Ã£o de ConclusÃ£o."
                    else:
                        instruction = f"Esta Ã© a parte {i+1}. NÃƒO repita tÃ­tulos ou cabeÃ§alhos iniciais. Mantenha APENAS a transcriÃ§Ã£o fiel das mensagens obedecendo ao formato padrÃ£o."

                    chunk_prompt = f"INSTRUÃ‡ÃƒO DE SEGURANÃ‡A: {instruction}\n\nCONTEÃšDO PARA PROCESSAR:\n{chunk}"
                    
                    logger.info(f"[{tipo}] Processando Chunk {i + 1}/{len(chunks)}...")
                    if on_progress:
                        prog = int((completed_chunks / len(chunks)) * 100)
                        await on_progress(f"[{tipo}] Processando parte {i + 1} de {len(chunks)}...", prog)
                    
                    res = await _call_openai(system_prompt, chunk_prompt, client)
                    
                    completed_chunks += 1
                    return res

            # Executa chunks em ordem ou paralelo (paralelo com semÃ¡foro Ã© mais rÃ¡pido)
            tasks = [_process_chunk(i, chunk) for i, chunk in enumerate(chunks)]
            partial_results = await asyncio.gather(*tasks)
            
            # Filtra possÃ­veis repetiÃ§Ãµes de tÃ­tulo que a IA possa ter ignorado
            # Une tudo com espaÃ§amento duplo
            final_content = "\n\n".join(partial_results)
            content = _unify_index_section(_apply_formatting(final_content))
            return {"conteudo": _markdown_to_html(content)}
            
        except Exception as e:
            logger.error(f"[{tipo}] Falha no organize_chat_with_ai: {e}", exc_info=True)
            return {"conteudo": f"ERRO IA: {str(e)}"}

async def transform_content_with_ai(content: str, action: str, client: httpx.AsyncClient = None) -> dict:
    """
    Realiza uma transformaÃ§Ã£o rÃ¡pida no conteÃºdo fornecido usando IA.
    AÃ§Ãµes suportadas: resumir, formalizar, corrigir, extrair_datas.
    """
    prompts = {
        "resumir": "VocÃª Ã© um assistente notarial. Sua tarefa Ã© criar um resumo executivo e conciso do texto fornecido, destacando os pontos principais e os participantes envolvidos.",
        "formalize": "VocÃª Ã© um revisor jurÃ­dico experiente. Sua tarefa Ã© reescrever o texto fornecido utilizando uma linguagem formal, clara e adequada para documentos notariais brasileiros, mantendo fielmente o sentido original.",
        "corrigir": "VocÃª Ã© um revisor de textos profissional. Sua tarefa Ã© corrigir erros de ortografia, gramÃ¡tica e concordÃ¢ncia do texto fornecido, sem alterar substancialmente o estilo ou o sentido.",
        "extrair_datas": "VocÃª Ã© um assistente de organizaÃ§Ã£o. Sua tarefa Ã© extrair todas as datas e horÃ¡rios mencionados no texto e listÃ¡-los em ordem cronolÃ³gica com uma breve menÃ§Ã£o ao evento associado."
    }
    
    system_prompt = prompts.get(action, "VocÃª Ã© um assistente notarial prestativo e especializado em documentos digitais.")
    user_content = f"TRANSFORMAÃ‡ÃƒO SOLICITADA: {action}\n\nCONTEÃšDO:\n{content}"
    
    try:
        result = await _call_openai(system_prompt, user_content, client)
        # Para transformaÃ§Ãµes rÃ¡pidas, talvez nÃ£o queiramos converter para HTML completo se for para o editor inserir inline
        # Mas como o editor Ã© TipTap (HTML), vamos retornar formatado.
        return {"conteudo": result}
    except Exception as e:
        logger.error(f"Falha no transform_content_with_ai: {e}")
        return {"error": str(e)}

