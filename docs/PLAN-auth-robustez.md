# PLAN-auth-robustez.md
> **Projeto:** LegisVox v2.3 — Robustez do Sistema de Autenticação
> **Data:** 2026-05-12
> **Status:** 🟡 Aguardando implementação
> **Slug:** `auth-robustez`

---

## 📋 Visão Geral

O sistema de autenticação do LegisVox apresenta três lacunas críticas identificadas em testes:

| Problema | Impacto | Severidade |
|----------|---------|-----------|
| **CPF/CNPJ duplicado** — sem constraint UNIQUE, o mesmo CPF pode ser usado por múltiplos usuários | Fraude de identidade, créditos duplicados, violação de LGPD | 🔴 CRÍTICO |
| **Ausência de Login Social** — apenas email/senha, abaixo do padrão de mercado | Atrito desnecessário no onboarding | 🟡 MÉDIO |
| **Sem aceite de Termos no 1º login** — usuários usam o sistema sem consentimento explícito registrado | Risco jurídico/LGPD, especialmente crítico para um app jurídico | 🔴 CRÍTICO |

---

## 🎯 Critérios de Sucesso

- [ ] Tentativa de cadastro com CPF já existente retorna erro claro, sem criar conta duplicada
- [ ] Login com Google funciona e cria perfil completo na tabela `advogados`
- [ ] Usuário sem `terms_accepted_at` vê modal de Termos obrigatório antes de usar o app
- [ ] Nenhuma regressão no fluxo existente de email/senha
- [ ] CPF/CNPJ armazenado com hash seguro (sem plaintext reversível no banco)

---

## 🏗️ Tipo de Projeto

**WEB FULL-STACK** — React (Vite) + FastAPI + Supabase (PostgreSQL)

---

## 🔧 Stack Envolvida

| Camada | Tecnologia | Relevante |
|--------|-----------|----------|
| Frontend | React + Vite (HashRouter) | `Login.jsx`, `App.jsx` |
| Auth Provider | Supabase Auth | `signUp`, `signInWithPassword`, OAuth Google |
| Backend | FastAPI (Python) | Novo endpoint de verificação CPF |
| Banco | PostgreSQL (Supabase) | Tabela `advogados`, constraint UNIQUE |
| Secrets | `.env` / Supabase Dashboard | Google OAuth credentials |

---

## 📊 Estrutura Atual de Dados (Tabela `advogados`)

```
id            UUID (PK, FK → auth.users)
nome          VARCHAR
oab           VARCHAR (nullable)
email         VARCHAR
cpf_cnpj      VARCHAR  ← atualmente: base64 simples (btoa), SEM constraint UNIQUE
status        TEXT     default 'aprovado'
is_admin      BOOLEAN
trial_used    BOOLEAN
created_at    TIMESTAMPTZ
```

> ⚠️ **Problema identificado:** `cpf_cnpj` não tem constraint UNIQUE nem hash seguro. O `btoa()` é reversível e não oferece proteção real.

---

## 📁 Arquivos Afetados

```
notorial-web/
  src/
    pages/
      Login.jsx                  ← modificar (Google OAuth + fluxo termos)
    components/
      TermsAcceptanceModal.jsx   ← NOVO
    hooks/
      useTermsCheck.jsx          ← NOVO
    App.jsx                      ← modificar (gate de termos)
    services/
      supabase.js                ← sem modificação

notorial-api/
  routers/
    auth.py                      ← NOVO router
  main.py                        ← incluir router

supabase/
  migrations/
    20260512_auth_robustez.sql   ← NOVO
```

---

## 🗂️ Task Breakdown

### FASE 0 — BANCO DE DADOS (Bloqueante para tudo)

---

#### TASK-01: Migração SQL — Constraint UNIQUE + Campo `terms_accepted_at`

| Campo | Valor |
|-------|-------|
| **Agent** | `database-architect` |
| **Skill** | `database-design`, `database-migrations-sql-migrations` |
| **Priority** | P0 — Bloqueante |
| **Dependências** | Nenhuma |

**Por que:** Sem constraint no banco, validações no frontend/backend são bypassáveis. A segurança real é no banco.

**INPUT:**
- Schema atual da tabela `advogados` (sem UNIQUE em `cpf_cnpj`)
- 9 registros existentes que podem ter CPFs duplicados

