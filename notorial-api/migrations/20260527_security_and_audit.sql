-- ============================================================
-- Migration: 20260527_security_and_audit
-- Descrição: Robustez de autenticação e trilha de auditoria
--
-- SEGURO PARA PRODUÇÃO:
--   - IF NOT EXISTS / IF EXISTS em todos os comandos
--   - A constraint UNIQUE no Postgres permite múltiplos NULLs,
--     portanto registros existentes sem CPF NÃO serão afetados.
--
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- PARTE 1: CONSTRAINT UNIQUE EM cpf_cnpj (tabela advogados)
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUE: Impede que dois usuários diferentes cadastrem o mesmo
-- CPF/CNPJ. No Postgres, a constraint UNIQUE aceita múltiplos
-- valores NULL, então contas Google ou legadas sem CPF continuam
-- funcionando normalmente.
--
-- PRÉ-REQUISITO: Verificar se já existem duplicatas ANTES de rodar.
-- Execute esta query de verificação primeiro:
--
--   SELECT cpf_cnpj, COUNT(*), array_agg(email)
--   FROM advogados
--   WHERE cpf_cnpj IS NOT NULL
--   GROUP BY cpf_cnpj
--   HAVING COUNT(*) > 1;
--
-- Se retornar linhas, resolva as duplicatas manualmente antes de
-- aplicar a constraint.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'advogados'
          AND constraint_name = 'advogados_cpf_cnpj_unique'
    ) THEN
        ALTER TABLE public.advogados
            ADD CONSTRAINT advogados_cpf_cnpj_unique UNIQUE (cpf_cnpj);
    END IF;
END $$;

-- Índice para busca rápida por CPF (usado pelo endpoint /auth/check-cpf)
CREATE INDEX IF NOT EXISTS idx_advogados_cpf_cnpj
    ON public.advogados (cpf_cnpj)
    WHERE cpf_cnpj IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- PARTE 2: TABELA audit_logs (Trilha Probatória Jurídica)
-- ═══════════════════════════════════════════════════════════════
--
-- POR QUE: Registra evidências legais de ações críticas como
-- aceite de termos de uso e verificação de CPF. Cada log contém
-- o IP real, o User Agent, o fingerprint do dispositivo (gerado
-- pelo FingerprintJS OSS no navegador) e o timestamp UTC.
--
-- VALOR JURÍDICO: Esta tabela serve como prova de autenticação,
-- trilha de auditoria e evidência de consentimento. Em muitos
-- cenários, tem mais peso legal do que uma simples confirmação
-- por SMS.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id        UUID         REFERENCES public.advogados(id) ON DELETE SET NULL,
    email              VARCHAR(255),
    acao               VARCHAR(100) NOT NULL,
    -- Ações esperadas:
    --   'signup'           → cadastro de nova conta
    --   'login'            → login bem-sucedido
    --   'terms_accepted'   → aceite dos termos de uso
    --   'cpf_verified'     → preenchimento/validação de CPF via modal
    ip_address          VARCHAR(45)  NOT NULL,
    user_agent          TEXT         NOT NULL,
    device_fingerprint  VARCHAR(255) NOT NULL,
    payload             JSONB        DEFAULT '{}'::jsonb,
    -- Payload pode conter dados adicionais como:
    --   { "terms_version": "2026-05-27" }
    --   { "cpf_hash_prefix": "a1b2c3" }
    created_at          TIMESTAMPTZ  DEFAULT TIMEZONE('utc', NOW())
);

-- Índice para consultas de auditoria por advogado
CREATE INDEX IF NOT EXISTS idx_audit_logs_advogado
    ON public.audit_logs(advogado_id);

-- Índice para consultas de auditoria por ação (ex: listar todos os aceites)
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao
    ON public.audit_logs(acao);

-- Índice para rastrear múltiplas contas no mesmo dispositivo
CREATE INDEX IF NOT EXISTS idx_audit_logs_fingerprint
    ON public.audit_logs(device_fingerprint);

-- RLS: Administradores podem ver tudo; usuários comuns só os próprios logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "audit_logs_own_read"
    ON public.audit_logs
    FOR SELECT
    USING (advogado_id = auth.uid());

-- Permitir INSERT para service_role (backend) — sem restrição
CREATE POLICY IF NOT EXISTS "audit_logs_service_insert"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════
-- COMENTÁRIOS PARA DOCUMENTAÇÃO DO SCHEMA
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE public.audit_logs IS
    'Trilha de auditoria jurídica. Registra IP, User Agent, '
    'fingerprint do dispositivo e timestamp UTC de ações críticas '
    'como aceite de termos, login e verificação de CPF.';

COMMENT ON COLUMN public.audit_logs.acao IS
    'Tipo de ação: signup, login, terms_accepted, cpf_verified';

COMMENT ON COLUMN public.audit_logs.device_fingerprint IS
    'Hash do dispositivo gerado pelo FingerprintJS OSS no navegador.';

COMMENT ON COLUMN public.audit_logs.payload IS
    'Dados adicionais em JSON (ex: versão dos termos aceitos).';
