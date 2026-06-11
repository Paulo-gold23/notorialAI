-- Migration: Admin Dashboard Enhancements (Credits adjustment & User transaction monitoring)
-- Created: 2026-06-11
-- Focus: Support admin-driven credit balance adjustments and user transaction visibility.

-- 1. Drop existing admin_list_advogados to change its return signature
DROP FUNCTION IF EXISTS public.admin_list_advogados();

-- 2. Recreate admin_list_advogados with credit_balance column
CREATE OR REPLACE FUNCTION public.admin_list_advogados()
RETURNS TABLE (
  id UUID,
  nome VARCHAR(255),
  oab VARCHAR(20),
  email VARCHAR(255),
  telefone VARCHAR(20),
  escritorio VARCHAR(255),
  status TEXT,
  is_admin BOOLEAN,
  created_at TIMESTAMPTZ,
  total_atas BIGINT,
  credit_balance INTEGER
) AS $$
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM public.advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.nome,
    a.oab,
    a.email,
    a.telefone,
    a.escritorio,
    a.status,
    a.is_admin,
    a.created_at,
    COALESCE((SELECT COUNT(*) FROM public.atas WHERE advogado_id = a.id), 0) as total_atas,
    COALESCE((SELECT cb.balance FROM public.credit_balances cb WHERE cb.advogado_id = a.id), 0) as credit_balance
  FROM public.advogados a
  ORDER BY
    CASE WHEN a.status = 'pendente' THEN 0 ELSE 1 END,
    a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create admin_adjust_credits RPC to manually add/subtract credits with description/justification
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  target_id UUID,
  amount_to_add INT,
  p_description TEXT
) RETURNS TABLE(success BOOLEAN, new_balance INT) AS $$
DECLARE
  v_balance INT;
  v_type VARCHAR(255);
BEGIN
  -- Check admin permission
  IF NOT COALESCE((SELECT a.is_admin FROM public.advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

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

  RETURN QUERY SELECT true, v_balance + amount_to_add;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create admin_get_user_transactions RPC to query a specific user's transactions
CREATE OR REPLACE FUNCTION public.admin_get_user_transactions(target_id UUID)
RETURNS TABLE (
  id UUID,
  type VARCHAR(255),
  amount INTEGER,
  balance_after INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM public.advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT 
    ct.id,
    ct.type,
    ct.amount,
    ct.balance_after,
    ct.description,
    ct.created_at
  FROM public.credit_transactions ct
  WHERE ct.advogado_id = target_id
  ORDER BY ct.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
