-- ============================================================
-- Migration: 20260903_ai_usage_tracking
-- Descrição: Instrumentação e auditoria de consumo de APIs de IA
--
-- OBJETIVO: Criar tabela para registrar cada chamada individual
-- a fornecedores externos de IA (OpenAI, Groq), permitindo:
--   - Auditoria de consumo de tokens e custos
--   - Rastreamento de retries e tentativas
--   - Classificação de falhas
--   - Relatórios administrativos futuros
--
-- SEGURO PARA PRODUÇÃO:
--   - Tabela nova (não altera tabelas existentes)
--   - IF NOT EXISTS em todos os comandos
--
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- PARTE 1: TABELA ai_usage_log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vínculo com entidades existentes
    ata_id              UUID REFERENCES public.atas(id) ON DELETE SET NULL,
    advogado_id         UUID REFERENCES public.advogados(id) ON DELETE SET NULL,

    -- Identificação da chamada
    service             VARCHAR(30) NOT NULL,       -- 'openai', 'groq'
    model               VARCHAR(50),                -- 'gpt-4.1-mini', 'whisper-large-v3'
    operation           VARCHAR(50) NOT NULL,       -- 'organize_chunk', 'transcription', 'transform'
    pipeline_stage      VARCHAR(30),                -- 'transcribing', 'organizing', null (for ad-hoc transforms)

    -- Tentativas e retries
    attempt_number      SMALLINT NOT NULL DEFAULT 1,
    is_retry            BOOLEAN NOT NULL DEFAULT false,
    retry_reason        VARCHAR(30),                -- 'timeout', 'rate_limit', 'server_error', 'connection_error'

    -- Metadados do input (sem conteúdo sensível)
    input_size_chars    INTEGER,                    -- tamanho do input em caracteres (OpenAI)
    input_size_bytes    INTEGER,                    -- tamanho do input em bytes (Groq/áudios)
    chunk_index         SMALLINT,                   -- índice do chunk (OpenAI, 0-based)
    total_chunks        SMALLINT,                   -- total de chunks no processamento

    -- Usage retornado pela OpenAI (dados diretos da API)
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    total_tokens        INTEGER,

    -- Usage estimado para Groq (Whisper)
    audio_duration_sec  REAL,                       -- duração estimada do áudio em segundos

    -- Resultado da chamada
    http_status         SMALLINT,                   -- código HTTP da resposta
    status              VARCHAR(20) NOT NULL,       -- 'success', 'error', 'timeout', 'rate_limited', 'skipped'
    error_category      VARCHAR(40),                -- código da taxonomia de falhas
    error_message       VARCHAR(500),               -- mensagem truncada (sem dados sensíveis)

    -- Classificação de custo
    cost_category       VARCHAR(15) NOT NULL DEFAULT 'pending',
                                                    -- 'confirmed', 'estimated', 'none', 'pending'

    -- Timing
    duration_ms         INTEGER,                    -- duração da chamada em milissegundos
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,

    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 2: ÍNDICES
-- ═══════════════════════════════════════════════════════════════

-- Consultas por ata (ex: "quantas chamadas de IA para esta ata?")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_ata
    ON public.ai_usage_log(ata_id);

-- Consultas por advogado (ex: "custo de IA por usuário")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_advogado
    ON public.ai_usage_log(advogado_id);

-- Consultas por período (ex: "custo de IA no mês")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created
    ON public.ai_usage_log(created_at DESC);

-- Consultas por serviço (ex: "custo OpenAI vs Groq")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_service
    ON public.ai_usage_log(service);

-- Consultas por status (ex: "quantas chamadas falharam?")
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_status
    ON public.ai_usage_log(status);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 3: ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- service_role pode ler e inserir (backend usa service_role para registrar)
CREATE POLICY ai_usage_log_service
    ON public.ai_usage_log
    FOR ALL
    USING (auth.role() = 'service_role');

-- Administradores podem ler todos os logs
CREATE POLICY ai_usage_log_admin_read
    ON public.ai_usage_log
    FOR SELECT
    USING (public.is_current_user_admin());

-- Usuários comuns podem ver apenas os próprios logs
CREATE POLICY ai_usage_log_own_read
    ON public.ai_usage_log
    FOR SELECT
    USING (advogado_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- PARTE 4: COMENTÁRIOS DE DOCUMENTAÇÃO
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE public.ai_usage_log IS
    'Trilha de auditoria de consumo de APIs externas de IA (OpenAI, Groq). '
    'Registra cada chamada individual com tokens consumidos, status, retries e classificação de custo. '
    'Não armazena conteúdo sensível das conversas.';

COMMENT ON COLUMN public.ai_usage_log.cost_category IS
    'confirmed = API retornou usage real; estimated = calculado por heurística; '
    'none = falha antes da chamada; pending = incerteza sobre consumo.';

COMMENT ON COLUMN public.ai_usage_log.audio_duration_sec IS
    'Duração estimada do áudio (Groq Whisper). Heurística: bytes / 2000 (Opus ~2KB/s). '
    'Documentada como estimativa, não como valor exato.';

COMMENT ON COLUMN public.ai_usage_log.error_message IS
    'Mensagem de erro truncada em 500 chars. Não deve conter dados pessoais, '
    'conteúdo de conversas ou informações sensíveis.';
