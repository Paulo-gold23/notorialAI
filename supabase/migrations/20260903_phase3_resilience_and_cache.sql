-- ============================================================
-- Migration: 20260903_phase3_resilience_and_cache
-- Descrição: Cache de transcrições de áudio e checkpoint de chunks
--
-- OBJETIVO: Evitar retrabalho e custo duplicado em reprocessamentos:
--   - audio_transcription_cache: Armazena transcrições por hash SHA-256
--   - ata_chunks_cache: Armazena chunks organizados pela OpenAI
--
-- SEGURO PARA PRODUÇÃO:
--   - Tabelas novas (não altera tabelas existentes)
--   - IF NOT EXISTS em todos os comandos
--
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- PARTE 1: TABELA audio_transcription_cache
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audio_transcription_cache (
    -- Hash SHA-256 do conteúdo binário do áudio (64 chars hex)
    audio_hash          VARCHAR(64) PRIMARY KEY,
    
    -- Resultado da transcrição
    transcription_text  TEXT NOT NULL,
    
    -- Metadados para auditoria
    audio_size_bytes    INTEGER,
    audio_duration_sec  REAL,                       -- estimativa (bytes/2000)
    filename_sample     VARCHAR(255),               -- exemplo de nome do arquivo original
    
    -- Contagem de reutilizações (quantas vezes o cache foi usado)
    hit_count           INTEGER NOT NULL DEFAULT 0,
    last_hit_at         TIMESTAMPTZ,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para limpeza periódica de cache antigo (futuro)
CREATE INDEX IF NOT EXISTS idx_audio_cache_created
    ON public.audio_transcription_cache(created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- PARTE 2: TABELA ata_chunks_cache
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ata_chunks_cache (
    -- Chave composta: qual ata + qual chunk
    ata_id              UUID NOT NULL REFERENCES public.atas(id) ON DELETE CASCADE,
    chunk_index         SMALLINT NOT NULL,
    
    -- Contexto do processamento
    total_chunks        SMALLINT NOT NULL,
    
    -- Resultado do chunk processado pela OpenAI
    content             TEXT NOT NULL,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (ata_id, chunk_index)
);

-- Índice para busca rápida por ata_id (já coberto pela PK, mas explícito para clareza)
-- A PK composta (ata_id, chunk_index) já serve como índice para buscas por ata_id.


-- ═══════════════════════════════════════════════════════════════
-- PARTE 3: ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

-- audio_transcription_cache: apenas service_role (backend) pode ler/gravar
ALTER TABLE public.audio_transcription_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY audio_cache_service
    ON public.audio_transcription_cache
    FOR ALL
    USING (auth.role() = 'service_role');

-- ata_chunks_cache: apenas service_role (backend) pode ler/gravar
ALTER TABLE public.ata_chunks_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY chunks_cache_service
    ON public.ata_chunks_cache
    FOR ALL
    USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════
-- PARTE 4: COMENTÁRIOS DE DOCUMENTAÇÃO
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE public.audio_transcription_cache IS
    'Cache de transcrições de áudio (Groq Whisper). Chave = SHA-256 do arquivo de áudio. '
    'Evita cobranças duplicadas quando o mesmo áudio é reprocessado. '
    'Não armazena o áudio em si, apenas o hash e o texto transcrito.';

COMMENT ON TABLE public.ata_chunks_cache IS
    'Checkpoint de chunks processados pela OpenAI durante a organização de documentos. '
    'Permite retomar processamentos interrompidos sem reenviar chunks já concluídos. '
    'Registros são deletados automaticamente em cascata quando a ata é removida.';

COMMENT ON COLUMN public.audio_transcription_cache.audio_hash IS
    'SHA-256 hex digest (64 chars) do conteúdo binário do arquivo de áudio. '
    'Dois arquivos com bytes idênticos produzem o mesmo hash.';

COMMENT ON COLUMN public.audio_transcription_cache.hit_count IS
    'Contador de vezes que o cache foi reutilizado, incrementado a cada hit. '
    'Útil para análise de eficiência do cache.';
