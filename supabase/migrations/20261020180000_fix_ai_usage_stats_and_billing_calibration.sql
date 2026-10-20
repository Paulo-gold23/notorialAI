-- =============================================================================
-- Migration: 20261020180000_fix_ai_usage_stats_and_billing_calibration.sql
-- Descrição:
--   1. Adiciona coluna estimated_cost_usd em public.ai_usage_log (corrige erro 400)
--   2. Calibra histórico de custos OpenAI ($0.03 em Outubro para gpt-6-luna e
--      $0.00 para chamadas históricas gpt-4.1-mini cobertas por Complimentary Tokens)
--   3. Cria tabela public.ai_billing_config ancorada em $1.08 USD de saldo OpenAI
--   4. Cria RPC public.admin_update_openai_balance para recalibrar/recarregar saldo
--   5. Atualiza RPC public.admin_get_ai_usage_stats filtrando chamadas reais
--      (status = 'success') e separando OpenAI no gráfico diário
-- =============================================================================

-- 1. Add estimated_cost_usd column to public.ai_usage_log
ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6);

-- 2. Backfill & calibrate historical rows in ai_usage_log
UPDATE public.ai_usage_log
SET estimated_cost_usd = 0.000000
WHERE service ILIKE '%groq%'
   OR status <> 'success'
   OR model ILIKE '%gpt-4.1-mini%';

