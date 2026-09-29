-- ============================================================================
-- Migration: Disk IO Budget Optimization
-- Created: 2026-09-29
-- Focus: Reduce disk I/O through index optimization, RLS subselect caching,
--        and cron job cleanup. All statements are idempotent.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ADD STRATEGIC INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Composite index for the most frequent query pattern:
-- frontend polling atas by (advogado_id, status) WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_atas_advogado_status_active 
ON public.atas(advogado_id, status) 
WHERE deleted_at IS NULL;

-- FK indexes for tables with RLS policies filtering by advogado_id
-- Without these, RLS forces sequential scans on every query
CREATE INDEX IF NOT EXISTS idx_credit_transactions_advogado 
ON public.credit_transactions(advogado_id);

CREATE INDEX IF NOT EXISTS idx_payments_advogado 
ON public.payments(advogado_id);

CREATE INDEX IF NOT EXISTS idx_asaas_customers_advogado
ON public.asaas_customers(advogado_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_advogado
ON public.audit_logs(advogado_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. REMOVE LOW-SELECTIVITY INDEXES ON ai_usage_log
-- ═══════════════════════════════════════════════════════════════════════════════
-- 'service' has ~2 distinct values, 'status' has ~4.
-- These indexes are never used by the planner and add I/O on every INSERT.
DROP INDEX IF EXISTS public.idx_ai_usage_log_service;
DROP INDEX IF EXISTS public.idx_ai_usage_log_status;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. OPTIMIZE RLS POLICIES WITH (SELECT auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════════
-- Wrapping auth.uid() in a subselect lets Postgres evaluate it once as an
-- InitPlan instead of per-row. Same security semantics, much less CPU/IO.

-- ── atas (highest frequency: polling every 2s during pipeline) ──
-- Preserves soft-delete logic from migration 20260609180000
DROP POLICY IF EXISTS atas_select ON public.atas;
CREATE POLICY atas_select ON public.atas 
  FOR SELECT USING (advogado_id = (SELECT auth.uid()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS atas_insert ON public.atas;
CREATE POLICY atas_insert ON public.atas 
  FOR INSERT WITH CHECK (advogado_id = (SELECT auth.uid()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS atas_update ON public.atas;
CREATE POLICY atas_update ON public.atas 
  FOR UPDATE USING (advogado_id = (SELECT auth.uid())) 
  WITH CHECK (advogado_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS atas_delete ON public.atas;
CREATE POLICY atas_delete ON public.atas 
  FOR DELETE USING (advogado_id = (SELECT auth.uid()) AND deleted_at IS NULL);

-- ── advogados (queried on every page navigation) ──
DROP POLICY IF EXISTS advogados_own_profile ON public.advogados;
CREATE POLICY advogados_own_profile ON public.advogados 
  FOR ALL USING (id = (SELECT auth.uid()));

-- ── credit_balances ──
DROP POLICY IF EXISTS credit_balances_own_data ON public.credit_balances;
CREATE POLICY credit_balances_own_data ON public.credit_balances 
  FOR ALL USING (advogado_id = (SELECT auth.uid()));

-- ── credit_transactions ──
DROP POLICY IF EXISTS credit_transactions_own_data ON public.credit_transactions;
CREATE POLICY credit_transactions_own_data ON public.credit_transactions 
  FOR SELECT USING (advogado_id = (SELECT auth.uid()));

-- ── payments ──
DROP POLICY IF EXISTS payments_own_data ON public.payments;
CREATE POLICY payments_own_data ON public.payments 
  FOR SELECT USING (advogado_id = (SELECT auth.uid()));

-- ── audit_logs ──
DROP POLICY IF EXISTS audit_logs_own_data ON public.audit_logs;
CREATE POLICY audit_logs_own_data ON public.audit_logs 
  FOR SELECT USING (advogado_id = (SELECT auth.uid()));

-- ── asaas_customers ──
DROP POLICY IF EXISTS asaas_customers_own_data ON public.asaas_customers;
CREATE POLICY asaas_customers_own_data ON public.asaas_customers 
  FOR SELECT USING (advogado_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3B. REMOVE OLD DUPLICATE POLICIES (pre-existing with bare auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════════
-- These old policies duplicated the new optimized ones, forcing double evaluation.

DROP POLICY IF EXISTS "Users can delete own profile" ON public.advogados;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.advogados;
DROP POLICY IF EXISTS "Users can read own profile" ON public.advogados;
DROP POLICY IF EXISTS "Users can update own profile" ON public.advogados;

DROP POLICY IF EXISTS asaas_customers_own_read ON public.asaas_customers;
DROP POLICY IF EXISTS audit_logs_own_read ON public.audit_logs;
DROP POLICY IF EXISTS credit_balances_own_read ON public.credit_balances;
DROP POLICY IF EXISTS credit_transactions_own_read ON public.credit_transactions;
DROP POLICY IF EXISTS payments_own_read ON public.payments;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. CRON JOB OPTIMIZATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- 4A. Remove the broken cleanup_storage_files cron (job 4)
-- It tries DELETE FROM storage.objects which Supabase blocks.
-- Generates hourly errors: "Direct deletion from storage tables is not allowed"
SELECT cron.unschedule(4);

-- 4B. Reschedule recover_stuck_atas from every 5 min to every 15 min
-- The function looks for atas stuck > 30 min, so checking every 5 min is wasteful
SELECT cron.unschedule(3);

SELECT cron.schedule(
  'recover-stuck-atas',
  '*/15 * * * *',
  $$SELECT public.recover_stuck_atas()$$
);
