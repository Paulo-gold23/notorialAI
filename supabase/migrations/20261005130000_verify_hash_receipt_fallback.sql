-- verify_document_hash: keep the existing lookup in `atas` as the FIRST attempt
-- (output unchanged), then fall back to the metadata-only receipts so a hash stays
-- verifiable after the 24h atas wipe. Receipts exist only from their deploy onward.
-- Rollback: re-run supabase/migrations/20260917150000_fix_verify_document_hash_column_uf.sql
--           (previous definition of this function).

CREATE OR REPLACE FUNCTION public.verify_document_hash(p_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  v_clean_hash TEXT;
  v_result RECORD;
  v_receipt RECORD;
BEGIN
  v_clean_hash := LOWER(TRIM(COALESCE(p_hash, '')));

  IF LENGTH(v_clean_hash) < 32 THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'Hash inválido ou formato incorreto.'
    );
  END IF;

  -- 1) Existing behaviour: search in atas
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

  IF FOUND THEN
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
      'algorithm', 'SHA-256',
      'record_source', 'ata'
    );
  END IF;

  -- 2) Fallback: PDF issuance receipt
  SELECT r.ata_ref, r.protocol, r.issued_at, r.emission_number, r.pdf_hash
  INTO v_receipt
  FROM public.pdf_issuance_receipts r
  WHERE LOWER(r.pdf_hash) = v_clean_hash
  ORDER BY r.issued_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true,
      'document_id', v_receipt.ata_ref,
      'document_title', 'Relatório Técnico ' || v_receipt.protocol,
      'hash_type', 'PDF do Relatório Técnico (recibo de emissão n.º ' || COALESCE(v_receipt.emission_number::text, '?') || ')',
      'matched_hash', v_clean_hash,
      'pdf_hash', v_receipt.pdf_hash,
      'issued_at', v_receipt.issued_at,
      'advogado_identificador', 'Não informado (recibo sem identificação da conta)',
      'is_deleted', false,
      'is_immutable', true,
      'algorithm', 'SHA-256',
      'record_source', 'receipt'
    );
  END IF;

  -- 3) Fallback: processing receipt (original ZIP hash)
  SELECT p.ata_ref, p.protocol, p.received_at, p.zip_hash
  INTO v_receipt
  FROM public.processing_receipts p
  WHERE LOWER(p.zip_hash) = v_clean_hash
  ORDER BY p.received_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true,
      'document_id', v_receipt.ata_ref,
      'document_title', 'Relatório Técnico ' || v_receipt.protocol,
      'hash_type', 'Arquivo ZIP de Origem (recibo de processamento)',
      'matched_hash', v_clean_hash,
      'zip_hash', v_receipt.zip_hash,
      'issued_at', v_receipt.received_at,
      'advogado_identificador', 'Não informado (recibo sem identificação da conta)',
      'is_deleted', false,
      'is_immutable', true,
      'algorithm', 'SHA-256',
      'record_source', 'receipt'
    );
  END IF;

  RETURN jsonb_build_object(
    'found', false,
    'searched_hash', v_clean_hash
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_document_hash(TEXT) TO anon, authenticated;
