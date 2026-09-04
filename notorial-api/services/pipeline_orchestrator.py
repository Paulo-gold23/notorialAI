import os
import gc
import time
import asyncio
import logging
from config import settings
from database import get_supabase_client, _db_executor
from services.whatsapp_parser import parse_whatsapp_zip
from services.transcription import transcribe_all
from services.ai_organizer import organize_chat_with_ai

logger = logging.getLogger(__name__)

# In-memory cache for locally-processed results (when no Supabase)
local_results = {}

def _update_status(ata_id: str, is_local: bool, supabase, status_name: str, progress: int = 0, message: str = ""):
    """Persiste status no Supabase. Fire-and-forget via thread pool (NÃO bloqueia o event loop)."""
    formatted_message = f"{progress}%: {message}" if progress > 0 else message
    
    # Em modo com Supabase, submete a atualização ao thread pool — retorno imediato.
    if not is_local and supabase:
        def _sync():
            try:
                supabase.table('atas').update({
                    'status': status_name,
                    'status_message': formatted_message
                }).eq('id', ata_id).execute()
            except Exception as e:
                logger.warning(f"Erro ao atualizar status no Supabase: {e}")
        _db_executor.submit(_sync)
        return

    # Modo local (sem Supabase): usa local_results como fallback.
    if ata_id not in local_results:
        local_results[ata_id] = {}
    local_results[ata_id].update({
        'status': status_name,
        'progress': progress,
        'status_message': message
    })