**OUTPUT:**
```sql
-- 1. Adicionar campo para rastrear aceite de termos
ALTER TABLE public.advogados
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR DEFAULT NULL;

-- 2. Adicionar campo para auth_provider (rastrear Google vs email)
ALTER TABLE public.advogados
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'email';

-- 3. Limpar dados antes da constraint (verificar duplicatas)
-- EXECUTAR ANTES: SELECT cpf_cnpj, COUNT(*) FROM advogados GROUP BY cpf_cnpj HAVING COUNT(*) > 1;

-- 4. Criar constraint UNIQUE no CPF/CNPJ (após deduplicação)
ALTER TABLE public.advogados
  ADD CONSTRAINT advogados_cpf_cnpj_unique UNIQUE (cpf_cnpj);

-- 5. Criar índice para busca rápida por CPF
CREATE INDEX IF NOT EXISTS idx_advogados_cpf_cnpj ON public.advogados (cpf_cnpj);
```

**VERIFY:**
```sql
-- Constraint existe
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'advogados' AND constraint_type = 'UNIQUE';
-- Colunas novas existem
SELECT column_name FROM information_schema.columns
WHERE table_name = 'advogados' AND column_name IN ('terms_accepted_at', 'auth_provider');
```

> ⚠️ **ATENÇÃO antes de executar:** Rodar `SELECT cpf_cnpj, COUNT(*), array_agg(email) FROM advogados GROUP BY cpf_cnpj HAVING COUNT(*) > 1;` para identificar e resolver duplicatas manuais antes.

---

### FASE 1 — BACKEND (Verificação Server-Side de CPF)

---

#### TASK-02: Novo Endpoint FastAPI — Verificação de CPF/CNPJ

| Campo | Valor |
|-------|-------|
| **Agent** | `backend-specialist` |
| **Skill** | `api-patterns`, `nodejs-best-practices` |
| **Priority** | P1 |
| **Dependências** | TASK-01 |

**Por que:** Validar CPF apenas no frontend é insuficiente — qualquer request direto à Supabase bypassa. O backend deve ser o guardião.

**INPUT:**
- `notorial-api/routers/` (estrutura atual com `atas.py`, `credits.py`)
- `notorial-api/database.py` (cliente Supabase admin)

**OUTPUT:** Novo arquivo `notorial-api/routers/auth.py`

```python
# Endpoint: POST /auth/check-cpf
# Body: { "cpf_cnpj_hash": "<sha256_do_cpf_normalizado>" }
# Response 200: { "available": true }
# Response 409: { "available": false, "message": "CPF/CNPJ já cadastrado." }
```

**Lógica:**
1. Receber o hash SHA-256 do CPF/CNPJ (normalizado, apenas dígitos)
2. Consultar `advogados` via `supabase_admin` para `cpf_cnpj = hash`
3. Retornar `available: true/false`

**VERIFY:**
```bash
# CPF não cadastrado → 200 { available: true }
curl -X POST http://localhost:8000/auth/check-cpf -H "Content-Type: application/json" -d '{"cpf_cnpj_hash": "hash_inexistente"}'
# CPF cadastrado → 409
curl -X POST http://localhost:8000/auth/check-cpf -H "Content-Type: application/json" -d '{"cpf_cnpj_hash": "hash_existente"}'
```

---

#### TASK-03: Atualizar Registro de Usuário — Hash SHA-256 em vez de btoa

| Campo | Valor |
|-------|-------|
| **Agent** | `security-auditor` |
| **Skill** | `vulnerability-scanner` |
| **Priority** | P1 |
| **Dependências** | TASK-01, TASK-02 |

**Por que:** `btoa()` é apenas encoding base64 — completamente reversível. CPF é dado sensível LGPD. Deve ser hashed com SHA-256 (sem sal, para permitir busca por igualdade).

**INPUT:** `Login.jsx` (linha 82: `const encodedCpfCnpj = btoa(rawCpf)`)

**OUTPUT:**
```javascript
// Substituir btoa por SHA-256 via Web Crypto API
const hashCpf = async (cpfRaw) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(cpfRaw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};
```

> 📝 **Nota de migração:** Os 9 registros existentes com `btoa` precisarão de migração one-shot no banco (script Python separado para converter btoa → SHA-256).

**VERIFY:**
- Cadastrar novo usuário → `cpf_cnpj` no banco é string hex de 64 chars (SHA-256)
- Tentar cadastrar mesmo CPF → erro 409 do backend

---

### FASE 2 — FRONTEND: Validação de CPF Único no Cadastro

---

#### TASK-04: Verificação de CPF Antes do signUp

| Campo | Valor |
|-------|-------|
| **Agent** | `frontend-specialist` |
| **Skill** | `clean-code`, `frontend-patterns` |
| **Priority** | P2 |
| **Dependências** | TASK-02, TASK-03 |

**Por que:** UX melhor ao verificar CPF antes de tentar criar auth user — o usuário recebe feedback antes de qualquer operação no Supabase Auth.

**INPUT:** `Login.jsx` — função `handleSubmit`, bloco `isRegister`

