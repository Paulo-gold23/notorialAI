# Análise da Base de Código do LegisVox

## 🏗️ Resumo da Arquitetura
A plataforma LegisVox é uma aplicação web desenhada para automatizar a geração de Atas Notariais a partir de exportações de conversas do WhatsApp.
- **Frontend**: Uma aplicação React (`notorial-web`) responsável pelo upload de arquivos ZIP, interações de UI, verificação de créditos e um editor de texto rico baseado no TipTap para visualizar e editar os documentos gerados.
- **Backend**: Um backend em Python utilizando FastAPI (`notorial-api`) que orquestra um pipeline assíncrono:
  1. **Parsing**: Extrai o `_chat.txt`, áudios e imagens do ZIP enviado usando expressões regulares (`whatsapp_parser.py`).
  2. **Transcrição**: Utiliza a Groq API (Whisper-v3) para transcrever os arquivos de áudio extraídos de forma concorrente (`transcription.py`).
  3. **Estruturação por IA**: Usa a OpenAI (GPT-4o/GPT-4o-mini) para reorganizar cronologicamente o chat e formatá-lo juridicamente (`ai_organizer.py`).
  4. **Persistência**: Armazena estado, usuários e documentos no Supabase (tabelas `atas` e `atas_conteudo`).
  5. **Geração de PDF**: Converte HTML para PDF via um microsserviço Gotenberg (`pdf_generator.py`).

## 🚨 Áreas Problemáticas (Riscos e Gargalos)

1. **"God Router" e Mistura de Responsabilidades (`routers/atas.py`)**
   - O arquivo de rotas é gigantesco (mais de 900 linhas). Ele mistura definições de rotas HTTP, transações com o banco de dados Supabase, cache em memória e toda a lógica de negócios central do `_process_pipeline`.
   - A lógica de negócio está fortemente acoplada à camada HTTP, tornando-a difícil de testar isoladamente.

2. **Perigos do Estado em Memória em Produção**
   - Dicionários globais (`local_results`, `estimate_cache`, `pdf_cache`) são usados para rastrear estado e status de processamento (polling).
   - **Risco de Manutenção**: Em um ambiente de produção com múltiplos workers (ex: Gunicorn), esses segmentos de memória são isolados. Se o navegador de um usuário fizer o "polling" de `/status` e cair em um worker diferente daquele que está processando o ZIP, o sistema retornará erro 404 ou ficará travado eternamente no status "uploading".

3. **Vazamento de Memória e Riscos de OOM (Out of Memory)**
   - O pipeline atual lê o arquivo ZIP *inteiro* para a RAM (`io.BytesIO(zip_bytes)`). Ele também armazena todos os bytes de áudios e imagens extraídos em variáveis na memória (`all_audio_bytes`, `all_image_bytes`).
   - O processamento de um arquivo ZIP de 500 MB (limite atual), executado em paralelo por poucas requisições, pode facilmente esgotar a RAM do servidor e causar falhas (OOM crash).

4. **Bloqueio do Event Loop (Gargalo de Performance)**
   - Dentro de `ai_organizer.py`, as imagens são redimensionadas e comprimidas de forma síncrona utilizando a biblioteca Pillow (`_compress_image_to_base64`). Essa operação com uso intensivo de CPU bloqueia o event loop do asyncio, o que faz com que o servidor FastAPI inteiro congele e rejeite/aguarde novas requisições enquanto as imagens são processadas.

5. **Manipulação Frágil de HTML**
   - A injeção de imagens usando Expressões Regulares (Regex) complexas no HTML gerado (`_inject_images_by_schedule` e `_inject_images_base64`) é altamente suscetível a falhas. Se a Inteligência Artificial alterar levemente a estrutura da tag, a regex falhará silenciosamente ou quebrará o layout.

6. **Código Duplicado (`whatsapp_parser.py`)**
   - As funções `_extract_selected_audio_files` e `_extract_selected_image_files` contêm lógica quase idêntica, diferenciando-se apenas pelas extensões que verificam.

## 🛠️ Estratégias de Refatoração

