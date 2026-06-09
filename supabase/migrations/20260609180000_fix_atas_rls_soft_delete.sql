-- ================================================================
-- Migration: fix_atas_rls_soft_delete
-- Data: 2026-06-09
-- Motivo: A policy atas_update tinha WITH CHECK que incluia
--         deleted_at IS NULL, impedindo que o soft delete (UPDATE
--         que define deleted_at) funcionasse via user token.
--         Agora o WITH CHECK apenas garante ownership (advogado_id),
--         sem bloquear a transição de deleted_at de NULL para um valor.
-- ================================================================

DROP POLICY IF EXISTS "atas_update" ON atas;

CREATE POLICY "atas_update" ON atas
  FOR UPDATE
  USING  (advogado_id = auth.uid())
  WITH CHECK (advogado_id = auth.uid());
