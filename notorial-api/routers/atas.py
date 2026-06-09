from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, Request
from pydantic import BaseModel
from middleware.auth import get_current_user_id
from database import get_supabase_client, get_supabase_admin_client
from services.whatsapp_parser import parse_whatsapp_zip
from services.pipeline_orchestrator import local_results, _process_pipeline
from services.pdf_generator import generate_pdf_from_html, PdfGenerationError
from services.credits import credits_service
from services.upload_service import save_upload_file_with_limit_and_hash
from services.estimate_service import estimate_cache, ESTIMATE_CACHE_TTL, cleanup_estimate_cache
from services.pdf_cache_service import pdf_cache, PDF_CACHE_TTL, _PDF_STORAGE_BUCKET, cleanup_pdf_cache
import logging
import uuid
import time
import os
import io
import asyncio
import hashlib
import tempfile
import json
from datetime import datetime, timezone
from fastapi.responses import Response

logger = logging.getLogger(__name__)

# ── Security constants ──
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB max upload
_ALLOW_BYPASS = os.getenv("ALLOW_TEST_BYPASS", "false").lower() == "true"

class AtaContentUpdate(BaseModel):
    tipo: str
    conteudo: str

class AtaTitleUpdate(BaseModel):
    titulo: str


class PdfGenerateRequest(BaseModel):
    tipo: str
    conteudo: str
    reviewer_name: str = ""

class AiActionRequest(BaseModel):
    content: str
    action: str

router = APIRouter(prefix="/api/atas", tags=["Atas"])


class AuthContext:
    def __init__(self, client, advogado_id, token):
        self.client = client
        self.advogado_id = advogado_id
        self.token = token

def get_auth_context(request: Request, advogado_id: str = Depends(get_current_user_id)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "") if request.headers.get("Authorization") else ""
    client = get_supabase_client()
    is_bypass = _ALLOW_BYPASS and token == "bypass_admin"
    if client and token and not is_bypass:
        client.postgrest.auth(token)
    return AuthContext(client, advogado_id, token)