1. **Extrair Serviços de Domínio**: Mover o `_process_pipeline` para fora do arquivo de rotas, para um serviço dedicado `services/pipeline_orchestrator.py`. O arquivo `atas.py` deve servir apenas para validar as requisições HTTP e retornar respostas.
2. **Externalizar Estado (Redis ou Banco de Dados)**: Substituir os dicionários de memória por um cache distribuído (como Redis) para dados de vida curta (estimativas, status). O Supabase deve ser a fonte única de verdade para estados persistentes.
3. **Processamento em Fluxo (Streams)**: Refatorar o parser do ZIP para extrair arquivos diretamente para o disco (arquivos temporários) ou fazer o streaming direto para o Supabase Storage. Evite manter arquivos de mídia grandes na RAM.
4. **Descarregar Tarefas de CPU (Offload)**: Envolver tarefas intensivas para o processador (como a compressão de imagens) em `asyncio.to_thread()` ou `loop.run_in_executor()`, garantindo que não bloqueiem o event loop principal do servidor.
5. **Princípio DRY (Don't Repeat Yourself)**: Consolidar funções redundantes usando funções de ordem superior ou parametrização inteligente.

## ✨ Código Aprimorado (Exemplos)

### 1. Desduplicação na Extração de Arquivos (`whatsapp_parser.py`)
Em vez de funções separadas para áudio e imagens, combinamos em uma única função genérica:

```python
# Antes: _extract_selected_audio_files e _extract_selected_image_files
# Depois: Uma função unificada e reutilizável de extração

def _extract_selected_files(
    z: zipfile.ZipFile, 
    all_files: list[str], 
    selected_files: set[str], 
    valid_extensions: tuple
) -> dict[str, bytes]:
    """
    Extrai apenas os arquivos necessários do ZIP, filtrando por extensão.
    """
    if not selected_files:
        return {}
        
    selected_basenames = {os.path.basename(f) for f in selected_files}
    extracted = {}
    
    for name in all_files:
        if not name.lower().endswith(valid_extensions) or '__MACOSX' in name:
            continue
            
        if name in selected_files or os.path.basename(name) in selected_basenames:
            extracted[name] = z.read(name)
            
    return extracted

# Utilização no parse_whatsapp_zip:
arquivos_audio = _extract_selected_files(z, all_files, needed_audio_files, AUDIO_EXTENSIONS)
arquivos_imagens = _extract_selected_files(z, all_files, paths_to_extract, IMAGE_EXTENSIONS_TUPLE)
```

### 2. Prevenção do Bloqueio do Event Loop (`ai_organizer.py`)
Para evitar que a biblioteca Pillow trave o servidor durante a compressão de imagens, devemos executá-la em uma thread separada:

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Criamos um pool de threads dedicado para tarefas intensivas de CPU
cpu_executor = ThreadPoolExecutor(max_workers=4)

async def _compress_image_async(img_bytes: bytes, max_width: int = 800, quality: int = 75) -> str:
    """
    Executa a compressão de imagem (CPU-bound) em uma thread separada,
    evitando que o event loop do FastAPI seja bloqueado.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        cpu_executor, 
        _compress_image_to_base64, 
        img_bytes, 
        max_width, 
        quality
    )
```

### 3. Separação de Responsabilidades (`routers/atas.py`)
Isolando a lógica do pipeline em um serviço orquestrador:

```python
# routers/atas.py (Limpo e focado no HTTP)

from fastapi import APIRouter, UploadFile, Depends, BackgroundTasks
from services.pipeline_orchestrator import process_ata_pipeline

router = APIRouter()

@router.post("/upload/confirm")
async def confirm_upload(
    req: ConfirmUploadRequest,
    background_tasks: BackgroundTasks,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    # 1. Validação de regras de negócio (ex: checar créditos)
    validate_credits(auth_ctx.advogado_id, req.ata_id)
    
    # 2. Criação do registro inicial
    ata_record = create_ata_record(req.ata_id, auth_ctx.advogado_id)
    
    # 3. Delegação do processamento assíncrono para o orquestrador
    background_tasks.add_task(
        process_ata_pipeline,
        ata_id=req.ata_id,
        advogado_id=auth_ctx.advogado_id
        # ... outros params ...
    )
    
    # 4. Retorno HTTP rápido para não prender a resposta do cliente
    return {"status": "processing", "ata_id": req.ata_id}
```
