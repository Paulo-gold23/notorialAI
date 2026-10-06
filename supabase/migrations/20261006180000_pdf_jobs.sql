-- Async PDF generation jobs. State lives in the DB so any uvicorn worker can answer status polls.
-- Written and read only by the API through the service-role key (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.pdf_jobs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_id        uuid NOT NULL,
    advogado_id   uuid NOT NULL,
    status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'generating', 'ready', 'error')),
    step          text,
    result        jsonb,
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdf_jobs_ata_idx ON public.pdf_jobs (ata_id, created_at DESC);

ALTER TABLE public.pdf_jobs ENABLE ROW LEVEL SECURITY;
