from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, Request
from pydantic import BaseModel
from middleware.auth import get_current_user_id
from database import get_supabase_client
from services.whatsapp_parser import parse_whatsapp_zip
from services.transcription import transcribe_all
from services.ai_organizer import organize_chat_with_ai
from services.pdf_generator import generate_pdf_from_html
from services.credits import credits_service
import logging
import uuid
import time
import os
import io
import asyncio
import hashlib
from fastapi.responses import Response

logger = logging.getLogger(__name__)

# ── Security constants ──
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB max upload
PDF_CACHE_TTL = 3600  # 1 hour TTL for cached PDFs
_ALLOW_BYPASS = os.getenv("ALLOW_TEST_BYPASS", "false").lower() == "true"

# In-memory PDF cache with TTL: {pdf_id: (bytes, timestamp)}
pdf_cache = {}

# Estimation cache for credit gate: {ata_id: {..., zip_bytes, timestamp}}
estimate_cache = {}
ESTIMATE_CACHE_TTL = 600  # 10 minutes

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

# In-memory cache for locally-processed results (when no Supabase)
local_results = {}

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


# ── Status helpers ──────────────────────────────────────────────
def _update_status(ata_id: str, is_local: bool, supabase, status_name: str, progress: int = 0, message: str = ""):
    """Atualiza o status da ata (local ou Supabase)."""
    if ata_id not in local_results:
        local_results[ata_id] = {}

    # Sempre atualiza cache local para refletir progresso imediato na UI.
    local_results[ata_id].update({
        'status': status_name,
        'progress': progress,
        'status_message': message
    })

    # Em modo com Supabase, persiste também no banco.
    if not is_local and supabase:
        try:
            supabase.table('atas').update({
                'status': status_name,
                'status_message': message
            }).eq('id', ata_id).execute()
        except Exception as e:
            logger.warning(f"Erro ao atualizar status no Supabase: {e}")


