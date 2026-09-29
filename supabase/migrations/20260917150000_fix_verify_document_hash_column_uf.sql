-- ============================================================
-- Migration: Fix column adv.uf does not exist in verify_document_hash
-- ============================================================
-- CONTEXT: The original RPC created in Sprint 5 referenced `adv.uf`,
-- but the `public.advogados` table does not possess a `uf` column.
-- This caused the RPC to fail with HTTP 400 'column adv.uf does not exist'.
--
-- FIX:
-- 1. Remove `adv.uf` reference from SELECT and record output.
-- 2. Use `adv.oab` and `adv.nome` fallback for `advogado_identificador`.
-- 3. Use `LEFT JOIN` on `public.advogados` for safety.
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_document_hash(p_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_hash TEXT;
  v_result RECORD;
BEGIN
  -- Clean and sanitize input hash
  v_clean_hash := LOWER(TRIM(COALESCE(p_hash, '')));

  IF LENGTH(v_clean_hash) < 32 THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'Hash inválido ou formato incorreto.'
    );
  END IF;

  -- Search in atas table
  SELECT 
    at.id,
    at.titulo,
    at.pdf_hash,
    at.zip_hash,
    COALESCE(at.pdf_gerado_em, at.created_at) AS issued_at,
    at.actual_pages,
    at.status,
    at.deleted_at,
    adv.oab,
    adv.nome
  INTO v_result
  FROM public.atas at
  LEFT JOIN public.advogados adv ON at.advogado_id = adv.id
  WHERE (LOWER(at.pdf_hash) = v_clean_hash OR LOWER(at.zip_hash) = v_clean_hash)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'searched_hash', v_clean_hash
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'document_id', v_result.id,
    'document_title', COALESCE(v_result.titulo, 'Relatório Técnico'),
    'hash_type', CASE WHEN LOWER(v_result.pdf_hash) = v_clean_hash THEN 'PDF do Relatório Técnico' ELSE 'Arquivo ZIP de Origem' END,
    'matched_hash', v_clean_hash,
    'pdf_hash', v_result.pdf_hash,
    'zip_hash', v_result.zip_hash,
    'issued_at', v_result.issued_at,
    'pages_count', v_result.actual_pages,
    'advogado_oab', v_result.oab,
    'advogado_identificador', CASE 
      WHEN v_result.oab IS NOT NULL AND TRIM(v_result.oab) <> '' THEN 'OAB ' || v_result.oab
      WHEN v_result.nome IS NOT NULL AND TRIM(v_result.nome) <> '' THEN v_result.nome
      ELSE 'Advogado Cadastrado'
    END,
    'is_deleted', (v_result.deleted_at IS NOT NULL),
    'is_immutable', true,
    'algorithm', 'SHA-256'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_document_hash(TEXT) TO anon, authenticated;
