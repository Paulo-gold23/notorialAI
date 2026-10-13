-- ============================================================================
-- Migration: Exclude 'estimating' drafts from document metrics/lists & auto-cleanup
-- ============================================================================

-- 1. Update recover_stuck_atas() to also purge expired 'estimating' rows (> 10 minutes)
CREATE OR REPLACE FUNCTION public.recover_stuck_atas() 
RETURNS void AS $$
BEGIN
  UPDATE public.atas
  SET status = 'error',
      error_message = 'Processamento expirou por inatividade. Por favor, envie o arquivo novamente.',
      updated_at = now()
  WHERE status IN ('uploading', 'parsing', 'transcribing', 'organizing', 'in_queue')
    AND updated_at < now() - interval '60 minutes'
    AND (deleted_at IS NULL);

  DELETE FROM public.atas
  WHERE status = 'estimating'
    AND created_at < now() - interval '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public';

-- 2. Update admin_get_enhanced_stats() to exclude 'estimating' and soft-deleted rows
CREATE OR REPLACE FUNCTION public.admin_get_enhanced_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT is_admin FROM advogados WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN (SELECT json_build_object(
    'total_advogados', (SELECT COUNT(*) FROM advogados),
    'advogados_pendentes', (SELECT COUNT(*) FROM advogados WHERE status = 'pendente'),
    'advogados_aprovados', (SELECT COUNT(*) FROM advogados WHERE status = 'aprovado'),
    'advogados_rejeitados', (SELECT COUNT(*) FROM advogados WHERE status = 'rejeitado'),
    'total_atas', (SELECT COUNT(*) FROM atas WHERE status <> 'estimating' AND deleted_at IS NULL),
    'total_pdfs', (SELECT COUNT(*) FROM atas_pdfs),
    'atas_prontas', (SELECT COUNT(*) FROM atas WHERE status = 'ready' AND deleted_at IS NULL),
    'atas_erro', (SELECT COUNT(*) FROM atas WHERE status = 'error' AND deleted_at IS NULL),
    'atas_processando', (SELECT COUNT(*) FROM atas WHERE status IN ('uploading','in_queue','parsing','transcribing','organizing') AND deleted_at IS NULL),
    'total_mensagens_processadas', (SELECT COALESCE(SUM(total_mensagens), 0) FROM atas WHERE status <> 'estimating' AND deleted_at IS NULL),
    'total_audios_transcritos', (SELECT COALESCE(SUM(total_audios), 0) FROM atas WHERE status <> 'estimating' AND deleted_at IS NULL),
    'atas_esta_semana', (SELECT COUNT(*) FROM atas WHERE status <> 'estimating' AND deleted_at IS NULL AND created_at >= date_trunc('week', CURRENT_DATE)),
    'atas_este_mes', (SELECT COUNT(*) FROM atas WHERE status <> 'estimating' AND deleted_at IS NULL AND created_at >= date_trunc('month', CURRENT_DATE)),
    'registros_esta_semana', (SELECT COUNT(*) FROM advogados WHERE created_at >= date_trunc('week', CURRENT_DATE)),
    'registros_este_mes', (SELECT COUNT(*) FROM advogados WHERE created_at >= date_trunc('month', CURRENT_DATE))
  ));
END;
$function$;

-- 3. Update admin_recent_atas() to exclude 'estimating' and soft-deleted rows
CREATE OR REPLACE FUNCTION public.admin_recent_atas(limit_count integer DEFAULT 10)
RETURNS TABLE(id uuid, titulo character varying, status character varying, created_at timestamp with time zone, advogado_nome character varying, advogado_email character varying, total_mensagens integer, total_audios integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT
    at.id,
    at.titulo,
    at.status,
    at.created_at,
    a.nome as advogado_nome,
    a.email as advogado_email,
    at.total_mensagens,
    at.total_audios
  FROM atas at
  JOIN advogados a ON at.advogado_id = a.id
  WHERE at.status <> 'estimating'
    AND at.deleted_at IS NULL
  ORDER BY at.created_at DESC
  LIMIT limit_count;
END;
$function$;

-- 4. Update admin_atas_by_status() to exclude 'estimating' and soft-deleted rows
CREATE OR REPLACE FUNCTION public.admin_atas_by_status()
RETURNS TABLE(status text, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT at.status::TEXT, COUNT(*) AS total
  FROM atas at
  WHERE at.status <> 'estimating'
    AND at.deleted_at IS NULL
  GROUP BY at.status
  ORDER BY total DESC;
END;
$function$;

-- 5. Update admin_atas_by_week() to exclude 'estimating' and soft-deleted rows
CREATE OR REPLACE FUNCTION public.admin_atas_by_week()
RETURNS TABLE(week_label text, week_start date, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT a.is_admin FROM advogados a WHERE a.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(
      date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')::date,
      date_trunc('week', CURRENT_DATE)::date,
      '1 week'::interval
    )::date AS ws
  )
  SELECT
    to_char(w.ws, 'DD/MM') AS week_label,
    w.ws AS week_start,
    COALESCE(COUNT(at.id), 0) AS total
  FROM weeks w
  LEFT JOIN atas at
    ON at.created_at >= w.ws
   AND at.created_at < w.ws + INTERVAL '7 days'
   AND at.status <> 'estimating'
   AND at.deleted_at IS NULL
  GROUP BY w.ws
  ORDER BY w.ws;
END;
$function$;

-- 6. Update admin_list_advogados() to exclude 'estimating' and soft-deleted rows from total_atas
CREATE OR REPLACE FUNCTION public.admin_list_advogados()
RETURNS TABLE(id uuid, nome character varying, oab character varying, email character varying, telefone character varying, escritorio character varying, status text, is_admin boolean, created_at timestamp with time zone, total_atas bigint, credit_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    COALESCE((SELECT COUNT(*) FROM public.atas at WHERE at.advogado_id = a.id AND at.status <> 'estimating' AND at.deleted_at IS NULL), 0) as total_atas,
    COALESCE((SELECT cb.balance FROM public.credit_balances cb WHERE cb.advogado_id = a.id), 0) as credit_balance
  FROM public.advogados a
  ORDER BY
    CASE WHEN a.status = 'pendente' THEN 0 ELSE 1 END,
    a.created_at DESC;
END;
$function$;

-- 7. Immediately clean up expired 'estimating' rows currently in the database
SELECT public.recover_stuck_atas();