# ── Pipeline de processamento (async, roda via asyncio.create_task) ──
async def _process_pipeline(ata_id: str, zip_bytes: bytes, is_local: bool, start_date: str = None, end_date: str = None, token: str = None, advogado_id: str = None):
    # IMPORTANT: Use the global Supabase client (anon key) for the pipeline.
    # Do NOT use the user's JWT token here — it expires during long processing
    # (transcription + AI can take 5-15 mins) causing "JWT expired" errors.
    # RLS policies already allow anon access via "Service can manage" policies.
    supabase = get_supabase_client()
    is_bypass = _ALLOW_BYPASS and token == "bypass_admin"

    def update(status_name, message="", progress=0):
        _update_status(ata_id, is_local, supabase, status_name, progress=progress, message=message)

    try:
        t_total = time.time()

        # ── ETAPA 1: Parse do ZIP (síncrono, roda em thread para não bloquear) ──
        t0 = time.time()
        update('parsing', "Extraindo e validando mensagens...", progress=10)
        logger.info(f"[{ata_id}] Parsing ZIP com filtro: {start_date} → {end_date}")

        loop = asyncio.get_running_loop()
        parsed_data = await loop.run_in_executor(
            None,
            lambda: parse_whatsapp_zip(zip_bytes, start_date=start_date, end_date=end_date)
        )
        all_audio_bytes = parsed_data.pop("arquivos_extraidos", {})
        all_image_bytes = parsed_data.pop("imagens_extraidas", {})

        logger.info(f"[{ata_id}] Parse OK em {time.time()-t0:.2f}s - "
                     f"{parsed_data['total_mensagens']} msgs, {len(all_audio_bytes)} áudios no ZIP")
        logger.info(f"[{ata_id}] Imagens extraídas do ZIP: {len(all_image_bytes)} | keys: {list(all_image_bytes.keys())[:5]}")

        # Log image-type messages to compare filenames
        img_msgs = [m for m in parsed_data.get("mensagens", []) if m.get("tipo") == "imagem"]
        logger.info(f"[{ata_id}] Mensagens tipo imagem: {len(img_msgs)} | arquivos: {[m.get('arquivo') for m in img_msgs[:5]]}")

        update('parsing', "Arquivos extraídos com sucesso.", progress=25)

        # ── ETAPA 2: Filtrar áudios — só transcrever os referenciados nas mensagens ──
        # IMPORTANTE: parser retorna bytes com path completo do ZIP (ex: "Media/PTT-xxx.opus")
        # mas msg["arquivo"] pode conter só o basename ("PTT-xxx.opus").
        # Construímos um índice por basename para garantir o match.
        audio_by_basename_bytes = {
            os.path.basename(fname): (fname, data)
            for fname, data in all_audio_bytes.items()
        }

        needed_audio_files = {
            msg["arquivo"]
            for msg in parsed_data["mensagens"]
            if msg["tipo"] == "audio" and msg.get("arquivo")
        }
        needed_basenames = {os.path.basename(f) for f in needed_audio_files}

        # Monta dict para transcrição — chave = basename (estável), valor = bytes
        audios_to_transcribe = {}
        for needed in needed_audio_files:
            needed_base = os.path.basename(needed)
            if needed in all_audio_bytes:
                # Match exato pelo path completo
                audios_to_transcribe[needed_base] = all_audio_bytes[needed]
            elif needed_base in audio_by_basename_bytes:
                # Match por basename (cobre ZIP com subpastas)
                _, bdata = audio_by_basename_bytes[needed_base]
                audios_to_transcribe[needed_base] = bdata

        # Normaliza também a referência nas mensagens para basename (resolve mismatch no merge)
        for msg in parsed_data["mensagens"]:
            if msg.get("tipo") == "audio" and msg.get("arquivo"):
                msg["arquivo"] = os.path.basename(msg["arquivo"])

        skipped = len(all_audio_bytes) - len(audios_to_transcribe)
        logger.info(
            f"[{ata_id}] Áudios no ZIP: {len(all_audio_bytes)} | "
            f"Referenciados nas msgs: {len(needed_audio_files)} | "
            f"Para transcrever: {len(audios_to_transcribe)} | "
            f"Pulados/fora do período: {skipped}"
        )

        # ── ETAPA 3: Transcrição paralela (Groq Whisper) ──
        t1 = time.time()
        update('transcribing', f"Transcrevendo {len(audios_to_transcribe)} áudios...", progress=35)

        async def trans_progress(msg, prog):
            update("transcribing", msg, progress=max(35, min(65, prog)))

        transcriptions = await transcribe_all(audios_to_transcribe, on_progress=trans_progress)
        logger.info(f"[{ata_id}] Transcrição concluída em {time.time()-t1:.2f}s - {len(transcriptions)} resultados")

        # ── ETAPA 4: Merge cronológico — injetar transcrições ──
        # Neste ponto msg["arquivo"] já está normalizado para basename (etapa 2 acima)
        merged_count = 0
        miss_count = 0
        for msg in parsed_data["mensagens"]:
            if msg["tipo"] != "audio" or not msg.get("arquivo"):
                continue

            arquivo = msg["arquivo"]  # já é basename

            if arquivo in transcriptions:
                msg["transcricao"] = transcriptions[arquivo]
                merged_count += 1
            else:
                miss_count += 1
                logger.debug(f"[{ata_id}] Sem transcrição para: {arquivo}")

        logger.info(f"[{ata_id}] Merge: {merged_count} injetados, {miss_count} sem transcrição")

        # ── ETAPA 5: Organização com IA (Preparatório) ──
        t2 = time.time()
        update('organizing', "Estruturando documento preparatório com IA...", progress=70)

        async def org_progress(msg, prog):
            update("organizing", msg, progress=max(70, min(95, prog)))

        try:
            preparatorio_data = await organize_chat_with_ai(
                parsed_data, is_formal=False, on_progress=org_progress, image_bytes=all_image_bytes
            )
            logger.info(f"[{ata_id}] IA Preparatória concluída em {time.time()-t2:.2f}s")
        except Exception as e:
            logger.error(f"[{ata_id}] Erro na IA Preparatória: {e}")
            preparatorio_data = {"conteudo": f"[Erro no processamento preparatório: {str(e)}]"}

        # ── ETAPA 6: Salvar resultado ──
        elapsed = time.time() - t_total
        done_msg = f"Processamento concluído em {elapsed:.0f}s!"
        logger.info(f"[{ata_id}] ✅ {done_msg}")

        if supabase and not is_local:
            try:
                supabase.table('atas_conteudo').insert({
                    'ata_id': ata_id,
                    'chat_parseado': parsed_data,
                    'conteudo_formal': None,
                    'conteudo_preparatorio': preparatorio_data.get('conteudo'),
                    'advogado_id': advogado_id
                }).execute()
            except Exception as db_err:
                logger.error(f"[{ata_id}] Aviso: Falha ao inserir atas_conteudo (talvez advogado_id não exista na tabela): {db_err}")
                # Fallback caso a tabela não tenha a coluna
                supabase.table('atas_conteudo').insert({
                    'ata_id': ata_id,
                    'chat_parseado': parsed_data,
                    'conteudo_formal': None,
                    'conteudo_preparatorio': preparatorio_data.get('conteudo')
                }).execute()

            # Gerar título descritivo a partir dos participantes + período
            participantes_list = parsed_data.get('participantes', [])
            periodo = parsed_data.get('periodo', {})
            p_inicio = periodo.get('inicio', '')
            p_fim = periodo.get('fim', '')
            
            # Formatar: "João, Maria - Jan/2025 a Mar/2025"
            nomes = ', '.join(participantes_list[:3])
            if len(participantes_list) > 3:
                nomes += f' +{len(participantes_list) - 3}'
            
            periodo_fmt = ''
            if p_inicio and p_fim:
                try:
                    from datetime import datetime as dt_fmt
                    d1 = dt_fmt.fromisoformat(p_inicio)
                    d2 = dt_fmt.fromisoformat(p_fim)
                    meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                    periodo_fmt = f"{meses[d1.month-1]}/{d1.year} a {meses[d2.month-1]}/{d2.year}"
                except Exception:
                    periodo_fmt = f"{p_inicio} a {p_fim}"
            elif p_inicio:
                periodo_fmt = p_inicio
            
            titulo_smart = nomes
            if periodo_fmt:
                titulo_smart += f" - {periodo_fmt}"
            
            supabase.table('atas').update({
                'status': 'ready',
                'status_message': done_msg,
                'titulo': titulo_smart,
                'participantes': parsed_data.get('participantes'),
                'periodo_inicio': p_inicio,
                'periodo_fim': p_fim,
                'total_mensagens': parsed_data.get('total_mensagens'),
                'total_audios': parsed_data.get('total_audios')
            }).eq('id', ata_id).execute()

            # Mantém cache local sincronizado para status/preview imediato.
            local_results[ata_id] = {
                'parsed_data': parsed_data,
                'conteudo_formal': None,
                'conteudo_preparatorio': preparatorio_data.get('conteudo'),
                'image_bytes': all_image_bytes,
                'status': 'ready',
                'progress': 100,
                'status_message': done_msg,
                'user_id': advogado_id,
                'is_local': False
            }
        else:
            local_results[ata_id] = {
                'parsed_data': parsed_data,
                'conteudo_formal': None,
                'conteudo_preparatorio': preparatorio_data.get('conteudo'),
                'image_bytes': all_image_bytes,
                'status': 'ready',
                'progress': 100,
                'status_message': done_msg
            }

    except Exception as e:
        raw_msg = str(e)
        logger.error(f"[{ata_id}] Error processing ZIP: {raw_msg}", exc_info=True)

        # Categorize error for user-friendly display on frontend
        err_lower = raw_msg.lower()
        if 'badzip' in err_lower or 'zip inválido' in err_lower or 'corrompido' in err_lower:
            err_category = 'ZIP_INVALID'
            err_msg = 'O arquivo ZIP está corrompido ou não é válido. Por favor, exporte novamente a conversa do WhatsApp.'
        elif 'nenhum arquivo de conversa' in err_lower or 'nenhuma mensagem' in err_lower or '_chat.txt' in err_lower:
            err_category = 'ZIP_NO_CHAT'
            err_msg = 'O ZIP enviado não contém uma conversa do WhatsApp. Certifique-se de exportar a conversa pelo WhatsApp usando a opção "Exportar conversa".'
        elif 'nenhuma mensagem encontrada no período' in err_lower:
            err_category = 'DATE_FILTER_EMPTY'
            err_msg = raw_msg  # já é amigável
        elif 'timeout' in err_lower or 'timed out' in err_lower:
            err_category = 'API_TIMEOUT'
            err_msg = 'O processamento demorou mais do que o esperado. Isso pode acontecer com conversas muito longas. Tente novamente.'
        elif 'rate limit' in err_lower or '429' in err_lower:
            err_category = 'API_RATE_LIMIT'
            err_msg = 'Os serviços de IA estão temporariamente sobrecarregados. Aguarde alguns minutos e tente novamente.'
        elif 'openai' in err_lower or 'groq' in err_lower or 'falha ao comunicar' in err_lower:
            err_category = 'AI_ERROR'
            err_msg = 'Houve uma falha na comunicação com o serviço de inteligência artificial. Tente novamente em instantes.'
        elif 'gotenberg' in err_lower or 'pdf' in err_lower:
            err_category = 'PDF_ERROR'
            err_msg = 'Erro ao gerar o documento PDF. O conteúdo foi preservado — você pode tentar gerar o PDF novamente na tela de revisão.'
        else:
            err_category = 'INTERNAL'
            err_msg = 'Ocorreu um erro inesperado no processamento. Nossa equipe foi notificada. Tente novamente.'

        if ata_id not in local_results:
            local_results[ata_id] = {}
        local_results[ata_id].update({
            'status': 'error',
            'progress': 0,
            'status_message': err_msg,
            'error_message': err_msg,
            'error_category': err_category
        })
        if supabase:
            try:
                supabase.table('atas').update({
                    'status': 'error',
                    'status_message': err_msg,
                    'error_message': err_msg
                }).eq('id', ata_id).execute()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@router.get("")