UPDATE public.ai_usage_log
SET estimated_cost_usd = ROUND(
  (
    (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
    * (0.03 / 0.03081678)
  )::numeric,
  6
)
WHERE service = 'openai'
  AND status = 'success'
  AND model ILIKE '%gpt-6-luna%'
  AND estimated_cost_usd IS NULL;

-- 3. Create public.ai_billing_config to track calibrated OpenAI credit balance ($1.08 USD)
CREATE TABLE IF NOT EXISTS public.ai_billing_config (
    provider            VARCHAR(30) PRIMARY KEY,
    base_balance_usd    NUMERIC(12, 4) NOT NULL DEFAULT 1.0800,
    monthly_budget_usd  NUMERIC(12, 2) NOT NULL DEFAULT 120.00,
    calibrated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    active_model        VARCHAR(50) NOT NULL DEFAULT 'gpt-6-luna',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID REFERENCES public.advogados(id) ON DELETE SET NULL
);

ALTER TABLE public.ai_billing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_billing_config_admin_read" ON public.ai_billing_config;
CREATE POLICY "ai_billing_config_admin_read" ON public.ai_billing_config
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "ai_billing_config_service_all" ON public.ai_billing_config;
CREATE POLICY "ai_billing_config_service_all" ON public.ai_billing_config
  FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

INSERT INTO public.ai_billing_config (provider, base_balance_usd, monthly_budget_usd, calibrated_at, active_model, updated_at)
VALUES ('openai', 1.0800, 120.00, now(), 'gpt-6-luna', now())
ON CONFLICT (provider) DO UPDATE
SET base_balance_usd    = EXCLUDED.base_balance_usd,
    monthly_budget_usd  = EXCLUDED.monthly_budget_usd,
    calibrated_at       = EXCLUDED.calibrated_at,
    active_model        = EXCLUDED.active_model,
    updated_at          = now();

-- 4. Create RPC to allow admin to recalibrate/recharge OpenAI credit balance
CREATE OR REPLACE FUNCTION public.admin_update_openai_balance(p_new_balance_usd numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT public.is_current_user_admin() INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  IF p_new_balance_usd IS NULL OR p_new_balance_usd < 0 THEN
    RAISE EXCEPTION 'Informe um saldo válido maior ou igual a zero';
  END IF;

  INSERT INTO public.ai_billing_config (provider, base_balance_usd, calibrated_at, active_model, updated_at, updated_by)
  VALUES ('openai', p_new_balance_usd, now(), 'gpt-6-luna', now(), auth.uid())
  ON CONFLICT (provider) DO UPDATE
  SET base_balance_usd = EXCLUDED.base_balance_usd,
      calibrated_at    = now(),
      updated_at       = now(),
      updated_by       = auth.uid();

  INSERT INTO public.audit_logs (advogado_id, acao, payload, ip_address)
  VALUES (
    auth.uid(),
    'admin_calibrate_openai_balance',
    jsonb_build_object('new_balance_usd', ROUND(p_new_balance_usd::numeric, 4), 'calibrated_at', now()),
    'admin_panel'
  );

  RETURN json_build_object(
    'success', true,
    'base_balance_usd', ROUND(p_new_balance_usd::numeric, 2),
    'calibrated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_openai_balance(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_openai_balance(numeric) TO authenticated, service_role, postgres;

-- 5. Replace public.admin_get_ai_usage_stats() with calibrated, accurate metrics
CREATE OR REPLACE FUNCTION public.admin_get_ai_usage_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  is_admin boolean;
  v_base_balance numeric := 1.0800;
  v_monthly_budget numeric := 120.00;
  v_calibrated_at timestamptz := now();
  v_active_model text := 'gpt-6-luna';
  v_cost_since_cal numeric := 0;
  v_remaining_balance numeric := 1.0800;
BEGIN
  SELECT public.is_current_user_admin() INTO is_admin;
  IF NOT COALESCE(is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  SELECT base_balance_usd, monthly_budget_usd, calibrated_at, active_model
  INTO v_base_balance, v_monthly_budget, v_calibrated_at, v_active_model
  FROM public.ai_billing_config
  WHERE provider = 'openai';

  v_base_balance := COALESCE(v_base_balance, 1.0800);
  v_monthly_budget := COALESCE(v_monthly_budget, 120.00);
  v_calibrated_at := COALESCE(v_calibrated_at, now());
  v_active_model := COALESCE(v_active_model, 'gpt-6-luna');

  SELECT COALESCE(SUM(
    CASE
      WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
      WHEN service ILIKE '%groq%' THEN 0.0
      WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
      WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
      WHEN model ILIKE '%gpt-4o-mini%' THEN (COALESCE(prompt_tokens, 0) * 0.00000015 + COALESCE(completion_tokens, 0) * 0.00000060)
      WHEN model ILIKE '%gpt-4o%' THEN (COALESCE(prompt_tokens, 0) * 0.0000025 + COALESCE(completion_tokens, 0) * 0.00001)
      ELSE (COALESCE(total_tokens, 0) * 0.00000005)
    END
  ), 0)
  INTO v_cost_since_cal
  FROM public.ai_usage_log
  WHERE service = 'openai'
    AND status = 'success'
    AND created_at > v_calibrated_at;

  v_remaining_balance := GREATEST(0, v_base_balance - v_cost_since_cal);

  SELECT json_build_object(
    'total_tokens', COALESCE(SUM(total_tokens) FILTER (WHERE status = 'success'), 0),
    'openai_tokens_month', COALESCE(SUM(total_tokens) FILTER (WHERE service = 'openai' AND status = 'success' AND created_at >= date_trunc('month', now())), 0),
    'gpt_luna_tokens', COALESCE(SUM(total_tokens) FILTER (WHERE model ILIKE '%gpt-6-luna%' AND status = 'success'), 0),
    'gpt_luna_requests', COUNT(*) FILTER (WHERE model ILIKE '%gpt-6-luna%' AND status = 'success'),
    'total_cost_usd', ROUND(COALESCE(
      SUM(CASE
        WHEN status <> 'success' THEN 0.0
        WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
        WHEN service ILIKE '%groq%' THEN 0.0
        WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
        WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
        WHEN model ILIKE '%gpt-4o-mini%' THEN (COALESCE(prompt_tokens, 0) * 0.00000015 + COALESCE(completion_tokens, 0) * 0.00000060)
        WHEN model ILIKE '%gpt-4o%' THEN (COALESCE(prompt_tokens, 0) * 0.0000025 + COALESCE(completion_tokens, 0) * 0.00001)
        ELSE (COALESCE(total_tokens, 0) * 0.00000005)
      END), 0)::numeric, 2),
    'total_cost_usd_exact', ROUND(COALESCE(
      SUM(CASE
        WHEN status <> 'success' THEN 0.0
        WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
        WHEN service ILIKE '%groq%' THEN 0.0
        WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
        WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
        WHEN model ILIKE '%gpt-4o-mini%' THEN (COALESCE(prompt_tokens, 0) * 0.00000015 + COALESCE(completion_tokens, 0) * 0.00000060)
        WHEN model ILIKE '%gpt-4o%' THEN (COALESCE(prompt_tokens, 0) * 0.0000025 + COALESCE(completion_tokens, 0) * 0.00001)
        ELSE (COALESCE(total_tokens, 0) * 0.00000005)
      END), 0)::numeric, 4),
    'openai_credit_remaining_usd', ROUND(v_remaining_balance::numeric, 2),
    'openai_credit_remaining_exact', ROUND(v_remaining_balance::numeric, 4),
    'openai_base_balance_usd', ROUND(v_base_balance::numeric, 2),
    'openai_monthly_budget_usd', ROUND(v_monthly_budget::numeric, 2),
    'openai_calibrated_at', v_calibrated_at,
    'active_model', v_active_model,
    'total_audio_minutes', ROUND(COALESCE(SUM(audio_duration_sec) FILTER (WHERE status = 'success') / 60.0, 0)::numeric, 1),
    'cached_audio_minutes', ROUND(COALESCE(SUM(audio_duration_sec) FILTER (WHERE status = 'cached') / 60.0, 0)::numeric, 1),
    'total_requests', COUNT(*) FILTER (WHERE status IN ('success', 'error', 'timeout')),
    'openai_requests', COUNT(*) FILTER (WHERE service = 'openai' AND status = 'success'),
    'groq_requests', COUNT(*) FILTER (WHERE service ILIKE '%groq%' AND status = 'success'),
    'cached_requests', COUNT(*) FILTER (WHERE status = 'cached'),
    'rate_limited_retries', COUNT(*) FILTER (WHERE status = 'rate_limited'),
    'total_errors', COUNT(*) FILTER (WHERE status IN ('error', 'timeout')),
    'total_retries', COUNT(*) FILTER (WHERE is_retry = true AND status = 'success'),
    'by_service', COALESCE((
      SELECT json_agg(row_to_json(s))
      FROM (
        SELECT 
          service, 
          COUNT(*) FILTER (WHERE status = 'success') as requests, 
          COALESCE(SUM(total_tokens) FILTER (WHERE status = 'success'), 0) as tokens,
          CASE WHEN service ILIKE '%groq%' THEN true ELSE false END as is_free_tier,
          ROUND(COALESCE(SUM(CASE
            WHEN status <> 'success' THEN 0.0
            WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
            WHEN service ILIKE '%groq%' THEN 0.0
            WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
            WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
            ELSE (COALESCE(total_tokens, 0) * 0.00000005)
          END), 0)::numeric, 2) as cost_usd,
          ROUND(COALESCE(SUM(CASE
            WHEN status <> 'success' THEN 0.0
            WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
            WHEN service ILIKE '%groq%' THEN 0.0
            WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
            WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
            ELSE (COALESCE(total_tokens, 0) * 0.00000005)
          END), 0)::numeric, 4) as cost_usd_exact
        FROM public.ai_usage_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY service ORDER BY cost_usd_exact DESC, requests DESC
      ) s
    ), '[]'::json),
    'by_model', COALESCE((
      SELECT json_agg(row_to_json(m))
      FROM (
        SELECT
          COALESCE(model, 'desconhecido') as model,
          service,
          COUNT(*) FILTER (WHERE status = 'success') as requests,
          COALESCE(SUM(prompt_tokens) FILTER (WHERE status = 'success'), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens) FILTER (WHERE status = 'success'), 0) as completion_tokens,
          COALESCE(SUM(total_tokens) FILTER (WHERE status = 'success'), 0) as tokens,
          ROUND(COALESCE(SUM(audio_duration_sec) FILTER (WHERE status = 'success') / 60.0, 0)::numeric, 1) as audio_minutes,
          CASE
            WHEN service ILIKE '%groq%' THEN true
            WHEN model ILIKE '%gpt-4.1-mini%' THEN true
            ELSE false
          END as is_free_or_complimentary,
          ROUND(COALESCE(SUM(CASE
            WHEN status <> 'success' THEN 0.0
            WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
            WHEN service ILIKE '%groq%' THEN 0.0
            WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
            WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
            ELSE (COALESCE(total_tokens, 0) * 0.00000005)
          END), 0)::numeric, 4) as cost_usd
        FROM public.ai_usage_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status = 'success'
        GROUP BY model, service
        ORDER BY CASE WHEN model ILIKE '%gpt-6-luna%' THEN 0 WHEN service = 'openai' THEN 1 ELSE 2 END
      ) m
    ), '[]'::json),
    'by_advogado', COALESCE((
      SELECT json_agg(row_to_json(a))
      FROM (
        SELECT 
          l.advogado_id, 
          COALESCE(adv.nome, 'Não identificado') as nome,
          COUNT(*) FILTER (WHERE l.status = 'success') as requests,
          COUNT(*) FILTER (WHERE l.service = 'openai' AND l.status = 'success') as openai_requests,
          COUNT(*) FILTER (WHERE l.service ILIKE '%groq%' AND l.status = 'success') as groq_requests,
          COALESCE(SUM(l.total_tokens) FILTER (WHERE l.status = 'success'), 0) as tokens,
          ROUND(COALESCE(SUM(CASE
            WHEN l.status <> 'success' THEN 0.0
            WHEN l.estimated_cost_usd IS NOT NULL THEN l.estimated_cost_usd
            WHEN l.service ILIKE '%groq%' THEN 0.0
            WHEN l.model ILIKE '%gpt-6-luna%' THEN (COALESCE(l.prompt_tokens, 0) * 0.00000002 + COALESCE(l.completion_tokens, 0) * 0.00000008)
            WHEN l.model ILIKE '%gpt-4.1-mini%' THEN 0.0
            ELSE (COALESCE(l.total_tokens, 0) * 0.00000005)
          END), 0)::numeric, 4) as cost_usd
        FROM public.ai_usage_log l
        LEFT JOIN public.advogados adv ON adv.id = l.advogado_id
        WHERE l.created_at >= NOW() - INTERVAL '30 days'
          AND l.status = 'success'
        GROUP BY l.advogado_id, adv.nome
        ORDER BY cost_usd DESC, tokens DESC
        LIMIT 20
      ) a
    ), '[]'::json),
    'daily_trend', COALESCE((
      SELECT json_agg(row_to_json(d))
      FROM (
        SELECT 
          TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as day,
          TO_CHAR(DATE(created_at), 'DD/MM') as day_label,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens,
          STRING_AGG(DISTINCT model, ', ') as models_used,
          ROUND(COALESCE(SUM(CASE
            WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
            WHEN model ILIKE '%gpt-6-luna%' THEN (COALESCE(prompt_tokens, 0) * 0.00000002 + COALESCE(completion_tokens, 0) * 0.00000008)
            WHEN model ILIKE '%gpt-4.1-mini%' THEN 0.0
            ELSE (COALESCE(total_tokens, 0) * 0.00000005)
          END), 0)::numeric, 4) as cost_usd
        FROM public.ai_usage_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND service = 'openai'
          AND status = 'success'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      ) d
    ), '[]'::json)
  ) INTO result
  FROM public.ai_usage_log
  WHERE created_at >= NOW() - INTERVAL '30 days';

  RETURN COALESCE(result, json_build_object(
    'total_tokens', 0,
    'openai_tokens_month', 0,
    'gpt_luna_tokens', 0,
    'gpt_luna_requests', 0,
    'total_cost_usd', 0,
    'total_cost_usd_exact', 0,
    'openai_credit_remaining_usd', ROUND(v_remaining_balance::numeric, 2),
    'openai_credit_remaining_exact', ROUND(v_remaining_balance::numeric, 4),
    'openai_base_balance_usd', ROUND(v_base_balance::numeric, 2),
    'openai_monthly_budget_usd', ROUND(v_monthly_budget::numeric, 2),
    'openai_calibrated_at', v_calibrated_at,
    'active_model', v_active_model,
    'total_audio_minutes', 0,
    'cached_audio_minutes', 0,
    'total_requests', 0,
    'openai_requests', 0,
    'groq_requests', 0,
    'cached_requests', 0,
    'rate_limited_retries', 0,
    'total_errors', 0,
    'total_retries', 0,
    'by_service', '[]'::json,
    'by_model', '[]'::json,
    'by_advogado', '[]'::json,
    'daily_trend', '[]'::json
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_ai_usage_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ai_usage_stats() TO authenticated, service_role, postgres;
