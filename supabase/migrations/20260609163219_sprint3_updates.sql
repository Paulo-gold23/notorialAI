-- Migration: Sprint 3 updates / schema alignment
-- Created: 2026-06-09
-- Focus: Ensure terms acceptance columns, soft-delete column, CPF unique index, updated RLS policy for atas, and recover_stuck_atas function are in place.

-- 1. Ensure terms acceptance columns exist in public.advogados
ALTER TABLE public.advogados 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(10) DEFAULT NULL;

-- 2. Ensure soft delete column exists in public.atas
ALTER TABLE public.atas 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Ensure index for unique non-empty CPF exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_advogados_cpf_unique 
ON public.advogados (cpf_cnpj) 
WHERE (cpf_cnpj IS NOT NULL AND cpf_cnpj::text <> ''::text);

-- 4. Recreate RLS policy for public.atas to respect soft delete (deleted_at IS NULL)
-- We split the policies to support soft-deleting (updating deleted_at to non-null)
DROP POLICY IF EXISTS advogados_own_atas ON public.atas;
DROP POLICY IF EXISTS atas_select ON public.atas;
DROP POLICY IF EXISTS atas_insert ON public.atas;
DROP POLICY IF EXISTS atas_update ON public.atas;
DROP POLICY IF EXISTS atas_delete ON public.atas;

CREATE POLICY atas_select ON public.atas FOR SELECT USING (advogado_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY atas_insert ON public.atas FOR INSERT WITH CHECK (advogado_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY atas_update ON public.atas FOR UPDATE USING (advogado_id = auth.uid() AND deleted_at IS NULL) WITH CHECK (advogado_id = auth.uid());
CREATE POLICY atas_delete ON public.atas FOR DELETE USING (advogado_id = auth.uid() AND deleted_at IS NULL);

-- 5. Create or replace the recover_stuck_atas function to repair processing-stuck atas
CREATE OR REPLACE FUNCTION public.recover_stuck_atas() 
RETURNS void AS $$
BEGIN
  UPDATE public.atas
  SET status = 'error',
      error_message = 'Processamento expirou por inatividade. Por favor, envie o arquivo novamente.',
      updated_at = now()
  WHERE status IN ('uploading', 'parsing', 'transcribing', 'organizing')
    AND updated_at < now() - interval '30 minutes'
    AND (deleted_at IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
