# Plano de Implementação: Sistema de Pagamento, Créditos e Monetização

**Projeto:** LegisVox — Sistema de Pagamento com Asaas + Créditos por Página  
**Data:** 09/04/2026  
**Gateway:** Asaas  
**Modelo:** Créditos pré-pagos (1 crédito = 1 página)

---

## Visão Geral

Implementar um sistema completo de monetização para o LegisVox, onde advogados compram pacotes de créditos e cada página gerada consome 1 crédito. O processamento cobra **antes** da geração via estimativa inteligente, com reconciliação automática após a geração real do PDF.

### Nomenclatura

```
1 CRÉDITO = 1 PÁGINA do documento final

Comprou 60 créditos = pode gerar até 60 páginas
Ata gerou 12 páginas = consumiu 12 créditos
```

Na interface, sempre exibir: "💰 38 créditos (38 páginas)"

---

## Decisões Confirmadas

| Item | Decisão |
|------|---------|
| Gateway | **Asaas** (foco Brasil, NF integrada, taxas menores) |
| Modelo | **Créditos pré-pagos** (1 crédito = 1 página) |
| Pricing | **Opção C** — pacotes por perfil de advogado |
| Trial | **1 ata grátis** (sem limite de páginas, única vez) |
| Expiração | **6 meses** após a compra (FIFO) |
| CPF/CNPJ | **No cadastro inicial** do advogado |
| Métrica de estimativa | Contagem de caracteres pós-parsing |
| Reconciliação | Subestimou → absorve custo. Superestimou → devolve créditos |

---

## Pacotes de Créditos (Opção C — Por Perfil)

| Pacote | Créditos (páginas) | Preço | R$/página | Economia | Perfil alvo |
|--------|-------------------|-------|-----------|----------|-------------|
| **Experimentar** | 8 créditos (8 págs) | R$35,00 | R$4,38 | — | _"Conheça o LegisVox"_ |
| **Advogado Solo** | 25 créditos (25 págs) | R$199,90 | R$8,00 | — | _"Para quem trabalha por conta"_ |
| **Equipe Jurídica** ⭐ | 60 créditos (60 págs) | R$389,90 | R$6,50 | 19% | _"Para pequenos escritórios"_ |
| **Escritório Pro** | 150 créditos (150 págs) | R$899,90 | R$6,00 | 25% | _"Demanda recorrente"_ |
| **Enterprise** | 400 créditos (400 págs) | R$1.999,90 | R$5,00 | 38% | _"Volume e economia máxima"_ |

### Métricas de valor por pacote

| Pacote | Tempo manual equivalente | Custo humano equivalente | Economia vs. humano |
|--------|-------------------------|-------------------------|-------------------|
| Experimentar (8 págs) | ~3h | R$30-55 | Comparável |
| Advogado Solo (25 págs) | ~10h | R$150-300 | 25-30% |
| Equipe Jurídica (60 págs) | ~20h | R$400-750 | 35-45% |
| Escritório Pro (150 págs) | ~50h | R$960-1.800 | 45-50% |
| Enterprise (400 págs) | ~130h | R$2.640-4.950 | 55-60% |

---

## Comparativo: Humano vs. LegisVox

### Cenário de referência: ata típica de 12 páginas (200 msgs + 10 áudios + 5 imagens)

| Métrica | 👤 Humano manual | 🤖 LegisVox |
|---------|-----------------|-------------|
| **Tempo por ata** | ~4 horas | ~3 minutos |
| **Velocidade** | — | **80x mais rápido** |
| **Custo (funcionário)** | R$55-150 | R$60-120 (créditos) |
| **Custo (cartório)** | R$300-800+ | R$60-120 |
| **Custo do tempo do advogado** | R$600-1.200 (4h × R$150-300/h) | ~R$0 (3 min) |
| **Erros de transcrição** | Frequentes (cansaço) | Raros (IA) |
| **Disponibilidade** | Horário comercial | 24/7 |
| **Escala (10 atas/mês)** | 40h de trabalho | 30 min total |

### Tempos de processamento LegisVox (média)

