-- ============================================================
-- Sprint 2: Consent Infrastructure
-- 100% ADDITIVE — creates new tables/columns only
-- ============================================================

-- 1. Table: terms_versions
CREATE TABLE IF NOT EXISTS public.terms_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('terms', 'privacy', 'responsibility')),
    version TEXT NOT NULL,
    content_hash TEXT,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(type, version)
);

COMMENT ON TABLE public.terms_versions IS 'Versionamento de Termos de Uso, Política de Privacidade e Termo de Responsabilidade. Cada atualização cria nova row.';

-- Seed com versões atuais
INSERT INTO public.terms_versions (type, version, effective_date) VALUES
('terms', '2.3', '2026-01-01'),
('privacy', '2.3', '2026-01-01'),
('responsibility', '2.3', '2026-01-01')
ON CONFLICT (type, version) DO NOTHING;

-- RLS: leitura pública (frontend precisa checar versão atual)
ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terms_versions_select_all" ON public.terms_versions FOR SELECT USING (true);

-- 2. Table: consent_records
CREATE TABLE IF NOT EXISTS public.consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES public.advogados(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'responsibility', 'marketing')),
    terms_version_id UUID REFERENCES public.terms_versions(id),
    ip_address TEXT,
    user_agent TEXT,
    device_fingerprint TEXT,
    ata_id UUID REFERENCES public.atas(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consent_records IS 'Registro granular de cada consentimento do usuário com IP, fingerprint, versão e timestamp. LGPD compliance.';

CREATE INDEX IF NOT EXISTS idx_consent_records_advogado ON public.consent_records(advogado_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_type ON public.consent_records(advogado_id, consent_type);

-- RLS: cada advogado vê apenas os seus
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent_records_select_own" ON public.consent_records FOR SELECT USING (advogado_id = auth.uid());
CREATE POLICY "consent_records_insert_service" ON public.consent_records FOR INSERT WITH CHECK (true);

-- 3. New column on advogados: marketing_consent
ALTER TABLE public.advogados ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false;

-- 4. Reactivate credit packages
UPDATE public.credit_packages SET is_active = true WHERE is_active = false;

-- 5. Add expires_at column to credit_balances for 180-day expiration
ALTER TABLE public.credit_balances ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '180 days');

-- Set existing balances to expire 180 days from now (generous for existing users)
UPDATE public.credit_balances SET expires_at = now() + interval '180 days' WHERE expires_at IS NULL;
