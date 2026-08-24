-- Migration: Sprint 5 - Public Hash Verifier & LGPD Data Portability

-- 1. Public RPC to verify document authenticity via SHA-256 hash
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
    adv.uf,
    adv.nome
  INTO v_result
  FROM public.atas at
  JOIN public.advogados adv ON at.advogado_id = adv.id
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
    'advogado_uf', v_result.uf,
    'advogado_identificador', CASE 
      WHEN v_result.oab IS NOT NULL AND v_result.uf IS NOT NULL THEN 'OAB/' || v_result.uf || ' ' || v_result.oab
      ELSE 'Advogado Cadastrado'
    END,
    'is_deleted', (v_result.deleted_at IS NOT NULL),
    'is_immutable', true,
    'algorithm', 'SHA-256'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_document_hash(TEXT) TO anon, authenticated;

-- 2. RPC for User to export all personal data (LGPD Art. 18 Portability)
CREATE OR REPLACE FUNCTION public.export_user_personal_data()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_data JSONB;
  v_consents JSONB;
  v_atas JSONB;
  v_transactions JSONB;
  v_audit JSONB;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado';
  END IF;

  -- 1. Advogado Profile
  SELECT to_jsonb(a) INTO v_user_data
  FROM (
    SELECT id, nome, email, cpf_cnpj, oab, uf, phone, credit_balance, terms_accepted, terms_version, marketing_consent, created_at, updated_at
    FROM public.advogados
    WHERE id = v_user_id
  ) a;

  -- 2. Consents History
  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_consents
  FROM (
    SELECT terms_version, marketing_accepted, ip_address, created_at
    FROM public.consent_records
    WHERE advogado_id = v_user_id
    ORDER BY created_at DESC
  ) c;

  -- 3. Atas Metadata
  SELECT COALESCE(jsonb_agg(to_jsonb(at)), '[]'::jsonb) INTO v_atas
  FROM (
    SELECT id, titulo, total_mensagens, total_audios, status, estimated_pages, actual_pages, credits_charged, zip_hash, pdf_hash, created_at, pdf_gerado_em, deleted_at
    FROM public.atas
    WHERE advogado_id = v_user_id
    ORDER BY created_at DESC
  ) at;

  -- 4. Credit Transactions
  SELECT COALESCE(jsonb_agg(to_jsonb(tx)), '[]'::jsonb) INTO v_transactions
  FROM (
    SELECT id, amount, type, description, balance_after, created_at
    FROM public.credit_transactions
    WHERE advogado_id = v_user_id
    ORDER BY created_at DESC
  ) tx;

  -- 5. Audit Logs
  SELECT COALESCE(jsonb_agg(to_jsonb(al)), '[]'::jsonb) INTO v_audit
  FROM (
    SELECT id, acao, payload, ip_address, created_at
    FROM public.audit_logs
    WHERE advogado_id = v_user_id
    ORDER BY created_at DESC
  ) al;

  -- Compile complete export package
  v_result := jsonb_build_object(
    'plataforma', 'LegisVox v2.3',
    'finalidade', 'Exportação de Dados Pessoais do Titular (LGPD - Lei 13.709/2018, Art. 18)',
    'data_exportacao', NOW(),
    'perfil_advogado', v_user_data,
    'historico_consentimentos', v_consents,
    'relatorios_documentos', v_atas,
    'historico_creditos', v_transactions,
    'logs_auditoria', v_audit
  );

  -- Log the export event
  INSERT INTO public.audit_logs (advogado_id, acao, payload, ip_address)
  VALUES (v_user_id, 'lgpd_data_export_requested', jsonb_build_object('timestamp', NOW()), 'authenticated_session');

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.export_user_personal_data() TO authenticated;
