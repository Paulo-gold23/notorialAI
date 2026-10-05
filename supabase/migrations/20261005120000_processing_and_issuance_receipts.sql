-- Receipts: metadata-only, append-only records that survive the 24h atas wipe.
-- Deliberately NO foreign key to atas (the delete-old-atas job must not touch them)
-- and NO advogado_id (receipts must not identify the account).
-- Rollback: DROP TABLE public.pdf_issuance_receipts, public.processing_receipts;
--           DROP FUNCTION public.receipts_block_mutation();

CREATE TABLE IF NOT EXISTS public.processing_receipts (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_ref                  uuid        NOT NULL,
    protocol                 text        NOT NULL,
    received_at              timestamptz NOT NULL DEFAULT now(),
    zip_filename             text,
    zip_hash                 text,
    zip_size_bytes           bigint,
    zip_inventory            jsonb,
    zip_inventory_truncated  boolean     NOT NULL DEFAULT false,
    parser_totals            jsonb,
    audio_stats              jsonb,
    app_version              text,
    openai_model             text,
    transcription_model      text,
    temperature              numeric,
    prompt_hash              text,
    template_version         text
);
CREATE INDEX IF NOT EXISTS idx_processing_receipts_ata_ref ON public.processing_receipts (ata_ref);
CREATE INDEX IF NOT EXISTS idx_processing_receipts_zip_hash ON public.processing_receipts (zip_hash);

CREATE TABLE IF NOT EXISTS public.pdf_issuance_receipts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_ref            uuid        NOT NULL,
    protocol           text        NOT NULL,
    issued_at          timestamptz NOT NULL DEFAULT now(),
    emission_number    integer,
    pdf_hash           text        NOT NULL,
    previous_pdf_hash  text,
    input_html_hash    text,
    annotation_count   integer,
    template_version   text,
    app_version        text,
    UNIQUE (ata_ref, emission_number)
);
CREATE INDEX IF NOT EXISTS idx_pdf_issuance_receipts_pdf_hash ON public.pdf_issuance_receipts (pdf_hash);

CREATE OR REPLACE FUNCTION public.receipts_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'receipts are append-only (% blocked on %)', TG_OP, TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_processing_receipts_immutable ON public.processing_receipts;
CREATE TRIGGER trg_processing_receipts_immutable
    BEFORE UPDATE OR DELETE ON public.processing_receipts
    FOR EACH ROW EXECUTE FUNCTION public.receipts_block_mutation();

DROP TRIGGER IF EXISTS trg_pdf_issuance_receipts_immutable ON public.pdf_issuance_receipts;
CREATE TRIGGER trg_pdf_issuance_receipts_immutable
    BEFORE UPDATE OR DELETE ON public.pdf_issuance_receipts
    FOR EACH ROW EXECUTE FUNCTION public.receipts_block_mutation();

-- Backend-only access (service role bypasses RLS); no policies for anon/authenticated.
ALTER TABLE public.processing_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_issuance_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processing_receipts FROM anon, authenticated;
REVOKE ALL ON public.pdf_issuance_receipts FROM anon, authenticated;