| Etapa | Tempo |
|-------|-------|
| Upload + Parse do ZIP | ~3-5 seg |
| Estimativa de páginas | ~1 seg |
| Transcrição de áudios (Groq) | ~15-30 seg |
| Organização com IA (OpenAI) | ~1-3 min |
| Geração de PDF (Gotenberg) | ~5-10 seg |
| **Total** | **~2-4 minutos** |

---

## Algoritmo de Estimativa de Páginas

A estimativa acontece **após o parsing do ZIP** (etapa gratuita e rápida ~2s).

### Fórmula

```python
def estimate_pages(parsed_data: dict, audio_file_sizes: dict) -> int:
    """
    Métricas base:
    - ~3.000 caracteres por página A4 (formatação jurídica)
    - Áudios: ~12.5 chars/segundo (750 chars/min de fala)
    - Opus: ~16KB/segundo
    - Fator de expansão da IA: ~1.4x
    - Imagens: ~0.5 página por imagem
    """
    
    # 1. Caracteres de texto puro
    text_chars = sum(
        len(msg.get("conteudo", ""))
        for msg in parsed_data.get("mensagens", [])
        if msg.get("tipo") == "texto"
    )
    
    # 2. Caracteres estimados de transcrição de áudio
    audio_chars = 0
    for msg in parsed_data.get("mensagens", []):
        if msg.get("tipo") != "audio":
            continue
        filename = msg.get("arquivo", "")
        file_size = audio_file_sizes.get(filename, 0)
        if file_size > 0:
            estimated_seconds = file_size / 16_000
            audio_chars += int(estimated_seconds * 12.5)
        else:
            audio_chars += 375  # fallback: ~30s
    
    # 3. Expansão da IA (headers, formatação jurídica)
    total_chars = (text_chars + audio_chars) * 1.4
    
    # 4. Imagens (cada uma ≈ 0.5 página)
    image_pages = parsed_data.get("total_imagens", 0) * 0.5
    
    # 5. Cálculo final
    text_pages = total_chars / 3000
    estimated_pages = math.ceil(text_pages + image_pages)
    
    return max(1, estimated_pages)
```

### Por que é confiável

1. Não depende do tamanho do ZIP — opera nos dados já filtrados por data
2. Estimativa de áudio por tamanho real do arquivo
3. Arredondamento para cima (margem de segurança)
4. Reconciliação pós-geração corrige qualquer erro

---

## Fluxo Completo

### Etapa 1: Trial (primeiro acesso)

```
Advogado cria conta (com CPF/CNPJ)
    → trial_used = false
    → Primeiro upload: "🎁 Sua primeira ata é GRÁTIS!"
    → Processa sem cobrar
    → trial_used = true
    → Próximas atas exigem créditos
```

### Etapa 2: Upload com créditos (fluxo em 2 fases)

```
FASE 1 — Parse (grátis, ~2 seg)
    Upload ZIP → filtro de datas → parse
    → Sistema retorna estimativa:
      { ata_id, estimated_pages: 14, balance: 38, is_trial: false }
    → Tela mostra EstimationGate

FASE 2 — Confirmar + Processar (cobra créditos)
    Advogado clica "Confirmar e Processar"
    → Debita 14 créditos (saldo: 38 → 24)
    → Pipeline: transcrição → IA → PDF
    → PDF real: 12 páginas
    → Reconciliação: devolve 2 créditos (saldo: 24 → 26)
```

### Etapa 3: Compra de créditos

```
Advogado clica "Comprar Créditos"
    → Seleciona pacote (ex: Equipe Jurídica — 60 créditos)
    → Escolhe forma de pagamento (PIX / Boleto / Cartão)
    → PIX: QR Code + copia-e-cola
    → Paga via app do banco
    → Asaas envia webhook: "PAYMENT_CONFIRMED"
    → Sistema adiciona 60 créditos (expiram em 6 meses)
```

### Diagrama end-to-end

