-- ============================================================
-- Sprint 3: Data Governance & Retention
-- RPCs for automated purge, TTL, and account deletion
-- ============================================================

-- 1. RPC: Purge soft-deleted atas older than 30 days
CREATE OR REPLACE FUNCTION public.purge_deleted_atas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER := 0;
    deleted_ids UUID[];
BEGIN
    SELECT array_agg(id) INTO deleted_ids
    FROM atas
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '30 days';

    IF deleted_ids IS NULL OR array_length(deleted_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('purged', 0, 'timestamp', now());
    END IF;

    DELETE FROM atas_conteudo WHERE ata_id = ANY(deleted_ids);
    DELETE FROM atas_pdfs WHERE ata_id = ANY(deleted_ids);
    DELETE FROM atas WHERE id = ANY(deleted_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO audit_logs (advogado_id, acao, ip_address, user_agent, device_fingerprint, payload)
    VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'system_purge_deleted_atas',
        'system', 'pg_cron', 'server',
        jsonb_build_object('purged_count', deleted_count, 'purged_ids', to_jsonb(deleted_ids), 'purge_threshold', '30 days', 'executed_at', now())
    );

    RETURN jsonb_build_object('purged', deleted_count, 'ids', to_jsonb(deleted_ids), 'timestamp', now());
END;
$$;

-- 2. RPC: Purge old audit_logs (>6 months, Marco Civil Art. 15)
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    DELETE FROM audit_logs
    WHERE created_at < now() - interval '6 months'
      AND acao NOT LIKE '%security_incident%'
      AND acao NOT LIKE '%breach%'
      AND acao NOT LIKE '%unauthorized%';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    INSERT INTO audit_logs (advogado_id, acao, ip_address, user_agent, device_fingerprint, payload)
    VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'system_purge_old_audit_logs',
        'system', 'pg_cron', 'server',
        jsonb_build_object('purged_count', deleted_count, 'retention_period', '6 months', 'executed_at', now())
    );

    RETURN jsonb_build_object('purged', deleted_count, 'timestamp', now());
END;
$$;

-- 3. RPC: Expire credits older than 180 days
CREATE OR REPLACE FUNCTION public.expire_old_credits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired_count INTEGER := 0;
    expired_total INTEGER := 0;
BEGIN
    SELECT COALESCE(SUM(balance), 0) INTO expired_total
    FROM credit_balances
    WHERE expires_at IS NOT NULL AND expires_at < now() AND balance > 0;

    UPDATE credit_balances
    SET balance = 0, updated_at = now()
    WHERE expires_at IS NOT NULL AND expires_at < now() AND balance > 0;
    GET DIAGNOSTICS expired_count = ROW_COUNT;

    IF expired_count > 0 THEN
        INSERT INTO audit_logs (advogado_id, acao, ip_address, user_agent, device_fingerprint, payload)
        VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            'system_expire_credits',
            'system', 'pg_cron', 'server',
            jsonb_build_object('expired_accounts', expired_count, 'expired_credits_total', expired_total, 'executed_at', now())
        );
    END IF;

    RETURN jsonb_build_object('expired_accounts', expired_count, 'expired_credits', expired_total, 'timestamp', now());
END;
$$;

-- 4. RPC: Delete user account (self-service)
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_atas INTEGER := 0;
    deleted_consent INTEGER := 0;
    remaining_credits INTEGER := 0;
BEGIN
    SELECT COALESCE(balance, 0) INTO remaining_credits
    FROM credit_balances WHERE advogado_id = target_user_id;

    DELETE FROM atas_conteudo WHERE ata_id IN (SELECT id FROM atas WHERE advogado_id = target_user_id);
    DELETE FROM atas_pdfs WHERE ata_id IN (SELECT id FROM atas WHERE advogado_id = target_user_id);
    DELETE FROM atas WHERE advogado_id = target_user_id;
    GET DIAGNOSTICS deleted_atas = ROW_COUNT;

    DELETE FROM consent_records WHERE advogado_id = target_user_id;
    GET DIAGNOSTICS deleted_consent = ROW_COUNT;

    DELETE FROM credit_transactions WHERE advogado_id = target_user_id;
    DELETE FROM credit_balances WHERE advogado_id = target_user_id;

    INSERT INTO audit_logs (advogado_id, acao, ip_address, user_agent, device_fingerprint, payload)
    VALUES (
        target_user_id,
        'account_deleted_self_service',
        'self-service', 'user-initiated', 'user',
        jsonb_build_object('deleted_atas', deleted_atas, 'deleted_consent_records', deleted_consent, 'forfeited_credits', remaining_credits, 'executed_at', now())
    );

    DELETE FROM advogados WHERE id = target_user_id;

    RETURN jsonb_build_object('success', true, 'deleted_atas', deleted_atas, 'forfeited_credits', remaining_credits);
END;
$$;
