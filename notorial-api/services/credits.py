import math
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from database import supabase, supabase_admin

# Use admin client for all data queries (bypasses RLS)
# supabase (anon) is imported for compatibility but not used here
_db = supabase_admin or supabase  # fallback to anon if service key not set


class CreditsService:

    WELCOME_CREDITS = 50  # Créditos de boas-vindas para novos usuários

    def get_balance(self, advogado_id: str) -> int:
        if not _db: return 0
        resp = _db.table("credit_balances").select("balance").eq("advogado_id", advogado_id).execute()
        if resp.data:
            return resp.data[0].get("balance", 0)
        return 0

    def estimate_pages(self, parsed_data: dict, audio_file_sizes: dict) -> int:
        """
        Estimativa de páginas do documento gerado baseada na física real do PDF.
        
        Calibração v5 (Abril/2026 - precisão máxima):
        ──────────────────────────────────────────────────
        Física do PDF (Gotenberg/Chromium):
        - Times New Roman 12pt + line-height: 1.35 → ~45 linhas úteis/página A4
        - Margens: 20mm top, 18mm sides, 28mm bottom (@page) + footer 16mm
        - ~80 chars/linha efetiva (85 brutos -5 por bold/aspas da IA)
        
        A IA expande o texto de 3 formas que a v4 não contava:
        1. FORMATAÇÃO: Cada mensagem ganha **"aspas"** + negrito → +15% de chars
        2. ESPAÇAMENTO: nl2br do markdown + quebras entre mensagens → +1 linha/msg
        3. ESTRUTURA: Título H1, Participantes, Índice, H3/dia → linhas fixas extras
        
        Erros conhecidos da v4 e correções:
        - v4 estimou 10 → real 12 (diff +2): AI_OVERHEAD=1 era insuficiente,
          não contava expansão de formatação nem espaçamento inter-mensagem.
        
        Reembolso automático via pypdf corrige diferenças residuais de ±1 página.
        """
        CHARS_PER_LINE = 80          # Efetivo após bold+aspas (era 85 na v4)
        LINES_PER_PAGE = 45          # Times 12pt, line-height 1.35, margens reais
        OVERHEAD_CHARS = 38          # "[DD/MM/AAAA HH:MM] Nome Sobrenome: " + aspas
        BOLD_EXPANSION = 1.12        # **"conteúdo"** expande ~12% o espaço horizontal
        
        AUDIO_BYTES_PER_SEC = 2000   # Opus WhatsApp ~1-2.5 KB/s
        CHARS_PER_SEC_AUDIO = 13     # Taxa de fala média pt-BR
        
        IMAGE_FACTOR = 0.42          # max-height:400px + margin:20px + border + shadow
        INTER_MSG_LINES = 0.3        # Espaçamento entre mensagens (IA + formatação HTML)
        
        # ── Contagem de dias únicos (cada H3 "### DD/MM/AAAA" gera ~3 linhas com margins) ──
        unique_days = set()
        for msg in parsed_data.get("mensagens", []):
            if msg.get("tipo") != "figurinha":
                day = msg.get("data", "")
                if day:
                    unique_days.add(day)
        
        # ── Overhead estrutural (linhas fixas geradas pela IA) ──
        num_participants = len(parsed_data.get("participantes", []))
        structure_lines = (
            3                                  # Título H1 + linha em branco
            + 2                                # "## Participantes" + linha em branco
            + max(num_participants, 1)          # Uma linha por participante
            + 2                                # "## Índice" + linha em branco
            + len(unique_days)                 # Um link por dia no índice
            + 2                                # "## Conteúdo Organizado" + linha em branco
            + len(unique_days) * 3             # H3 por dia (heading + margin-top + margin-bottom)
        )
        
        # ── Contagem de linhas de conteúdo ──
        content_lines = 0.0
        msg_count = 0
        
        for msg in parsed_data.get("mensagens", []):
            tipo = msg.get("tipo", "texto")
            conteudo = msg.get("conteudo") or ""
            
            if tipo == "figurinha":
                continue  # Figurinhas não aparecem no documento final
            
            msg_count += 1
            
            if tipo == "texto":
                # Expansão de bold: a IA coloca **"conteúdo"**, que ocupa mais espaço
                chars = OVERHEAD_CHARS + int(len(conteudo) * BOLD_EXPANSION)
                content_lines += math.ceil(chars / CHARS_PER_LINE)
                
            elif tipo == "audio":
                filename = msg.get("arquivo", "")
                file_size = audio_file_sizes.get(filename, 0)
                
                sec = (file_size / AUDIO_BYTES_PER_SEC) if file_size > 0 else 20
                # Áudio tem prefixo 🎙️ [ÁUDIO TRANSCRITO]: + bold + aspas
                audio_prefix_chars = 25  # "🎙️ [ÁUDIO TRANSCRITO]: "
                chars = OVERHEAD_CHARS + audio_prefix_chars + int(sec * CHARS_PER_SEC_AUDIO * BOLD_EXPANSION)
                content_lines += math.ceil(chars / CHARS_PER_LINE)
            else:
                # imagem, video, midia_omitida, arquivo — referência compacta
                chars = OVERHEAD_CHARS + 30  # "[IMAGEM ANEXADA: filename.jpg]" ~30 chars
                content_lines += math.ceil(chars / CHARS_PER_LINE)
        
        # ── Espaçamento inter-mensagem (a IA e nl2br adicionam espaço entre mensagens) ──
        spacing_lines = msg_count * INTER_MSG_LINES
        
        # ── Total de linhas → páginas de texto ──
        total_lines = structure_lines + content_lines + spacing_lines
        text_pages = total_lines / LINES_PER_PAGE
        
        # ── Páginas de imagem ──
        image_count = sum(1 for m in parsed_data.get("mensagens", []) if m.get("tipo") == "imagem")
        image_pages = image_count * IMAGE_FACTOR
        
        # ── Total final ──
        raw_total = text_pages + image_pages
        
        # Arredonda para CIMA para nunca subestimar (refund automático devolve a diferença)
        estimated = math.ceil(raw_total)
        
        import logging
        logging.getLogger(__name__).info(
            f"[ESTIMATE-v5] content_lines={content_lines:.0f} | struct_lines={structure_lines} | "
            f"spacing_lines={spacing_lines:.0f} | total_lines={total_lines:.0f} → "
            f"{text_pages:.1f} pgs texto | {image_count} imgs → {image_pages:.1f} pgs | "
            f"days={len(unique_days)} | participants={num_participants} | "
            f"Raw: {raw_total:.2f} | Final (ceil): {estimated}"
        )
        
        return max(1, estimated)

    def has_sufficient_credits(self, advogado_id: str, pages: int) -> bool:
        return self.get_balance(advogado_id) >= pages

    def debit_credits(self, advogado_id: str, ata_id: str, pages: int) -> bool:
        if not _db: return False
        try:
            result = _db.rpc("debit_credits", {
                "p_advogado_id": advogado_id,
                "p_ata_id": ata_id,
                "p_pages": pages
            }).execute()
            if result.data and len(result.data) > 0:
                return result.data[0].get("success", False)
            return False
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Erro ao debitar créditos via RPC: {e}")
            return False

    def refund_credits(self, advogado_id: str, ata_id: str, estimated: int, actual: int) -> bool:
        if not _db: return False
        if actual >= estimated:
            return False
        try:
            result = _db.rpc("refund_credits", {
                "p_advogado_id": advogado_id,
                "p_ata_id": ata_id,
                "p_estimated": estimated,
                "p_actual": actual
            }).execute()
            if result.data and len(result.data) > 0:
                return result.data[0].get("success", False)
            return False
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Erro ao reembolsar créditos via RPC: {e}")
            return False

    def add_credits(self, advogado_id: str, package_id: str, payment_id: str, amount: int) -> bool:
        if not _db: return False
        try:
            result = _db.rpc("add_credits", {
                "p_advogado_id": advogado_id,
                "p_package_id": package_id,
                "p_payment_id": payment_id,
                "p_amount": amount
            }).execute()
            if result.data and len(result.data) > 0:
                return result.data[0].get("success", False)
            return False
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Erro ao adicionar créditos via RPC: {e}")
            return False

    def check_trial_eligible(self, advogado_id: str) -> bool:
        """Verifica se o advogado ainda não recebeu créditos de boas-vindas."""
        if not _db: return False
        resp = _db.table("credit_transactions").select("id").eq(
            "advogado_id", advogado_id
        ).eq("type", "trial").execute()
        return len(resp.data or []) == 0

    def grant_welcome_credits(self, advogado_id: str) -> bool:
        """Concede 50 créditos de boas-vindas para novo usuário (uma única vez) via RPC atômica."""
        if not _db: return False
        try:
            result = _db.rpc("grant_welcome_credits", {
                "p_advogado_id": advogado_id
            }).execute()
            if result.data and len(result.data) > 0:
                return result.data[0].get("success", False)
            return False
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Erro ao conceder créditos de boas-vindas via RPC: {e}")
            return False

    def get_packages(self) -> List[Dict[str, Any]]:
        if not _db: return []
        resp = _db.table("credit_packages").select("*").eq("is_active", True).order("sort_order").execute()
        return resp.data or []

credits_service = CreditsService()