```
ADVOGADO                    LEGISVOX                   ASAAS
   │                            │                        │
   │─── Upload ZIP ────────────▶│                        │
   │                            │── parse_whatsapp_zip() │
   │                            │── estimate_pages()     │
   │◀── Estimativa: 12 págs ───│                        │
   │    Saldo: 30 créditos     │                        │
   │                            │                        │
   │─── [Confirmar] ──────────▶│                        │
   │                            │── debit_credits(12)    │
   │                            │── start_pipeline()     │
   │◀── Documento pronto ──────│                        │
   │                            │── get_pdf_pages() → 10 │
   │                            │── refund_credits(2)    │
   │◀── "+2 créditos devolvidos"│                        │
   │                            │                        │
   │─── Comprar Créditos ─────▶│                        │
   │                            │── create_payment() ───▶│
   │◀── QR Code PIX ──────────│◀── payment_data ───────│
   │                            │                        │
   │─── [Paga via PIX] ───────────────────────────────▶│
   │                            │◀── webhook: CONFIRMED ─│
   │                            │── add_credits(60)      │
   │◀── "60 créditos adicionados"│                       │
```

---

## Mudanças no Banco de Dados (Supabase)

### Migration: `add_credits_and_payments`

```sql
-- ═══════════════════════════════════════════
-- PACOTES DE CRÉDITOS
-- ═══════════════════════════════════════════
CREATE TABLE credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(30) NOT NULL UNIQUE,
    credits INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    price_per_page_cents INTEGER NOT NULL,
    description TEXT,
    badge VARCHAR(30),             -- 'mais_popular', 'melhor_custo', null
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO credit_packages (name, slug, credits, price_cents, price_per_page_cents, description, badge, sort_order) VALUES
    ('Experimentar',    'experimentar',    8,   3500,  438, 'Conheça o LegisVox',              NULL,            1),
    ('Advogado Solo',   'advogado-solo',  25,  19990,  800, 'Para quem trabalha por conta',     NULL,            2),
    ('Equipe Jurídica', 'equipe-juridica',60,  38990,  650, 'Para pequenos escritórios',        'mais_popular',  3),
    ('Escritório Pro',  'escritorio-pro', 150, 89990,  600, 'Demanda recorrente',               NULL,            4),
    ('Enterprise',      'enterprise',     400, 199990, 500, 'Volume e economia máxima',         'melhor_custo',  5);

-- ═══════════════════════════════════════════
-- SALDO DE CRÉDITOS DO ADVOGADO
-- ═══════════════════════════════════════════
CREATE TABLE credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id) UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_credit_balance_updated_at
    BEFORE UPDATE ON credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════
-- TRANSAÇÕES DE CRÉDITOS
-- ═══════════════════════════════════════════
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id),
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'purchase', 'debit', 'refund', 'trial', 'expiry'
    )),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    package_id UUID REFERENCES credit_packages(id),
    payment_id UUID,
    ata_id UUID REFERENCES atas(id),
    estimated_pages INTEGER,
    actual_pages INTEGER,
    expires_at TIMESTAMPTZ,
    expired BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_advogado ON credit_transactions(advogado_id);
CREATE INDEX idx_credit_tx_expires ON credit_transactions(expires_at)
    WHERE expired = false AND expires_at IS NOT NULL;

-- ═══════════════════════════════════════════
-- CLIENTE ASAAS
-- ═══════════════════════════════════════════
CREATE TABLE asaas_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id) UNIQUE,
    asaas_customer_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- PAGAMENTOS
-- ═══════════════════════════════════════════
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id),
    asaas_payment_id VARCHAR(255) NOT NULL UNIQUE,
    package_id UUID NOT NULL REFERENCES credit_packages(id),
    amount_cents INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'confirmed', 'received', 'overdue', 'failed', 'refunded'
    )),
    payment_method VARCHAR(20),
    pix_qr_code TEXT,
    pix_copy_paste TEXT,
    boleto_url TEXT,
    invoice_url TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_advogado ON payments(advogado_id);
CREATE INDEX idx_payments_asaas ON payments(asaas_payment_id);

CREATE TRIGGER set_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════
-- ALTERAÇÕES EM TABELAS EXISTENTES
-- ═══════════════════════════════════════════
ALTER TABLE advogados ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(18);
ALTER TABLE advogados ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false;

ALTER TABLE atas ADD COLUMN IF NOT EXISTS estimated_pages INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS actual_pages INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS credits_charged INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_packages_read" ON credit_packages FOR SELECT USING (true);

ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_balance" ON credit_balances FOR ALL USING (advogado_id = auth.uid());

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_transactions" ON credit_transactions FOR ALL USING (advogado_id = auth.uid());

ALTER TABLE asaas_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_asaas_customer" ON asaas_customers FOR ALL USING (advogado_id = auth.uid());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_payments" ON payments FOR ALL USING (advogado_id = auth.uid());
```