async def list_atas(auth_ctx: AuthContext = Depends(get_auth_context)):
    """Lista todas as atas do advogado."""
    supabase = auth_ctx.client
    if supabase:
        try:
            res = supabase.table("atas").select("*").execute()
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
    """Deleta uma ata."""
    supabase = auth_ctx.client
    if supabase:
        try:
            # Remove transações de crédito associadas para não violar constraint de Foreign Key
            supabase.table("credit_transactions").delete().eq("ata_id", ata_id).execute()
            
            # Deleta a ata
            supabase.table("atas").delete().eq("id", ata_id).execute()
        except Exception as e:
            logger.error(f"Erro ao deletar ata {ata_id}: {e}")
            raise HTTPException(status_code=500, detail="Erro ao deletar ata do banco de dados")
    
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

    # ── Security: File size limit ──
    zip_bytes = await file.read()
    if len(zip_bytes) > MAX_UPLOAD_SIZE:
        size_mb = len(zip_bytes) / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande ({size_mb:.0f}MB). Limite máximo: {MAX_UPLOAD_SIZE // (1024*1024)}MB"
        )

    ata_record = None
    supabase = auth_ctx.client
    advogado_id = auth_ctx.advogado_id
    token = auth_ctx.token
    is_bypass_user = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"
    
    if supabase and not is_bypass_user:
        try:
            zip_hash = hashlib.sha256(zip_bytes).hexdigest()
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
        _process_pipeline(ata_id, zip_bytes, is_local, start_date, end_date, token, advogado_id)
    )
    
    return {"status": "processing", "ata_id": ata_id}