# ══════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("")
async def list_atas(
    page: int = 1,
    per_page: int = 50,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    """Lista todas as atas do advogado (excluindo soft-deleted) com paginação."""
    supabase = auth_ctx.client
    if supabase:
        try:
            offset = (page - 1) * per_page
            res = supabase.table("atas") \
                .select("*") \
                .is_("deleted_at", "null") \
                .order("created_at", desc=True) \
                .range(offset, offset + per_page - 1) \
                .execute()
            return res.data or []
        except Exception as e:
            logger.error(f"Erro ao listar atas: {e}")
            return []
    
    results = []
    for ata_id, data in local_results.items():
        parsed = data.get('parsed_data', {})
        results.append({
            "id": ata_id,
            "titulo": "Conversa Transcrita",
            "status": data.get('status', 'processing'),
            "participantes": parsed.get('participantes', []),
            "total_mensagens": parsed.get('total_mensagens', 0),
            "total_audios": parsed.get('total_audios', 0),
        })
    return results

@router.delete("/{ata_id}")
async def delete_ata(ata_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    """Deleta logicamente (soft delete) um documento."""
    advogado_id = auth_ctx.advogado_id
    supabase = auth_ctx.client

    if supabase and advogado_id:
        try:
            # Verifica se o documento existe e pertence ao usuário antes de deletar
            check = supabase.table("atas") \
                .select("id") \
                .eq("id", ata_id) \
                .eq("advogado_id", advogado_id) \
                .is_("deleted_at", "null") \
                .execute()

            if not check.data:
                logger.warning(f"[DELETE] Documento {ata_id} não encontrado ou não pertence ao usuário {advogado_id}")
                raise HTTPException(status_code=404, detail="Documento não encontrado")

            # Usa service-role client para contornar RLS no soft delete
            # (A policy de UPDATE do RLS filtra linhas onde deleted_at IS NULL,
            # mas o WITH CHECK não permite que o campo seja alterado pelo user token.
            # O controle de posse já foi verificado acima.)
            admin_client = get_supabase_admin_client()
            if admin_client:
                res = admin_client.table("atas").update({
                    "deleted_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", ata_id).eq("advogado_id", advogado_id).execute()
                logger.info(f"[DELETE] Documento {ata_id} marcado como deletado via admin client")
            else:
                # Fallback para user token se admin não disponível
                res = supabase.table("atas").update({
                    "deleted_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", ata_id).eq("advogado_id", advogado_id).execute()

                if not res.data:
                    logger.error(f"[DELETE] Soft delete não teve efeito para ata {ata_id} — verifique a RLS policy")
                    raise HTTPException(status_code=500, detail="Falha ao excluir o documento. Tente novamente.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[DELETE] Erro ao deletar documento {ata_id}: {e}")
            raise HTTPException(status_code=500, detail="Erro ao excluir o documento do banco de dados")

    if ata_id in local_results:
        del local_results[ata_id]

    return {"status": "success"}

@router.post("/upload")
async def upload_whatsapp_zip(
    file: UploadFile = File(...),
    startDate: str = Form(None),
    endDate: str = Form(None),
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    start_date = startDate.strip() if startDate and startDate.strip() else None
    end_date = endDate.strip() if endDate and endDate.strip() else None
    logger.info(f"Upload recebido: arquivo={file.filename}, start_date={start_date!r}, end_date={end_date!r}")

    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Apenas arquivos .zip são aceitos")

    # ── Security: File size limit and streaming to disk ──
    fd, temp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    
    try:
        loop = asyncio.get_running_loop()
        size, zip_hash = await loop.run_in_executor(
            None,
            lambda: save_upload_file_with_limit_and_hash(file, temp_path, MAX_UPLOAD_SIZE)
        )
    except ValueError as ve:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=413, detail=str(ve))
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail="Erro ao salvar o arquivo")

    ata_record = None
    supabase = auth_ctx.client
    advogado_id = auth_ctx.advogado_id
    token = auth_ctx.token
    is_bypass_user = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"
    
    if supabase and not is_bypass_user:
        try:
            response = supabase.table('atas').insert({
                'advogado_id': advogado_id,
                'titulo': f"Conversa - {file.filename}",
                'status': 'uploading',
                'zip_filename': file.filename,
                'zip_hash': zip_hash
            }).execute()
            if not response.data:
                raise HTTPException(status_code=500, detail="Falha ao criar registro no banco de dados.")
            ata_record = response.data[0]
        except HTTPException:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise
        except Exception as e:
            logger.warning(f"Supabase insert failed (using local mode): {e}")
    
    ata_id = ata_record['id'] if ata_record else str(uuid.uuid4())
    is_local = ata_record is None
    
    # Ensure it's in local results for status polling even if DB is slow
    local_results[ata_id] = {
        "status": "uploading",
        "progress": 0,
        "status_message": "Iniciando processamento...",
        "user_id": advogado_id,
        "is_local": is_local
    }

    asyncio.create_task(
        _process_pipeline(
            ata_id=ata_id,
            is_local=is_local,
            start_date=start_date,
            end_date=end_date,
            token=token,
            advogado_id=advogado_id,
            temp_path=temp_path
        )
    )
    
    return {"status": "processing", "ata_id": ata_id}


# ══════════════════════════════════════════════════════════════════
# ESTIMATION GATE — Credit Checkpoint Endpoints
# ══════════════════════════════════════════════════════════════════

class ConfirmUploadRequest(BaseModel):
    ata_id: str



@router.post("/upload/estimate")
async def estimate_upload(
    file: UploadFile = File(...),
    startDate: str = Form(None),
    endDate: str = Form(None),
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    """Phase 1: Parse ZIP and estimate pages without processing."""
    start_date = startDate.strip() if startDate and startDate.strip() else None
    end_date = endDate.strip() if endDate and endDate.strip() else None

    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Apenas arquivos .zip são aceitos")

    fd, temp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    
    try:
        loop = asyncio.get_running_loop()
        size, _ = await loop.run_in_executor(
            None,
            lambda: save_upload_file_with_limit_and_hash(file, temp_path, MAX_UPLOAD_SIZE)
        )
    except ValueError as ve:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=413, detail=str(ve))
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail="Erro ao salvar o arquivo")

    advogado_id = auth_ctx.advogado_id

    # Parse rápido (sem transcrição, sem IA)
    try:
        loop = asyncio.get_running_loop()
        parsed_data = await loop.run_in_executor(
            None,
            lambda: parse_whatsapp_zip(temp_path, start_date=start_date, end_date=end_date, estimate_only=True)
        )
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"[ESTIMATE] Erro ao analisar ZIP: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao analisar arquivo: {str(e)}")

    all_audio_bytes = parsed_data.get("arquivos_extraidos", {})

    # Build audio file sizes dict (both full path and basename for safety)
    audio_file_sizes = parsed_data.get("audio_file_sizes_estimate", {})
    if not audio_file_sizes:
        for fname, data in all_audio_bytes.items():
            audio_file_sizes[fname] = len(data)
            audio_file_sizes[os.path.basename(fname)] = len(data)

    # Always estimate pages from parsed data
    estimated_pages = credits_service.estimate_pages(parsed_data, audio_file_sizes)

    # Credit check depends on Supabase being available
    is_bypass = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"
    if is_bypass or not auth_ctx.client:
        balance = 999
        has_credits = True
    else:
        balance = credits_service.get_balance(advogado_id)
        has_credits = balance >= estimated_pages

    # Generate temporary ID and store estimate metadata
    ata_id = str(uuid.uuid4())
    cleanup_estimate_cache()

    supabase = auth_ctx.client
    is_bypass = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"

    if supabase and not is_bypass:
        # Persist to DB so any worker can pick up the confirm
        try:
            supabase.table('atas').insert({
                'id': ata_id,
                'advogado_id': advogado_id,
                'titulo': f"Estimativa - {file.filename}",
                'status': 'estimating',
                'zip_filename': file.filename,
                'estimated_pages': estimated_pages,
                'status_message': json.dumps({
                    'temp_path': temp_path,
                    'start_date': start_date,
                    'end_date': end_date,
                    'timestamp': time.time(),
                })
            }).execute()
            logger.info(f"[ESTIMATE] {ata_id}: metadados persistidos no banco")
        except Exception as e:
            logger.warning(f"[ESTIMATE] Falha ao persistir no banco, usando cache local: {e}")
            estimate_cache[ata_id] = {
                'temp_path': temp_path, 'start_date': start_date, 'end_date': end_date,
                'advogado_id': advogado_id,
                'estimated_pages': estimated_pages, 'confirmed': False,
                'timestamp': time.time(), 'zip_filename': file.filename
            }
    else:
        # Bypass / no Supabase: use local cache
        estimate_cache[ata_id] = {
            'temp_path': temp_path, 'start_date': start_date, 'end_date': end_date,
            'advogado_id': advogado_id,
            'estimated_pages': estimated_pages, 'confirmed': False,
            'timestamp': time.time(), 'zip_filename': file.filename
        }

    logger.info(f"[ESTIMATE] {ata_id}: {estimated_pages} páginas estimadas, saldo={balance}, suficiente={has_credits}")

    return {
        "ata_id": ata_id,
        "estimated_pages": estimated_pages,
        "balance": balance,
        "has_credits": has_credits,
        "total_mensagens": parsed_data.get("total_mensagens", 0),
        "total_audios": parsed_data.get("total_audios", 0),
    }


@router.post("/upload/confirm")
async def confirm_upload(
    req: ConfirmUploadRequest,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    """Phase 2: Debit credits and start processing."""
    ata_id = req.ata_id
    advogado_id = auth_ctx.advogado_id

    supabase = auth_ctx.client
    is_bypass = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"
    
    # Load from DB or fallback to local memory cache
    cached = estimate_cache.get(ata_id)

    if not cached and supabase and not is_bypass:
        try:
            res = supabase.table('atas').select('status, status_message, advogado_id, zip_filename, estimated_pages').eq('id', ata_id).is_('deleted_at', 'null').execute()
            if res.data:
                row = res.data[0]
                if row.get('status') != 'estimating':
                    raise HTTPException(status_code=409, detail="Esta estimativa já foi confirmada ou não existe.")
                meta = json.loads(row.get('status_message') or '{}')
                cached = {
                    'temp_path': meta.get('temp_path'),
                    'start_date': meta.get('start_date'),
                    'end_date': meta.get('end_date'),
                    'advogado_id': row['advogado_id'],
                    'token': auth_ctx.token,
                    'estimated_pages': row.get('estimated_pages', 0),
                    'confirmed': False,
                    'timestamp': meta.get('timestamp', time.time()),
                    'zip_filename': row.get('zip_filename', 'upload.zip'),
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[CONFIRM] Falha ao ler estimativa do banco: {e}")

    # Verify cache validity
    if not cached:
        raise HTTPException(status_code=404, detail="Estimativa expirada ou não encontrada. Envie o arquivo novamente.")

    if cached['advogado_id'] != advogado_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado.")

    if time.time() - cached['timestamp'] > ESTIMATE_CACHE_TTL:
        raise HTTPException(status_code=410, detail="Estimativa expirou (10 minutos). Envie o arquivo novamente.")

    if cached.get('confirmed'):
        raise HTTPException(status_code=409, detail="Este processamento já foi confirmado.")

    estimated_pages = cached['estimated_pages']
    temp_path = cached.get('temp_path')
    start_date = cached['start_date']
    end_date = cached['end_date']
    token = cached['token']
    zip_bytes = None  # no longer stored in memory

    # Check credits first (without debiting yet)
    if not is_bypass and supabase:
        if not credits_service.has_sufficient_credits(advogado_id, estimated_pages):
            raise HTTPException(status_code=402, detail=f"Saldo insuficiente. Necessário: {estimated_pages} créditos.")

    cached["confirmed"] = True

    # Compute hash
    zip_hash = ""
    if temp_path and os.path.exists(temp_path):
        sha256_hash = hashlib.sha256()
        with open(temp_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        zip_hash = sha256_hash.hexdigest()
    elif zip_bytes:
        zip_hash = hashlib.sha256(zip_bytes).hexdigest()

    # Step 1: Create ata record FIRST (FK on credit_transactions.ata_id requires this)
    ata_record = None
    if supabase and not is_bypass:
        try:
            zip_filename = cached.get("zip_filename", "upload.zip")
            response = supabase.table('atas').upsert({
                'id': ata_id,
                'advogado_id': advogado_id,
                'titulo': f"Conversa - {zip_filename}",
                'status': 'uploading',
                'status_message': 'Iniciando processamento...',
                'zip_filename': zip_filename,
                'estimated_pages': estimated_pages,
                'zip_hash': zip_hash
            }).execute()
            if response.data:
                ata_record = response.data[0]
        except Exception as e:
            logger.warning(f"Supabase insert ata failed (using local mode): {e}")

    # Step 2: Debit credits AFTER ata exists (so FK ata_id is valid)
    if not is_bypass and supabase:
        if not credits_service.debit_credits(advogado_id, ata_id, estimated_pages):
            logger.error(f"[CONFIRM] Failed to debit credits for {ata_id}")
            # Don't block processing — credits were verified above

    is_local = ata_record is None
    local_results[ata_id] = {
        "status": "uploading",
        "progress": 0,
        "status_message": "Créditos debitados. Iniciando processamento...",
        "user_id": advogado_id,
        "is_local": is_local
    }

    # Dispatch existing pipeline (untouched but now uses temp_path instead of zip_bytes)
    asyncio.create_task(
        _process_pipeline(
            ata_id=ata_id,
            is_local=is_local,
            start_date=start_date,
            end_date=end_date,
            token=token,
            advogado_id=advogado_id,
            temp_path=temp_path,
            zip_bytes=zip_bytes
        )
    )

    # Free ZIP from cache memory (and clear temp_path from cache to avoid duplicate cleanup by _cleanup_estimate_cache)
    cached["zip_bytes"] = None
    cached["temp_path"] = None

    logger.info(f"[CONFIRM] {ata_id}: {estimated_pages} créditos debitados, pipeline iniciada.")
    return {"status": "processing", "ata_id": ata_id, "debited_credits": estimated_pages}


@router.get("/{ata_id}/status")
async def get_ata_status(ata_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    try:
        supabase = auth_ctx.client

        # Supabase é sempre a fonte de verdade (multi-worker safe).
        if supabase:
            res = supabase.table("atas").select("status, status_message, error_message").eq("id", ata_id).is_("deleted_at", "null").execute()
            if not res.data:
                # Pode estar ainda no mesmo worker (pipeline recém iniciada): checar local.
                cached = local_results.get(ata_id)
                if cached:
                    return {
                        "status": cached.get('status', 'uploading'),
                        "progress": cached.get('progress', 0),
                        "status_message": cached.get('status_message', ''),
                    }
                raise HTTPException(status_code=404, detail="Ata não encontrada")

            data = res.data[0]
            db_status = data.get("status", "")
            status_message = data.get("status_message", "")

            # Enriquecer com progress numérico.
            progress = 50
            if db_status == "ready":
                progress = 100
            elif db_status == "error":
                progress = 0
            elif status_message and "%: " in status_message:
                try:
                    parts = status_message.split("%: ", 1)
                    progress = int(parts[0].strip())
                    data["status_message"] = parts[1].strip()
                except Exception:
                    pass
            else:
                # Fallback: progress granular do worker local
                cached = local_results.get(ata_id)
                if cached:
                    progress = cached.get('progress', 50)

            data["progress"] = progress
            return data

        # Fallback: sem Supabase (modo local).
        cached = local_results.get(ata_id)
        if cached:
            return {
                "status": cached.get('status', 'ready'),
                "progress": cached.get('progress', 0),
                "status_message": cached.get('status_message', ''),
                "error_message": cached.get('error_message'),
                "error_category": cached.get('error_category'),
            }
        return {"status": "ready", "progress": 100}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro interno no get_ata_status na requisição ({ata_id}): {e}", exc_info=True)
        return {"status": "error", "progress": 0, "status_message": "Erro fatal ao buscar status da ata.", "error_message": str(e)}

@router.get("/{ata_id}/preview")
async def get_ata_preview(ata_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    supabase = auth_ctx.client

    if supabase:
        ata_res = supabase.table("atas").select("*").eq("id", ata_id).is_("deleted_at", "null").execute()
        if not ata_res.data:
            raise HTTPException(status_code=404, detail="Ata não encontrada")
        conteudo_res = supabase.table("atas_conteudo").select("*").eq("ata_id", ata_id).execute()
        conteudo = conteudo_res.data[0] if conteudo_res.data else {}
        return {"ata": ata_res.data[0], "conteudo": conteudo}

    # Modo local (sem Supabase): usa local_results.
    cached = local_results.get(ata_id, {})
    parsed = cached.get('parsed_data', {})
    return {
        "ata": {
            "id": ata_id, "titulo": "Conversa Transcrita",
            "status": cached.get('status', 'ready'),
            "participantes": parsed.get('participantes', []),
            "total_mensagens": parsed.get('total_mensagens', 0),
            "total_audios": parsed.get('total_audios', 0),
            "periodo_inicio": parsed.get('periodo', {}).get('inicio', ''),
            "periodo_fim": parsed.get('periodo', {}).get('fim', '')
        },
        "conteudo": {
            "conteudo_formal": cached.get('conteudo_formal', '<p>Conteúdo ainda não processado.</p>'),
            "conteudo_preparatorio": cached.get('conteudo_preparatorio', '<p>Conteúdo ainda não processado.</p>')
        }
    }
    
import re
import unicodedata

def remove_accents(input_str: str) -> str:
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)])

def merge_images_into_html(incoming_html: str, current_html: str) -> str:
    """
    Mescla as imagens base64 do current_html (do banco) no incoming_html (do frontend),
    garantindo que nenhuma imagem seja perdida enquanto as edições textuais do usuário
    são salvas.
    """
    if not current_html:
        return incoming_html

    # 1. Extrair todas as imagens do HTML do banco
    img_pattern = re.compile(r'(<img[^>]+class="ata-imagem-anexada"[^>]*>)')
    db_img_tags = img_pattern.findall(current_html)
    
    if not db_img_tags:
        return incoming_html  # Nenhuma imagem para restaurar
        
    db_images = []
    for tag in db_img_tags:
        alt_match = re.search(r'alt="([^"]+)"', tag)
        alt = alt_match.group(1) if alt_match else ""
        db_images.append({
            "alt": alt,
            "tag": tag
        })
        
    # 2. Verificar quais imagens do banco já estão no incoming_html
    incoming_html_img_tags = img_pattern.findall(incoming_html)
    incoming_alts = []
    for tag in incoming_html_img_tags:
        alt_match = re.search(r'alt="([^"]+)"', tag)
        if alt_match:
            incoming_alts.append(alt_match.group(1))
            
    result_html = incoming_html
    
    # Restaurar as imagens que já estão presentes no incoming_html (atualizando o src base64)
    for db_img in db_images:
        alt = db_img["alt"]
        if alt and alt in incoming_alts:
            # Substituir no incoming_html a tag correspondente com o src correto do banco
            specific_img_pattern = re.compile(r'<img[^>]+alt="' + re.escape(alt) + r'"[^>]*>')
            result_html = specific_img_pattern.sub(db_img["tag"], result_html, count=1)
            
    # 3. Restaurar as imagens que estão FALTANDO no incoming_html
    segments = img_pattern.split(current_html)
    
    for idx, db_img in enumerate(db_images):
        alt = db_img["alt"]
        if alt and alt not in incoming_alts:
            # A imagem está faltando!
            preceding_html = segments[idx * 2]
            
            # Obter texto puro de contexto (últimos de 80 caracteres)
            preceding_text = re.sub(r'<[^>]+>', '', preceding_html)
            preceding_text = " ".join(preceding_text.split())
            context_text = preceding_text[-80:].strip() if len(preceding_text) > 80 else preceding_text.strip()
            
            inserted = False
            if context_text:
                # Tentar encontrar este contexto no result_html
                words = [w for w in context_text.split() if len(w) > 2]
                if words:
                    # Tentar regex flexível
                    flex_pattern_str = r'\s*'.join(re.escape(w) for w in words[-6:])
                    try:
                        flex_pattern = re.compile(flex_pattern_str, re.IGNORECASE)
                        match = flex_pattern.search(result_html)
                        if match:
                            end_pos = match.end()
                            img_paragraph = f'<p>{db_img["tag"]}</p>'
                            result_html = result_html[:end_pos] + img_paragraph + result_html[end_pos:]
                            inserted = True
                            logger.info(f"[MERGE_IMG] Imagem {alt} restaurada por contexto flexível.")
                    except Exception as e:
                        logger.warning(f"[MERGE_IMG] Erro ao buscar contexto flexível para {alt}: {e}")
                        
            if not inserted:
                # Anexar ao final se não achar o contexto
                result_html += f'<p>{db_img["tag"]}</p>'
                logger.info(f"[MERGE_IMG] Imagem {alt} restaurada inserida no final por falta de contexto.")
                
    return result_html

@router.put("/{ata_id}/content")
async def update_ata_content(
    ata_id: str, 
    update_data: AtaContentUpdate,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    supabase = auth_ctx.client
    if not supabase or ata_id in local_results:
        return {"status": "success", "message": "Mocked update"}

    column = "conteudo_formal" if update_data.tipo == "formal" else "conteudo_preparatorio"
    incoming_html = update_data.conteudo

    # ── Proteger imagens base64 contra perda no save ──
    # O Tiptap pode descartar <img src="data:..."> durante a serialização.
    # Usamos o merge de imagens para preservar todas as imagens originais do banco,
    # mesclando-as com as alterações de texto enviadas pelo usuário.
    html_to_save = incoming_html
    try:
        current_res = supabase.table("atas_conteudo").select(column).eq("ata_id", ata_id).execute()
        if current_res.data:
            current_html = current_res.data[0].get(column) or ''
            html_to_save = merge_images_into_html(incoming_html, current_html)
    except Exception as e:
        logger.warning(f"[{ata_id}] Não foi possível mesclar/verificar imagens antes do save: {e}")

    supabase.table("atas_conteudo").update({column: html_to_save}).eq("ata_id", ata_id).execute()
    return {"status": "success"}

@router.patch("/{ata_id}/titulo")
async def update_ata_title(
    ata_id: str,
    update_data: AtaTitleUpdate,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    supabase = auth_ctx.client
    if not supabase or ata_id in local_results:
        if ata_id in local_results:
            local_results[ata_id]["titulo"] = update_data.titulo
        return {"status": "success", "message": "Mocked update"}

    # Update only the title in the atas table
    supabase.table("atas").update({"titulo": update_data.titulo}).eq("id", ata_id).execute()
    return {"status": "success"}


@router.post("/{ata_id}/generate-pdf")
async def generate_pdf(
    ata_id: str,
    req_data: PdfGenerateRequest,
    request: Request,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    reviewer = req_data.reviewer_name or auth_ctx.advogado_id or ""
    
    zip_hash = ""
    if auth_ctx.client:
        try:
            ata_resp = auth_ctx.client.table("atas").select("zip_hash").eq("id", ata_id).execute()
            if ata_resp.data:
                zip_hash = ata_resp.data[0].get("zip_hash", "")
        except Exception as e:
            logger.warning(f"[{ata_id}] Falha ao buscar zip_hash para o PDF: {e}")

    # ── Garantir que imagens base64 não se percam no round-trip pelo Tiptap ──
    # Mesclamos o HTML do editor (que pode ter perdido imagens) com o HTML original
    # persistido no banco de dados para garantir que todas as imagens sejam renderizadas no PDF.
    html_for_pdf = req_data.conteudo
    if auth_ctx.client:
        try:
            col = 'conteudo_formal' if req_data.tipo == 'formal' else 'conteudo_preparatorio'
            conteudo_res = auth_ctx.client.table('atas_conteudo') \
                .select(col) \
                .eq('ata_id', ata_id) \
                .execute()
            if conteudo_res.data:
                db_html = conteudo_res.data[0].get(col) or ''
                html_for_pdf = merge_images_into_html(req_data.conteudo, db_html)
        except Exception as e:
            logger.warning(f"[{ata_id}] Falha ao mesclar HTML com banco para PDF (usando original do frontend): {e}")

    try:
        pdf_bytes, pdf_hash = await generate_pdf_from_html(html_for_pdf, reviewer_name=reviewer, zip_hash=zip_hash)
    except PdfGenerationError as e:
        logger.error(f"[PDF] Falha na geração do PDF para ata {ata_id}: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"[PDF] Erro inesperado ao gerar PDF para ata {ata_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno inesperado ao gerar o PDF")

    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Erro ao gerar PDF")

    # ── Persistir hash do PDF no banco para auditoria ──
    if auth_ctx.client and pdf_hash:
        try:
            auth_ctx.client.table("atas").update({
                "pdf_hash": pdf_hash,
                "pdf_gerado_em": datetime.now(timezone.utc).isoformat()
            }).eq("id", ata_id).execute()
            logger.info(f"[PDF] Hash salvo no banco para ata {ata_id}: {pdf_hash[:16]}...")
        except Exception as e:
            logger.warning(f"[PDF] Falha ao salvar pdf_hash no banco (PDF não afetado): {e}")

    # ── Contagem real de páginas e reembolso automático ──
    actual_pages = None
    estimated_pages = 0
    refunded_credits = 0
    balance_after = None
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        actual_pages = len(reader.pages)
        logger.info(f"[PDF] {ata_id}: {actual_pages} páginas reais no PDF gerado")
    except Exception as e:
        logger.warning(f"[PDF] Falha ao contar páginas do PDF: {e}")

    if auth_ctx.client:
        try:
            # Buscar estimativa original da ata sempre, para exibir no relatório frontend
            ata_resp = auth_ctx.client.table("atas").select("estimated_pages").eq("id", ata_id).execute()
            if ata_resp.data:
                estimated_pages = ata_resp.data[0].get("estimated_pages", 0)
                
            # Só faz reembolso se conseguiu contar as páginas reais e a estimativa for maior
            if actual_pages and estimated_pages > actual_pages:
                refunded_credits = estimated_pages - actual_pages
                credits_service.refund_credits(auth_ctx.advogado_id, ata_id, estimated_pages, actual_pages)
                logger.info(f"[REFUND] {ata_id}: devolvidos {refunded_credits} créditos "
                            f"(estimado={estimated_pages}, real={actual_pages})")
            
            # Buscar saldo atualizado sempre
            balance_after = credits_service.get_balance(auth_ctx.advogado_id)
        except Exception as e:
            logger.warning(f"[REFUND] Falha ao processar reembolso: {e}")

    # Cleanup expired PDFs before adding new one.
    cleanup_pdf_cache()

    pdf_id = str(uuid.uuid4())
    owner_id = auth_ctx.advogado_id
    supabase = auth_ctx.client

    stored_in_storage = False
    if supabase:
        try:
            storage_path = f"{owner_id}/{pdf_id}.pdf"
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: supabase.storage.from_(_PDF_STORAGE_BUCKET).upload(
                    storage_path, pdf_bytes,
                    {"content-type": "application/pdf", "upsert": "true"}
                )
            )
            # Metadata only — without bytes (multi-worker safe).
            pdf_cache[pdf_id] = {"ts": time.time(), "owner": owner_id}
            stored_in_storage = True
            logger.info(f"[PDF] {pdf_id}: armazenado no Storage ({storage_path})")
        except Exception as e:
            logger.warning(f"[PDF] Falha ao salvar no Storage, usando cache local: {e}")

    if not stored_in_storage:
        # Fallback: guardar bytes em memória (bypass / Storage indisponível).
        pdf_cache[pdf_id] = {"ts": time.time(), "owner": owner_id, "bytes": pdf_bytes}

    api_url = str(request.base_url).rstrip('/')
    return {
        "pdf_url": f"{api_url}/api/atas/download/{pdf_id}",
        "pdf_hash": pdf_hash,
        "actual_pages": actual_pages,
        "estimated_pages": estimated_pages,
        "credits_used": actual_pages or estimated_pages,
        "refunded_credits": refunded_credits,
        "balance_after": balance_after,
    }




@router.get("/download/{pdf_id}")
async def download_pdf(pdf_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    meta = pdf_cache.get(pdf_id)
    if not meta:
        raise HTTPException(status_code=404, detail="PDF não encontrado ou expirou")

    # TTL check.
    if time.time() - meta["ts"] > PDF_CACHE_TTL:
        pdf_cache.pop(pdf_id, None)
        raise HTTPException(status_code=410, detail="PDF expirado. Gere novamente.")

    owner_id = meta["owner"]

    # Ownership check (bypass user can access any).
    if owner_id != auth_ctx.advogado_id and not (_ALLOW_BYPASS and auth_ctx.advogado_id == "bypass-admin-id"):
        raise HTTPException(status_code=403, detail="Acesso não autorizado a este PDF")

    # Try to get bytes: from Storage first, then in-memory fallback.
    pdf_bytes = meta.get("bytes")  # set only in local/bypass mode
    if not pdf_bytes:
        supabase = auth_ctx.client
        if not supabase:
            raise HTTPException(status_code=500, detail="Storage indisponível para recuperar o PDF.")
        try:
            storage_path = f"{owner_id}/{pdf_id}.pdf"
            loop = asyncio.get_running_loop()
            pdf_bytes = await loop.run_in_executor(
                None,
                lambda: supabase.storage.from_(_PDF_STORAGE_BUCKET).download(storage_path)
            )
        except Exception as e:
            logger.error(f"[PDF] Falha ao baixar {pdf_id} do Storage: {e}")
            raise HTTPException(status_code=500, detail="Erro ao recuperar PDF. Gere novamente.")

    return Response(content=pdf_bytes, media_type="application/pdf")

@router.post("/{ata_id}/ai-action")
async def ata_ai_action(
    ata_id: str,
    req: AiActionRequest,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    """Executa ações rápidas de IA no conteúdo fornecido."""
    from services.ai_organizer import transform_content_with_ai
    # ata_id pode ser usado no futuro para logar ou salvar no banco,
    # mas no momento estamos apenas transformando o texto.
    result = await transform_content_with_ai(req.content, req.action)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