---

## Componentes Backend

### [NEW] `notorial-api/services/credits.py`

| Função | Descrição |
|--------|-----------|
| `get_balance(advogado_id)` | Retorna saldo atual |
| `estimate_pages(parsed_data, audio_file_sizes)` | Estima páginas do documento |
| `has_sufficient_credits(advogado_id, pages)` | Verifica saldo suficiente |
| `debit_credits(advogado_id, ata_id, pages)` | Debita créditos (FIFO) |
| `refund_credits(advogado_id, ata_id, estimated, actual)` | Devolve se superestimou |
| `add_credits(advogado_id, package_id, payment_id)` | Adiciona créditos pós-pagamento |
| `check_trial_eligible(advogado_id)` | Verifica trial disponível |
| `use_trial(advogado_id, ata_id)` | Marca trial como usado |
| `expire_credits()` | Job de expiração (FIFO, 6 meses) |
| `get_transactions(advogado_id, limit, offset)` | Histórico paginado |

### [NEW] `notorial-api/services/asaas.py`

| Função | Descrição |
|--------|-----------|
| `get_or_create_customer(advogado_id, nome, email, cpf_cnpj)` | Cria/retorna cliente no Asaas |
| `create_pix_payment(customer_id, amount, desc)` | Gera QR Code PIX |
| `create_boleto_payment(customer_id, amount, desc, due)` | Gera boleto |
| `create_card_payment(customer_id, amount, card_data)` | Cobra no cartão |
| `get_payment_status(asaas_payment_id)` | Consulta status |
| `handle_webhook(event_data)` | Processa webhook |

API: `https://sandbox.asaas.com/api/v3` (sandbox) / `https://api.asaas.com/v3` (produção)

Webhooks: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`

### [NEW] `notorial-api/routers/credits.py`

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/credits/balance` | GET | Saldo atual |
| `/api/credits/packages` | GET | Pacotes disponíveis |
| `/api/credits/transactions` | GET | Histórico (paginado) |
| `/api/credits/purchase` | POST | Iniciar compra |
| `/api/credits/payment/{id}` | GET | Status de pagamento |

### [NEW] `notorial-api/routers/webhooks.py`

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/webhooks/asaas` | POST | Webhook Asaas (validação por token) |

### [MODIFY] `notorial-api/routers/atas.py`

Fluxo em 2 fases:
1. `POST /api/atas/upload` → Parse only → retorna estimativa
2. `POST /api/atas/{id}/confirm-processing` → Debita + processa

### [MODIFY] `notorial-api/main.py`

- Montar routers: `credits`, `webhooks`

### [MODIFY] `.env`

```env
ASAAS_API_KEY=<api_key>
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_TOKEN=<random_secret>
```

---

## Componentes Frontend

### [NEW] `src/pages/Credits.jsx`

Dashboard de créditos:
- Saldo atual em destaque
- Cards dos 5 pacotes com badges e comparativos
- Histórico de transações
- Indicador de expiração

### [NEW] `src/pages/Profile.jsx`

Página de perfil do advogado:

```
┌─────────────────────────────────────────────────┐
│  👤 Perfil                                       │
│                                                   │
│  ┌── Dados Pessoais ──────────────────────┐      │
│  │ 📸 Foto     Dr. João Silva              │      │
│  │              joao@escritorio.com.br      │      │
│  │              OAB/SP 123.456             │      │
│  │              CPF: •••.234.•••-00        │      │
│  │              [✏️ Editar Perfil]          │      │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌── 📊 Uso de Créditos ──────────────────┐      │
│  │  Saldo: 38 créditos (38 páginas)        │      │
│  │  ████████████████░░░░░░  76% restante   │      │
│  │  Pacote: Equipe Jurídica                │      │
│  │  Expira em: 23/10/2026 (178 dias)       │      │
│  │  [💰 Comprar mais créditos]             │      │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌── 📈 Estatísticas ─────────────────────┐      │
│  │  Atas geradas: 8                        │      │
│  │  Total de páginas: 94                   │      │
│  │  Créditos devolvidos: 7                 │      │
│  │  Membro desde: Jan/2026                 │      │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌── ⚙️ Configurações ────────────────────┐      │
│  │  • Notificações por email                │      │
│  │  • Alterar senha                         │      │
│  │  • Tema (claro/escuro)                   │      │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌── ℹ️ Sobre o LegisVox ─────────────────┐      │
│  │  Versão 1.0.0                            │      │
│  │  Termos de uso | Política de privacidade │      │
│  │  Suporte: contato@legisvox.com.br        │      │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### [NEW] `src/components/CreditBalance.jsx`

