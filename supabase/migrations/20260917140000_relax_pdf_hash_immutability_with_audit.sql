-- ============================================================
-- Migration: Relax pdf_hash immutability + audit trail
-- ============================================================
-- CONTEXT: The original trigger (Sprint 4) blocked ALL changes to pdf_hash
-- after first write. This caused silent failures when users regenerated PDFs,
-- leaving stale hashes in the database and breaking public hash verification.
--
-- CHANGE: Allow pdf_hash updates but log every change to audit_logs.
-- zip_hash remains strictly immutable (no change).
-- ============================================================

-- Replace the protection function with audited version
CREATE OR REPLACE FUNCTION public.protect_ata_hashes()
RETURNS TRIGGER AS $$
BEGIN
  -- zip_hash: STRICTLY IMMUTABLE (no change from original behavior)
  IF OLD.zip_hash IS NOT NULL AND NEW.zip_hash IS DISTINCT FROM OLD.zip_hash THEN
    RAISE EXCEPTION 'Violação de Integridade: O hash do arquivo-fonte (zip_hash) é imutável após registrado.';
  END IF;

  -- pdf_hash: ALLOW UPDATE with mandatory audit trail
  -- This accommodates legitimate regenerations (content edits + new PDF export)
  -- while maintaining full traceability for forensic/legal purposes.
  IF OLD.pdf_hash IS NOT NULL AND NEW.pdf_hash IS DISTINCT FROM OLD.pdf_hash THEN
    INSERT INTO public.audit_logs (
      advogado_id,
      acao,
      ip_address,
      user_agent,
      device_fingerprint,
      payload
    ) VALUES (
      NEW.advogado_id,
      'pdf_hash_updated',
      'system_trigger',
      'trg_protect_ata_hashes',
      'database_trigger',
      jsonb_build_object(
        'ata_id', NEW.id,
        'old_pdf_hash', OLD.pdf_hash,
        'new_pdf_hash', NEW.pdf_hash,
        'reason', 'PDF regenerated — hash updated with audit trail',
        'timestamp', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself doesn't need to be recreated since we're using
-- CREATE OR REPLACE FUNCTION — the existing trigger automatically
-- picks up the new function body.
