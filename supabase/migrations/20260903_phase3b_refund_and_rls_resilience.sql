-- Migration: Phase 3b - Refund and RLS Resilience
-- Permite que estornos e gravações de auditoria/cache funcionem confiavelmente em background tasks

-- 1. Atualizar RPC refund_credits para permitir estornos do backend com verificação de posse da ata
CREATE OR REPLACE FUNCTION public.refund_credits(p_advogado_id uuid, p_ata_id uuid, p_estimated integer, p_actual integer)
 RETURNS TABLE(success boolean, new_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_balance INT;
  v_refund INT;
BEGIN
  IF auth.role() != 'service_role' AND p_advogado_id != auth.uid() THEN
    -- Verificação de segurança: a ata precisa existir e pertencer a este advogado
    IF NOT EXISTS (SELECT 1 FROM public.atas WHERE id = p_ata_id AND advogado_id = p_advogado_id) THEN
      RAISE EXCEPTION 'Acesso negado: você só pode receber reembolso dos seus próprios créditos';
    END IF;
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
$function$;

-- 2. Garantir que as tabelas de auditoria e cache aceitem escritas do backend (anon/service)
DROP POLICY IF EXISTS "ai_usage_insert_backend" ON public.ai_usage_log;
CREATE POLICY "ai_usage_insert_backend"
  ON public.ai_usage_log
  FOR INSERT
  TO anon, authenticated, service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "audio_cache_backend" ON public.audio_transcription_cache;
CREATE POLICY "audio_cache_backend"
  ON public.audio_transcription_cache
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ata_chunks_backend" ON public.ata_chunks_cache;
CREATE POLICY "ata_chunks_backend"
  ON public.ata_chunks_cache
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