**OUTPUT:** Fluxo atualizado do `handleSubmit`:
```
1. Validar formato CPF/CNPJ (já existe)
2. Calcular SHA-256 do CPF
3. POST /auth/check-cpf → se 409: mostrar erro "CPF/CNPJ já cadastrado"
4. Continuar com supabase.auth.signUp (apenas se CPF disponível)
5. INSERT em advogados com cpf_cnpj = hash SHA-256
```

**VERIFY:**
- [ ] CPF duplicado → erro visível antes de criar conta
- [ ] CPF novo → fluxo normal de cadastro
- [ ] Erro de rede no check → fallback gracioso (deixar continuar, o banco rejeita)

---

### FASE 3 — FRONTEND + SUPABASE: Login com Google

---

#### TASK-05: Configurar Google OAuth no Supabase Dashboard

| Campo | Valor |
|-------|-------|
| **Agent** | `security-auditor` |
| **Skill** | `deployment-procedures` |
| **Priority** | P3 |
| **Dependências** | Nenhuma (paralelo com FASE 0-2) |

**Por que:** Configuração no Supabase e Google Cloud Console deve ser feita antes da implementação no código.

**Passos manuais:**

```
Google Cloud Console:
1. APIs & Services → Credentials → Create "OAuth 2.0 Client ID" (Web Application)
2. Authorized redirect URIs:
   - https://wnzypjivefdsefrmghzf.supabase.co/auth/v1/callback
   - http://localhost:5173
3. Copiar: Client ID e Client Secret

Supabase Dashboard → Authentication → Providers → Google:
4. Habilitar Google → Colar Client ID e Client Secret → Salvar

Supabase → Authentication → URL Configuration:
5. Site URL: https://legisvox.com
6. Redirect URLs: adicionar http://localhost:5173
```

**VERIFY:**
- Supabase Dashboard → Google provider aparece como "Enabled"

---

#### TASK-06: Botão "Entrar com Google" no Login.jsx

| Campo | Valor |
|-------|-------|
| **Agent** | `frontend-specialist` |
| **Skill** | `frontend-design`, `clean-code` |
| **Priority** | P3 |
| **Dependências** | TASK-05 |

**Por que:** Interface OAuth padrão de mercado. Supabase já gerencia o redirect/callback.

**INPUT:** `Login.jsx` (formulário existente)

**OUTPUT:**
```jsx
// Separador "ou" + Botão Google com ícone SVG oficial
const handleGoogleLogin = async () => {
  setLoading(true);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/#/dashboard` }
  });
  if (error) setError(error.message);
  setLoading(false);
};
```

**VERIFY:**
- [ ] Clicar em "Entrar com Google" abre redirect do Google
- [ ] Após autenticação → redirecionado para /#/dashboard
- [ ] Usuário Google novo → conta criada automaticamente

---

#### TASK-07: Tratar Usuário Google sem Perfil — Criação Automática

| Campo | Valor |
|-------|-------|
| **Agent** | `frontend-specialist` |
| **Skill** | `frontend-patterns` |
| **Priority** | P3 |
| **Dependências** | TASK-05, TASK-06 |

**Por que:** Usuário Google não preencheu CPF no cadastro. O perfil deve ser criado automaticamente com dados mínimos.

**INPUT:** `App.jsx` — `checkApprovalStatus`

**OUTPUT:**
```javascript
// Se não existe registro em advogados → criar automaticamente
if (!data) {
  await supabase.from('advogados').insert({
    id: currentSession.user.id,
    nome: currentSession.user.user_metadata?.full_name || '',
    email: currentSession.user.email,
    status: 'aprovado',
    auth_provider: 'google',
    cpf_cnpj: null
  });
}
```

**VERIFY:**
- [ ] Login Google → linha criada em `advogados` com `auth_provider = 'google'`
- [ ] CPF null não quebra o fluxo

---

### FASE 4 — MODAL DE TERMOS NO PRIMEIRO ACESSO

---

#### TASK-08: Componente `TermsAcceptanceModal.jsx`

| Campo | Valor |
|-------|-------|
| **Agent** | `frontend-specialist` |
| **Skill** | `frontend-design`, `clean-code` |
| **Priority** | P4 |
| **Dependências** | TASK-01 (campo `terms_accepted_at`) |

**Por que:** Conformidade LGPD e contratual. Especialmente crítico em app jurídico.

**OUTPUT:** Modal de tela cheia não-dispensável:
```
├── Título: "Termos de Uso e Política de Privacidade"
├── Área com resumo dos termos + links para /terms e /privacy
├── Checkbox: "Li e aceito os Termos de Uso" (obrigatório)
├── Checkbox: "Li e aceito a Política de Privacidade" (obrigatório)
└── Botão "Confirmar e Continuar" (habilitado só com ambos marcados)
```

```javascript
// Ao aceitar:
await supabase.from('advogados').update({
  terms_accepted_at: new Date().toISOString(),
  terms_version: '2026-05-12'
}).eq('id', userId);
```

**VERIFY:**
- [ ] Modal não fecha sem aceite (sem ESC, sem click fora)
- [ ] Botão desabilitado sem checkboxes
- [ ] `terms_accepted_at` preenchido no banco após aceite
- [ ] Modal não reaparece em sessões seguintes

---

#### TASK-09: Hook `useTermsCheck.jsx` + Gate no `App.jsx`

| Campo | Valor |
|-------|-------|
| **Agent** | `frontend-specialist` |
| **Skill** | `frontend-patterns`, `clean-code` |
| **Priority** | P4 |
| **Dependências** | TASK-08 |

**Por que:** Gate centralizado funciona para qualquer método de login.

**OUTPUT:**
```javascript
// hooks/useTermsCheck.jsx
export function useTermsCheck(session) {
  const [termsAccepted, setTermsAccepted] = useState(null);
  useEffect(() => {
    if (!session) { setTermsAccepted(null); return; }
    supabase.from('advogados').select('terms_accepted_at').eq('id', session.user.id).single()
      .then(({ data }) => setTermsAccepted(!!data?.terms_accepted_at));
  }, [session]);
  return termsAccepted;
}

