-- ============================================================
-- Sprint 4 Migration: Hardening Admin & Hash Immutability
-- ============================================================

-- 1. Trigger to guarantee immutability of zip_hash and pdf_hash on atas table
CREATE OR REPLACE FUNCTION public.protect_ata_hashes()
RETURNS TRIGGER AS $$
BEGIN
  -- If zip_hash was already set and is being changed to a different value
  IF OLD.zip_hash IS NOT NULL AND NEW.zip_hash IS DISTINCT FROM OLD.zip_hash THEN
    RAISE EXCEPTION 'Violação de Integridade: O hash do arquivo-fonte (zip_hash) é imutável após registrado.';
  END IF;

  -- If pdf_hash was already set and is being changed to a different value
  IF OLD.pdf_hash IS NOT NULL AND NEW.pdf_hash IS DISTINCT FROM OLD.pdf_hash THEN
    RAISE EXCEPTION 'Violação de Integridade: O hash do relatório final (pdf_hash) é imutável após registrado.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_ata_hashes ON public.atas;
CREATE TRIGGER trg_protect_ata_hashes
  BEFORE UPDATE ON public.atas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_ata_hashes();

-- 2. Enhanced admin_adjust_credits RPC with mandatory audit log
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  target_id UUID,
  amount_to_add INT,
  p_description TEXT
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_balance INT;
  v_type VARCHAR(255);
  v_admin_id UUID := auth.uid();
  v_target_email TEXT;
BEGIN
  -- Check admin permission
  IF NOT COALESCE((SELECT a.is_admin FROM public.advogados a WHERE a.id = v_admin_id), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  SELECT email INTO v_target_email FROM public.advogados WHERE id = target_id;

  -- Lock credit balance row for the target user
  SELECT cb.balance INTO v_balance
  FROM public.credit_balances cb
  WHERE cb.advogado_id = target_id
  FOR UPDATE;

  -- Initialize balance if it doesn't exist
  IF v_balance IS NULL THEN
    INSERT INTO public.credit_balances (advogado_id, balance, updated_at)
    VALUES (target_id, 0, now());
    v_balance := 0;
  END IF;

  -- Prevent balance from going negative
  IF v_balance + amount_to_add < 0 THEN
    RAISE EXCEPTION 'Erro: O saldo não pode ficar negativo (Saldo atual: %)', v_balance;
  END IF;

  -- Set transaction type based on sign of adjustment
  IF amount_to_add >= 0 THEN
    v_type := 'admin_adjustment_add';
  ELSE
    v_type := 'admin_adjustment_sub';
  END IF;

  -- Update target balance
  UPDATE public.credit_balances
  SET balance = balance + amount_to_add,
      updated_at = now()
  WHERE advogado_id = target_id;

  -- Insert into ledger (credit_transactions)
  INSERT INTO public.credit_transactions (
    advogado_id,
    type,
    amount,
    balance_after,
    description,
    created_at
  ) VALUES (
    target_id,
    v_type,
    amount_to_add,
    v_balance + amount_to_add,
    COALESCE(p_description, 'Ajuste manual do administrador'),
    now()
  );

  -- Insert audit log entry for the administrative action
  INSERT INTO public.audit_logs (
    advogado_id,
    acao,
    ip_address,
    user_agent,
    device_fingerprint,
    payload
  ) VALUES (
    v_admin_id,
    'admin_credit_adjustment',
    'internal',
    'admin_dashboard',
    'admin_session',
    jsonb_build_object(
      'target_user_id', target_id,
      'target_email', v_target_email,
      'amount', amount_to_add,
      'balance_before', v_balance,
      'balance_after', v_balance + amount_to_add,
      'justification', COALESCE(p_description, 'Sem justificativa preenchida'),
      'executed_at', now()
    )
  );

  RETURN QUERY SELECT true, v_balance + amount_to_add;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Enhanced admin_update_status RPC with mandatory audit log
CREATE OR REPLACE FUNCTION public.admin_update_status(
  target_id UUID,
  new_status TEXT
) RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_old_status TEXT;
  v_target_email TEXT;
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM public.advogados a WHERE a.id = v_admin_id), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  SELECT status, email INTO v_old_status, v_target_email FROM public.advogados WHERE id = target_id;

  UPDATE public.advogados
  SET status = new_status
  WHERE id = target_id;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    advogado_id,
    acao,
    ip_address,
    user_agent,
    device_fingerprint,
    payload
  ) VALUES (
    v_admin_id,
    'admin_status_change',
    'internal',
    'admin_dashboard',
    'admin_session',
    jsonb_build_object(
      'target_user_id', target_id,
      'target_email', v_target_email,
      'old_status', v_old_status,
      'new_status', new_status,
      'executed_at', now()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enhanced admin_delete_advogado RPC with mandatory audit log
CREATE OR REPLACE FUNCTION public.admin_delete_advogado(target_id UUID)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target_email TEXT;
  v_target_nome TEXT;
BEGIN
  IF NOT COALESCE((SELECT is_admin FROM advogados WHERE id = v_admin_id), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  -- Prevent deleting yourself
  IF target_id = v_admin_id THEN
    RAISE EXCEPTION 'Não é possível excluir sua própria conta de admin';
  END IF;

  SELECT email, nome INTO v_target_email, v_target_nome FROM public.advogados WHERE id = target_id;

  -- Audit log BEFORE deletion
  INSERT INTO public.audit_logs (
    advogado_id,
    acao,
    ip_address,
    user_agent,
    device_fingerprint,
    payload
  ) VALUES (
    v_admin_id,
    'admin_delete_user',
    'internal',
    'admin_dashboard',
    'admin_session',
    jsonb_build_object(
      'target_user_id', target_id,
      'target_email', v_target_email,
      'target_nome', v_target_nome,
      'executed_at', now()
    )
  );

  DELETE FROM atas_pdfs WHERE ata_id IN (SELECT id FROM atas WHERE advogado_id = target_id);
  DELETE FROM atas_conteudo WHERE ata_id IN (SELECT id FROM atas WHERE advogado_id = target_id);
  DELETE FROM atas WHERE advogado_id = target_id;
  DELETE FROM credit_transactions WHERE advogado_id = target_id;
  DELETE FROM credit_balances WHERE advogado_id = target_id;
  DELETE FROM consent_records WHERE advogado_id = target_id;
  DELETE FROM advogados WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
