-- ============================================================================
-- Migration: Fix recover_stuck_atas timeout (30 min → 60 min)
-- 
-- PROBLEM: The recover_stuck_atas() function kills any ata with updated_at 
-- older than 30 minutes. But the pipeline timeout allows up to 50 minutes
-- for large documents (500+ pages). This causes legitimate jobs to be
-- killed before completion.
--
-- FIX: Increase the inactivity threshold to 60 minutes (above the max 
-- pipeline timeout of 50 minutes). Combined with the new heartbeat 
-- mechanism in the Python backend, this ensures that:
-- 1. Active jobs are NEVER killed (heartbeat refreshes updated_at every 2 min)
-- 2. Truly stuck jobs are detected within 60 minutes
--
-- ROLLBACK: Change '60 minutes' back to '30 minutes' in the function below
-- ============================================================================

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
