-- ============================================================================
-- Migration: Sprint 2 — Fortress (Security Hardening)
-- Created: 2026-08-18
-- Focus: RLS on financial tables + auth.uid() guards on SECURITY DEFINER RPCs
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ENABLE ROW LEVEL SECURITY ON FINANCIAL TABLES (C2)
-- ═══════════════════════════════════════════════════════════════════════════════

-- credit_balances: each user can only see/modify their own balance
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_balances_own_data ON public.credit_balances
  FOR ALL USING (advogado_id = auth.uid());

CREATE POLICY credit_balances_service ON public.credit_balances
  FOR ALL USING (auth.role() = 'service_role');


-- credit_transactions: each user can only see their own transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_transactions_own_data ON public.credit_transactions
  FOR SELECT USING (advogado_id = auth.uid());

CREATE POLICY credit_transactions_service ON public.credit_transactions
  FOR ALL USING (auth.role() = 'service_role');


-- payments: each user can only see their own payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_own_data ON public.payments
  FOR SELECT USING (advogado_id = auth.uid());

CREATE POLICY payments_service ON public.payments
  FOR ALL USING (auth.role() = 'service_role');


-- credit_packages: everyone can read (public catalog), only service can modify
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_packages_read ON public.credit_packages
  FOR SELECT USING (true);

CREATE POLICY credit_packages_service ON public.credit_packages
  FOR ALL USING (auth.role() = 'service_role');


-- audit_logs: users can only see their own audit entries
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_own_data ON public.audit_logs
  FOR SELECT USING (advogado_id = auth.uid());

CREATE POLICY audit_logs_service ON public.audit_logs
  FOR ALL USING (auth.role() = 'service_role');


-- asaas_customers: each user can only see their own Asaas mapping
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY asaas_customers_own_data ON public.asaas_customers
  FOR SELECT USING (advogado_id = auth.uid());

CREATE POLICY asaas_customers_service ON public.asaas_customers
  FOR ALL USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ADD auth.uid() GUARDS TO SECURITY DEFINER RPCs (C3)
-- ═══════════════════════════════════════════════════════════════════════════════

-- debit_credits: only the credit owner or service_role can debit
CREATE OR REPLACE FUNCTION public.debit_credits(
  p_advogado_id UUID,
  p_ata_id UUID,
  p_pages INT
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_balance INT;
BEGIN
  IF auth.role() != 'service_role' AND p_advogado_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: você só pode debitar seus próprios créditos';
  END IF;

  SELECT balance INTO v_balance
  FROM public.credit_balances
  WHERE advogado_id = p_advogado_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_pages THEN
    RETURN QUERY SELECT false, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  UPDATE public.credit_balances
  SET balance = balance - p_pages, updated_at = now()
  WHERE advogado_id = p_advogado_id;

  INSERT INTO public.credit_transactions (
    advogado_id, type, amount, balance_after,
    description, ata_id, estimated_pages, created_at
  ) VALUES (
    p_advogado_id, 'debit', p_pages, v_balance - p_pages,
    'Processamento de Relatório Preparatório: ' || p_pages || ' páginas',
    p_ata_id, p_pages, now()
  );

  RETURN QUERY SELECT true, v_balance - p_pages;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- refund_credits: only the credit owner or service_role can refund
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_advogado_id UUID,
  p_ata_id UUID,
  p_estimated INT,
  p_actual INT
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_balance INT;
  v_refund INT;
BEGIN
  IF auth.role() != 'service_role' AND p_advogado_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: você só pode receber reembolso dos seus próprios créditos';
  END IF;

  IF p_actual >= p_estimated THEN
    SELECT balance INTO v_balance FROM public.credit_balances WHERE advogado_id = p_advogado_id;
    RETURN QUERY SELECT false, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  v_refund := p_estimated - p_actual;

  SELECT balance INTO v_balance
  FROM public.credit_balances
  WHERE advogado_id = p_advogado_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.credit_balances (advogado_id, balance, updated_at)
    VALUES (p_advogado_id, v_refund, now());
    v_balance := 0;
  ELSE
    UPDATE public.credit_balances
    SET balance = balance + v_refund, updated_at = now()
    WHERE advogado_id = p_advogado_id;
  END IF;

  INSERT INTO public.credit_transactions (
    advogado_id, type, amount, balance_after,
    description, ata_id, estimated_pages, actual_pages, created_at
  ) VALUES (
    p_advogado_id, 'refund', v_refund, v_balance + v_refund,
    'Devolução de ' || v_refund || ' créditos (estimativa: ' || p_estimated || ', real: ' || p_actual || ')',
    p_ata_id, p_estimated, p_actual, now()
  );

  RETURN QUERY SELECT true, v_balance + v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- grant_welcome_credits: only the user themselves or service_role
CREATE OR REPLACE FUNCTION public.grant_welcome_credits(
  p_advogado_id UUID
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_already_received BOOLEAN;
  v_amount INT := 50;
  v_expires_at TIMESTAMPTZ;
  v_exists BOOLEAN;
BEGIN
  IF auth.role() != 'service_role' AND p_advogado_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE advogado_id = p_advogado_id AND type = 'trial'
  ) INTO v_already_received;

  IF v_already_received THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  v_expires_at := now() + interval '180 days';

  SELECT EXISTS (
    SELECT 1 FROM public.credit_balances WHERE advogado_id = p_advogado_id
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.credit_balances
    SET balance = v_amount, updated_at = now()
    WHERE advogado_id = p_advogado_id;
  ELSE
    INSERT INTO public.credit_balances (advogado_id, balance, updated_at)
    VALUES (p_advogado_id, v_amount, now());
  END IF;

  INSERT INTO public.credit_transactions (
    advogado_id, type, amount, balance_after,
    description, expires_at, created_at
  ) VALUES (
    p_advogado_id, 'trial', v_amount, v_amount,
    '🎁 Boas-vindas! 50 créditos de teste gratuitos.',
    v_expires_at, now()
  );

  RETURN QUERY SELECT true, v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- add_credits: ONLY service_role (webhook-triggered)
CREATE OR REPLACE FUNCTION public.add_credits(
  p_advogado_id UUID,
  p_package_id UUID,
  p_payment_id UUID,
  p_amount INT
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_balance INT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: apenas o servidor pode adicionar créditos';
  END IF;

  SELECT balance INTO v_balance
  FROM public.credit_balances
  WHERE advogado_id = p_advogado_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.credit_balances (advogado_id, balance, updated_at)
    VALUES (p_advogado_id, p_amount, now());
    v_balance := 0;
  ELSE
    UPDATE public.credit_balances
    SET balance = balance + p_amount, updated_at = now()
    WHERE advogado_id = p_advogado_id;
  END IF;

  v_expires_at := now() + interval '180 days';

  INSERT INTO public.credit_transactions (
    advogado_id, type, amount, balance_after,
    description, package_id, payment_id, expires_at, created_at
  ) VALUES (
    p_advogado_id, 'purchase', p_amount, v_balance + p_amount,
    'Compra de ' || p_amount || ' créditos',
    p_package_id, p_payment_id, v_expires_at, now()
  );

  RETURN QUERY SELECT true, v_balance + p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. MISSING INDEXES (M8, M10)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_credit_transactions_advogado
  ON public.credit_transactions(advogado_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);