// App.jsx — antes das rotas autenticadas:
{session && termsAccepted === false && (
  <TermsAcceptanceModal userId={session.user.id} onAccepted={() => setTermsAccepted(true)} />
)}
```

**VERIFY:**
- [ ] Usuário novo → vê modal antes de qualquer página
- [ ] Usuário existente (com `terms_accepted_at`) → não vê modal
- [ ] Após aceite → acesso normal

---

## 🗓️ Ordem de Execução

```
TASK-01 (DB) → TASK-02 (Backend) → TASK-03 (Hash) → TASK-04 (Frontend CPF check)
TASK-01 (DB) → TASK-08 (Modal Termos) → TASK-09 (Gate App.jsx)
TASK-05 (OAuth Config) → TASK-06 (Botão Google) → TASK-07 (Auto-perfil)
```

**Paralelismo possível:**
- TASK-05 pode ser feita em qualquer momento
- TASK-08 pode ser desenvolvida em paralelo com TASK-04

---

## ⚠️ Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| CPFs duplicados já existentes bloqueiam a constraint UNIQUE | Alto | Rodar query de verificação ANTES; resolver manualmente |
| Usuários Google sem CPF quebram fluxo de NF | Médio | `cpf_cnpj = null` é permitido; solicitar via modal de perfil incompleto depois |
| Usuários existentes sem `terms_accepted_at` veem modal inesperado | Médio | Migration: marcar existentes como aceitos (presumir aceite anterior) |

---

## 🔐 Decisão de Segurança: CPF Hash Strategy

**Escolha: SHA-256 sem sal (hash determinístico)**

| Opção | Prós | Contras |
|-------|------|---------|
| **SHA-256 sem sal** ✅ | Permite constraint UNIQUE; busca por igualdade funciona | Não resiste a rainbow tables (CPF tem espaço limitado) |
| bcrypt com sal | Máxima segurança | UNIQUE constraint não funciona |
| AES simétrico | Reversível | Requer gestão de chave secreta |

> SHA-256 é aceitável para CPF como identificador único em contexto de banco de dados.

---

## 📝 Migration para Usuários Existentes (btoa → SHA-256)

```sql
-- Marcar todos existentes como tendo aceito os termos (versão anterior)
UPDATE public.advogados
SET 
  terms_accepted_at = created_at,
  terms_version = 'pre-2026-05-12',
  auth_provider = 'email'
WHERE terms_accepted_at IS NULL;
```

> Script Python separado será necessário para converter os CPFs de `btoa` para SHA-256 nos 9 registros existentes.

---

## ✅ PHASE X — Checklist de Verificação Final

```
[ ] TASK-01: Colunas novas e constraint UNIQUE existem no banco
[ ] TASK-02: Endpoint /auth/check-cpf retorna 200/409 corretamente
[ ] TASK-03: CPF novo salvo como SHA-256 (64 chars hex) no banco
[ ] TASK-04: Cadastro com CPF duplicado → erro claro ao usuário
[ ] TASK-05: Google provider habilitado no Supabase Dashboard
[ ] TASK-06: Botão "Entrar com Google" funcional na tela de login
[ ] TASK-07: Login Google cria perfil em advogados automaticamente
[ ] TASK-08: Modal de Termos aparece no primeiro acesso
[ ] TASK-09: Gate de Termos funcional para email e Google
[ ] Nenhuma regressão no fluxo email/senha existente
[ ] 9 usuários existentes migrados corretamente
```

---

*Plano criado por `@project-planner` | LegisVox v2.3 | 2026-05-12*