async def _inner_process_pipeline(ata_id: str, is_local: bool, start_date: str = None, end_date: str = None, token: str = None, advogado_id: str = None, zip_bytes: bytes = None, temp_path: str = None):
    # IMPORTANT: Use the global Supabase client (anon key) for the pipeline.
    # Do NOT use the user's JWT token here — it expires during long processing
    # (transcription + AI can take 5-15 mins) causing "JWT expired" errors.
    # RLS policies already allow anon access via "Service can manage" policies.
    supabase = get_supabase_client()

    def update(status_name, message="", progress=0):
        _update_status(ata_id, is_local, supabase, status_name, progress=progress, message=message)

    try:
        t_total = time.time()

        # ── ETAPA 1: Parse do ZIP (síncrono, roda em thread para não bloquear) ──
        t0 = time.time()
        update('parsing', "Extraindo e validando mensagens...", progress=10)
        logger.info(f"[{ata_id}] Parsing ZIP com filtro: {start_date} → {end_date}")

        loop = asyncio.get_running_loop()
        file_source = temp_path if temp_path else zip_bytes
        parsed_data = await loop.run_in_executor(
            None,
            lambda: parse_whatsapp_zip(file_source, start_date=start_date, end_date=end_date)
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

        # ── Liberar memória: dicts brutos de mídia não são mais necessários ──
        del all_audio_bytes
        del audio_by_basename_bytes
        del needed_audio_files
        del needed_basenames
        gc.collect()
        logger.info(f"[{ata_id}] Memória liberada: dicts de áudio bruto descartados")

        # ── ETAPA 3: Transcrição paralela (Groq Whisper) ──
        t1 = time.time()
        update('transcribing', f"Transcrevendo {len(audios_to_transcribe)} áudios...", progress=35)

        async def trans_progress(msg, prog):
            update("transcribing", msg, progress=max(35, min(65, prog)))

        transcriptions = await transcribe_all(audios_to_transcribe, on_progress=trans_progress, ata_id=ata_id, advogado_id=advogado_id)
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
                parsed_data, on_progress=org_progress, image_bytes=all_image_bytes,
                ata_id=ata_id, advogado_id=advogado_id,
            )
            logger.info(f"[{ata_id}] IA Preparatória concluída em {time.time()-t2:.2f}s")
        except Exception as e:
            logger.error(f"[{ata_id}] Erro na IA Preparatória: {e}")
            raise e

        # ── ETAPA 6: Salvar resultado ──
        elapsed = time.time() - t_total
        done_msg = f"Processamento concluído em {elapsed:.0f}s!"
        logger.info(f"[{ata_id}] ✅ {done_msg}")

        if supabase and not is_local:
            # Proteção contra payload excessivo no PostgREST:
            # O documento completo final com 100% de fidelidade e qualidade (HTML, fotos, áudios e formatação)
            # é preservado integralmente em 'conteudo_preparatorio'.
            # Para conversas gigantes (> 3000 mensagens), otimizamos o 'chat_parseado' (que armazena
            # o JSON bruto) para salvar metadados estruturados + amostra, evitando
            # que um payload de 40MB cause timeout na requisição HTTP do Supabase.
            db_chat_parseado = parsed_data
            if parsed_data and len(parsed_data.get("mensagens", [])) > 3000:
                raw_msgs = parsed_data.get("mensagens", [])
                db_chat_parseado = {
                    "participantes": parsed_data.get("participantes", []),
                    "phone_map": parsed_data.get("phone_map", {}),
                    "periodo": parsed_data.get("periodo", {}),
                    "total_mensagens": parsed_data.get("total_mensagens", len(raw_msgs)),
                    "total_audios": parsed_data.get("total_audios", 0),
                    "total_imagens": parsed_data.get("total_imagens", 0),
                    "sample_mensagens": raw_msgs[:50],
                    "nota": "Mensagens compiladas fielmente no documento preparatorio"
                }

            # ── CRITICAL: run_in_executor para NÃO bloquear o event loop ──
            # As chamadas supabase-py são SÍNCRONAS (httpx.Client blocking).
            # Se executadas diretamente em uma corrotina, o event loop fica travado
            # e o FastAPI não consegue responder a polling requests, causando
            # erro Cloudflare 524 (origin timeout > 100s).
            loop = asyncio.get_running_loop()

            def _sync_save_content():
                """Salva conteúdo em thread separada para não bloquear o event loop."""
                try:
                    supabase.table('atas_conteudo').insert({
                        'ata_id': ata_id,
                        'chat_parseado': db_chat_parseado,
                        'conteudo_formal': None,
                        'conteudo_preparatorio': preparatorio_data.get('conteudo'),
                        'advogado_id': advogado_id
                    }).execute()
                except Exception as db_err:
                    logger.warning(f"[{ata_id}] Aviso: Falha ao inserir atas_conteudo com advogado_id: {db_err}. Tentando fallback...")
                    try:
                        supabase.table('atas_conteudo').insert({
                            'ata_id': ata_id,
                            'chat_parseado': db_chat_parseado,
                            'conteudo_formal': None,
                            'conteudo_preparatorio': preparatorio_data.get('conteudo')
                        }).execute()
                    except Exception as fatal_db_err:
                        logger.error(f"[{ata_id}] Erro crítico ao inserir atas_conteudo: {fatal_db_err}")
                        raise fatal_db_err

            update('organizing', "Salvando documento no banco de dados...", progress=96)
            await loop.run_in_executor(None, _sync_save_content)
            logger.info(f"[{ata_id}] atas_conteudo salvo com sucesso")

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
            
            def _sync_update_status():
                """Atualiza status para ready em thread separada."""
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

            await loop.run_in_executor(None, _sync_update_status)
            logger.info(f"[{ata_id}] Status atualizado para 'ready'")

            # Mantém image_bytes no cache local para generate-formal (mesmo worker, curta duração).
            # Status e conteúdo são a fonte de verdade no banco.
            local_results[ata_id] = {
                'image_bytes': all_image_bytes,
                'status': 'ready',
                'is_local': False
            }
        else:
            # Modo local (sem Supabase): local_results é a única fonte de verdade.
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

        # Persiste erro no banco e faz estorno — tudo via thread pool (fire-and-forget).
        if supabase:
            def _sync_error_and_refund():
                try:
                    supabase.table('atas').update({
                        'status': 'error',
                        'status_message': err_msg,
                        'error_message': err_msg
                    }).eq('id', ata_id).execute()
                except Exception:
                    pass

                # ── Estorno automático de créditos em falha ──
                if not is_local and advogado_id:
                    try:
                        debit_resp = supabase.table('credit_transactions') \
                            .select('amount') \
                            .eq('ata_id', ata_id) \
                            .eq('type', 'debit') \
                            .execute()
                        if debit_resp.data and len(debit_resp.data) > 0:
                            charged = debit_resp.data[0].get('amount', 0)
                            refund_resp = supabase.table('credit_transactions') \
                                .select('id') \
                                .eq('ata_id', ata_id) \
                                .eq('type', 'refund') \
                                .execute()
                            if not refund_resp.data or len(refund_resp.data) == 0:
                                from services.credits import credits_service
                                refund_ok = credits_service.refund_credits(
                                    advogado_id, ata_id,
                                    estimated=charged, actual=0
                                )
                                if refund_ok:
                                    logger.info(
                                        f"[{ata_id}] AUTO-REFUND: {charged} créditos devolvidos "
                                        f"ao advogado {advogado_id} após falha no pipeline ({err_category})"
                                    )
                                else:
                                    logger.warning(f"[{ata_id}] AUTO-REFUND: refund_credits retornou False")
                            else:
                                logger.info(f"[{ata_id}] AUTO-REFUND: refund já existe, ignorando duplicata")
                    except Exception as refund_err:
                        logger.error(f"[{ata_id}] AUTO-REFUND falhou (não-bloqueante): {refund_err}")
            _db_executor.submit(_sync_error_and_refund)

        # Fallback local (modo sem Supabase).
        if is_local:
            if ata_id not in local_results:
                local_results[ata_id] = {}
            local_results[ata_id].update({
                'status': 'error', 'progress': 0,
                'status_message': err_msg, 'error_message': err_msg,
                'error_category': err_category
            })

    finally:
        # Cleanup temp file if passed
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.error(f"Erro ao remover arquivo temporario do pipeline: {e}")

