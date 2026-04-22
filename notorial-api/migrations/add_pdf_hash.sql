-- ============================================================
-- Migration: add_pdf_hash
-- Descrição: Adiciona colunas de auditoria de integridade do PDF
--            gerado pela plataforma LegisVox.
--
-- pdf_hash      → SHA-256 do arquivo PDF final (pós-proteção pypdf)
-- pdf_gerado_em → Timestamp exato da geração (para trilha de auditoria)
--
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================

ALTER TABLE atas
    ADD COLUMN IF NOT EXISTS pdf_hash        TEXT        DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS pdf_gerado_em   TIMESTAMPTZ DEFAULT NULL;

-- Índice opcional para busca por hash (verificação de integridade)
CREATE INDEX IF NOT EXISTS idx_atas_pdf_hash ON atas (pdf_hash)
    WHERE pdf_hash IS NOT NULL;

COMMENT ON COLUMN atas.pdf_hash IS
    'SHA-256 do PDF final gerado (após proteção pypdf). '
    'Permite verificação de integridade e trilha de auditoria.';

COMMENT ON COLUMN atas.pdf_gerado_em IS
    'Timestamp UTC da última geração de PDF para esta ata.';