Widget de saldo na Navbar: "💰 38 créditos (38 págs)" + alerta se saldo < 5

### [NEW] `src/components/PackageCard.jsx`

Card de pacote com nome, créditos, preço, badge, comparativo de economia

### [NEW] `src/components/PaymentModal.jsx`

Modal com abas PIX / Boleto / Cartão + auto-polling de status

### [NEW] `src/components/EstimationGate.jsx`

Gate pós-parsing com estimativa, saldo, e botões de ação

### [MODIFY] `src/pages/Upload.jsx`

Fluxo em 2 fases com EstimationGate

### [MODIFY] `src/pages/Dashboard.jsx`

Widget de saldo + badge trial

### [MODIFY] `src/components/Navbar.jsx`

CreditBalance widget + links para /credits e /profile

### [NEW] `src/services/creditsApi.js`

API client: getBalance, getPackages, getTransactions, purchasePackage, getPaymentStatus

### [MODIFY] Cadastro (Register)

Adicionar campo CPF/CNPJ obrigatório com máscara e validação

---

## Ordem de Execução

| Ordem | Componente | Estimativa |
|-------|-----------|-----------|
| 1 | Migration do banco (tabelas + seed pacotes) | 1h |
| 2 | `services/credits.py` (core + estimador) | 3h |
| 3 | `services/asaas.py` (integração gateway) | 4h |
| 4 | `routers/credits.py` + `routers/webhooks.py` | 2h |
| 5 | Modificar `routers/atas.py` (fluxo 2 fases) | 3h |
| 6 | Modificar cadastro (CPF/CNPJ) | 1h |
| 7 | Frontend: `creditsApi.js` + `Credits.jsx` | 3h |
| 8 | Frontend: `EstimationGate.jsx` + modificar `Upload.jsx` | 3h |
| 9 | Frontend: `PaymentModal.jsx` + `CreditBalance.jsx` | 3h |
| 10 | Frontend: `Profile.jsx` (perfil completo) | 2h |
| 11 | Frontend: modificar `Dashboard.jsx` + `Navbar.jsx` | 1h |
| 12 | Testes + polimento | 3h |
| | **Total estimado** | **~29h** |

---

## Verificação

### Testes Automatizados
```bash
python -m pytest tests/test_credits.py -v
python -m pytest tests/test_asaas.py -v
python -m pytest tests/test_page_estimator.py -v
```

### Testes Manuais
1. **Cadastro:** Novo usuário com CPF/CNPJ → validação → conta criada
2. **Trial:** Upload → trial oferecido → processar grátis → trial esgotado
3. **Compra (Sandbox):** Pacote PIX → webhook → créditos adicionados
4. **Estimativa:** Upload → ~12 páginas → confirmar → debitar → reconciliar
5. **Expiração:** Créditos expirados → job → saldo atualizado
6. **Perfil:** Gauges de uso, estatísticas, edição de dados