_MAX_CONCURRENT_PIPELINES = int(os.getenv("MAX_CONCURRENT_PIPELINES", "5"))
_pipeline_semaphore: asyncio.Semaphore | None = None

def _get_pipeline_semaphore() -> asyncio.Semaphore:
    global _pipeline_semaphore
    if _pipeline_semaphore is None:
        _pipeline_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_PIPELINES)
    return _pipeline_semaphore

async def _process_pipeline(ata_id: str, is_local: bool, start_date: str = None, end_date: str = None, token: str = None, advogado_id: str = None, zip_bytes: bytes = None, temp_path: str = None, estimated_pages: int = None):
    sem = _get_pipeline_semaphore()
    if sem.locked():
        logger.info(f"[{ata_id}] Pipeline aguardando na fila (concorrência máxima: {_MAX_CONCURRENT_PIPELINES})")
        supabase = get_supabase_client()
        _update_status(ata_id, is_local, supabase, "uploading", progress=0, message="Aguardando liberação na fila de processamento...")

    # Timeout dinâmico: base de 20 minutos (1200s). Para conversas gigantes (> 100 páginas),
    # escala proporcionalmente até 50 minutos (3000s) para garantir conclusão sem cortes.
    pages = estimated_pages or 0
    if pages > 100:
        pipeline_timeout = min(3000.0, 1200.0 + (pages - 100) * 8.0)
    else:
        pipeline_timeout = 1200.0

    timeout_minutes = int(pipeline_timeout // 60)
    logger.info(f"[{ata_id}] Pipeline timeout configurado: {pipeline_timeout:.0f}s ({timeout_minutes} min) para {pages} páginas")

    async with sem:
        try:
            await asyncio.wait_for(
                _inner_process_pipeline(ata_id, is_local, start_date, end_date, token, advogado_id, zip_bytes, temp_path),
                timeout=pipeline_timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"[{ata_id}] Pipeline excedeu o tempo limite de {timeout_minutes} minutos.")
            supabase = get_supabase_client()
            err_msg = f'O processamento demorou mais do que o esperado (limite de {timeout_minutes} minutos) e foi cancelado. Tente arquivos menores.'
            if supabase and not is_local:
                def _sync_timeout_error():
                    try:
                        supabase.table('atas').update({
                            'status': 'error',
                            'status_message': err_msg,
                            'error_message': err_msg
                        }).eq('id', ata_id).execute()
                    except Exception:
                        pass

                    # ── Estorno automático de créditos em timeout ──
                    if advogado_id:
                        try:
                            debit_resp = supabase.table('credit_transactions') \
                                .select('amount') \
                                .eq('ata_id', ata_id) \
                                .eq('type', 'debit') \
                                .execute()
                            if debit_resp.data and len(debit_resp.data) > 0:
                                charged = debit_resp.data[0].get('amount', 0)
                                refund_resp = supabase.table('credit_transactions') \
                                    .select('id') \
                                    .eq('ata_id', ata_id) \
                                    .eq('type', 'refund') \
                                    .execute()
                                if not refund_resp.data or len(refund_resp.data) == 0:
                                    from services.credits import credits_service
                                    refund_ok = credits_service.refund_credits(
                                        advogado_id, ata_id,
                                        estimated=charged, actual=0
                                    )
                                    if refund_ok:
                                        logger.info(
                                            f"[{ata_id}] AUTO-REFUND (TIMEOUT): {charged} créditos devolvidos "
                                            f"ao advogado {advogado_id}"
                                        )
                                    else:
                                        logger.warning(f"[{ata_id}] AUTO-REFUND (TIMEOUT): refund_credits retornou False")
                                else:
                                    logger.info(f"[{ata_id}] AUTO-REFUND (TIMEOUT): refund já existe")
                        except Exception as refund_err:
                            logger.error(f"[{ata_id}] AUTO-REFUND (TIMEOUT) falhou: {refund_err}")
                _db_executor.submit(_sync_timeout_error)

            if is_local:
                if ata_id not in local_results:
                    local_results[ata_id] = {}
                local_results[ata_id].update({
                    'status': 'error', 'progress': 0,
                    'status_message': err_msg, 'error_message': err_msg,
                    'error_category': 'API_TIMEOUT'
                })