# ══════════════════════════════════════════════════════════════════
# ESTIMATION GATE — Credit Checkpoint Endpoints
# ══════════════════════════════════════════════════════════════════

class ConfirmUploadRequest(BaseModel):
    ata_id: str


def _cleanup_estimate_cache():
    """Remove expired estimates."""
    now = time.time()
    expired = [eid for eid, data in estimate_cache.items() if now - data["timestamp"] > ESTIMATE_CACHE_TTL]
    for eid in expired:
        del estimate_cache[eid]
    if expired:
        logger.info(f"Cleaned up {len(expired)} expired estimates from cache")


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

    zip_bytes = await file.read()
    if len(zip_bytes) > MAX_UPLOAD_SIZE:
        size_mb = len(zip_bytes) / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Arquivo muito grande ({size_mb:.0f}MB). Limite: {MAX_UPLOAD_SIZE // (1024*1024)}MB")

    advogado_id = auth_ctx.advogado_id

    # Parse rápido (sem transcrição, sem IA)
    try:
        loop = asyncio.get_running_loop()
        parsed_data = await loop.run_in_executor(
            None,
            lambda: parse_whatsapp_zip(zip_bytes, start_date=start_date, end_date=end_date)
        )
    except Exception as e:
        logger.error(f"[ESTIMATE] Erro ao analisar ZIP: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao analisar arquivo: {str(e)}")

    all_audio_bytes = parsed_data.get("arquivos_extraidos", {})

    # Build audio file sizes dict (both full path and basename for safety)
    audio_file_sizes = {}
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

    # Generate temporary ID and cache ZIP for confirm phase
    ata_id = str(uuid.uuid4())
    _cleanup_estimate_cache()
    estimate_cache[ata_id] = {
        "zip_bytes": zip_bytes,
        "start_date": start_date,
        "end_date": end_date,
        "advogado_id": advogado_id,
        "token": auth_ctx.token,
        "estimated_pages": estimated_pages,
        "confirmed": False,
        "timestamp": time.time(),
        "zip_filename": file.filename
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

    # Verify cache
    cached = estimate_cache.get(ata_id)
    if not cached:
        raise HTTPException(status_code=404, detail="Estimativa expirada ou não encontrada. Envie o arquivo novamente.")

    # Verify ownership
    if cached["advogado_id"] != advogado_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado.")

    # Verify TTL
    if time.time() - cached["timestamp"] > ESTIMATE_CACHE_TTL:
        del estimate_cache[ata_id]
        raise HTTPException(status_code=410, detail="Estimativa expirou (10 minutos). Envie o arquivo novamente.")

    # Prevent double-confirm
    if cached["confirmed"]:
        raise HTTPException(status_code=409, detail="Este processamento já foi confirmado.")

    # Prepare data
    estimated_pages = cached["estimated_pages"]
    is_bypass = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"
    supabase = auth_ctx.client
    zip_bytes = cached["zip_bytes"]
    start_date = cached["start_date"]
    end_date = cached["end_date"]
    token = cached["token"]
    is_bypass_user = _ALLOW_BYPASS and advogado_id == "bypass-admin-id"

    # Check credits first (without debiting yet)
    if not is_bypass and supabase:
        if not credits_service.has_sufficient_credits(advogado_id, estimated_pages):
            raise HTTPException(status_code=402, detail=f"Saldo insuficiente. Necessário: {estimated_pages} créditos.")

    cached["confirmed"] = True

    # Step 1: Create ata record FIRST (FK on credit_transactions.ata_id requires this)
    ata_record = None
    zip_hash = hashlib.sha256(zip_bytes).hexdigest()
    if supabase and not is_bypass_user:
        try:
            zip_filename = cached.get("zip_filename", "upload.zip")
            response = supabase.table('atas').insert({
                'id': ata_id,
                'advogado_id': advogado_id,
                'titulo': f"Conversa - {zip_filename}",
                'status': 'uploading',
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

    # Dispatch existing pipeline (untouched)
    asyncio.create_task(
        _process_pipeline(ata_id, zip_bytes, is_local, start_date, end_date, token, advogado_id)
    )

    # Free ZIP from cache memory
    cached["zip_bytes"] = None

    logger.info(f"[CONFIRM] {ata_id}: {estimated_pages} créditos debitados, pipeline iniciada.")
    return {"status": "processing", "ata_id": ata_id, "debited_credits": estimated_pages}


@router.get("/{ata_id}/status")
async def get_ata_status(ata_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    try:
        supabase = auth_ctx.client
        if ata_id in local_results:
            cached = local_results.get(ata_id)
            if cached:
                return {
                    "status": cached.get('status', 'ready'), 
                    "progress": cached.get('progress', 0),
                    "status_message": cached.get('status_message', ""),
                    "error_message": cached.get('error_message'),
                    "error_category": cached.get('error_category')
                }
            return {"status": "uploading", "progress": 0, "status_message": "Aguardando início..."}
        
        if not supabase:
            return {"status": "ready", "progress": 100}
            
        res = supabase.table("atas").select("status, status_message, error_message").eq("id", ata_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Ata não encontrada")
            
        data = res.data[0]
        
        if data.get("status") == "ready":
            data["progress"] = 100
        elif data.get("status") == "error":
            data["progress"] = 0
        else:
            data["progress"] = 50
            
        return data
    except Exception as e:
        logger.error(f"Erro interno no get_ata_status na requisição ({ata_id}): {e}", exc_info=True)
        return {"status": "error", "progress": 0, "status_message": "Erro fatal ao buscar status da ata.", "error_message": str(e)}

@router.get("/{ata_id}/preview")
async def get_ata_preview(ata_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    supabase = auth_ctx.client
    if ata_id in local_results or not supabase:
        cached = local_results.get(ata_id, {})
        parsed = cached.get('parsed_data', {})
        return {
            "ata": {
                "id": ata_id,
                "titulo": "Conversa Transcrita",
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
        
    ata_res = supabase.table("atas").select("*").eq("id", ata_id).execute()
    if not ata_res.data:
        raise HTTPException(status_code=404, detail="Ata não encontrada")
        
    conteudo_res = supabase.table("atas_conteudo").select("*").eq("ata_id", ata_id).execute()
    conteudo = conteudo_res.data[0] if conteudo_res.data else {}
    
    return {
        "ata": ata_res.data[0],
        "conteudo": conteudo
    }
    
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
    supabase.table("atas_conteudo").update({column: update_data.conteudo}).eq("ata_id", ata_id).execute()
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


@router.post("/{ata_id}/generate-formal")
async def generate_formal_content(
    ata_id: str,
    auth_ctx: AuthContext = Depends(get_auth_context)
):
    """Gera a versão cartorária (formal) sob demanda."""
    supabase = auth_ctx.client
    
    parsed_data = None
    
    if ata_id in local_results:
        cached = local_results.get(ata_id, {})
        parsed_data = cached.get('parsed_data')
        cached_images = cached.get('image_bytes', {})
    elif supabase:
        conteudo_res = supabase.table('atas_conteudo').select('chat_parseado').eq('ata_id', ata_id).execute()
        if conteudo_res.data:
            parsed_data = conteudo_res.data[0].get('chat_parseado')
    
    if not parsed_data:
        raise HTTPException(status_code=404, detail="Dados do chat não encontrados. Processe o ZIP primeiro.")
    
    if ata_id in local_results:
        local_results[ata_id]['status'] = 'generating_formal'
        local_results[ata_id]['status_message'] = 'Gerando versão cartorária...'
    elif supabase:
        supabase.table('atas').update({
            'status': 'generating_formal',
            'status_message': 'Gerando versão cartorária...'
        }).eq('id', ata_id).execute()
    
    try:
        start_ai = time.time()
        cached_images = local_results.get(ata_id, {}).get('image_bytes', {}) if ata_id in local_results else {}
        formal_data = await organize_chat_with_ai(parsed_data, is_formal=True, image_bytes=cached_images)
        logger.info(f"[{ata_id}] IA Formal concluída em {time.time() - start_ai:.2f}s")
        
        formal_content = formal_data.get('conteudo', '')
        
        if ata_id in local_results:
            local_results[ata_id]['conteudo_formal'] = formal_content
            local_results[ata_id]['status'] = 'ready'
            local_results[ata_id]['status_message'] = 'Versão cartorária gerada com sucesso!'
        elif supabase:
            supabase.table('atas_conteudo').update({
                'conteudo_formal': formal_content
            }).eq('ata_id', ata_id).execute()
            supabase.table('atas').update({
                'status': 'ready',
                'status_message': 'Versão cartorária gerada com sucesso!'
            }).eq('id', ata_id).execute()
        
        return {"status": "success", "conteudo_formal": formal_content}
        
    except Exception as e:
        logger.error(f"[{ata_id}] Erro ao gerar formal: {e}", exc_info=True)
        if ata_id in local_results:
            local_results[ata_id]['status'] = 'ready'
        elif supabase:
            supabase.table('atas').update({'status': 'ready'}).eq('id', ata_id).execute()
        raise HTTPException(status_code=500, detail=f"Erro ao gerar versão formal: {str(e)}")

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

    pdf_bytes = await generate_pdf_from_html(req_data.conteudo, reviewer_name=reviewer, zip_hash=zip_hash)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Erro ao gerar PDF")

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

    # Cleanup expired PDFs before adding new one
    _cleanup_pdf_cache()

    pdf_id = str(uuid.uuid4())
    pdf_cache[pdf_id] = (pdf_bytes, time.time(), auth_ctx.advogado_id)
    
    api_url = str(request.base_url).rstrip('/')
    return {
        "pdf_url": f"{api_url}/api/atas/download/{pdf_id}",
        "actual_pages": actual_pages,
        "estimated_pages": estimated_pages,
        "credits_used": actual_pages or estimated_pages,
        "refunded_credits": refunded_credits,
        "balance_after": balance_after,
    }


def _cleanup_pdf_cache():
    """Remove PDFs that have exceeded their TTL."""
    now = time.time()
    expired = [pid for pid, (_, ts, _) in pdf_cache.items() if now - ts > PDF_CACHE_TTL]
    for pid in expired:
        del pdf_cache[pid]
    if expired:
        logger.info(f"Cleaned up {len(expired)} expired PDFs from cache")


@router.get("/download/{pdf_id}")
async def download_pdf(pdf_id: str, auth_ctx: AuthContext = Depends(get_auth_context)):
    entry = pdf_cache.get(pdf_id)
    if not entry:
        raise HTTPException(status_code=404, detail="PDF não encontrado ou expirou")
    
    pdf_bytes, created_at, owner_id = entry
    
    # Check TTL
    if time.time() - created_at > PDF_CACHE_TTL:
        del pdf_cache[pdf_id]
        raise HTTPException(status_code=410, detail="PDF expirado. Gere novamente.")
    
    # Verify ownership (bypass user can access any)
    if owner_id != auth_ctx.advogado_id and not (_ALLOW_BYPASS and auth_ctx.advogado_id == "bypass-admin-id"):
        raise HTTPException(status_code=403, detail="Acesso não autorizado a este PDF")
    
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
