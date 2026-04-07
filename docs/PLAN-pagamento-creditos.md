# Plano de Implementação: Sistema de Pagamento, Créditos e Monetização

**Projeto:** LegisVox — Sistema de Pagamento com Asaas + Créditos por Página  
**Data:** 07/04/2026  
**Gateway:** Asaas  
**Modelo:** Créditos pré-pagos (1 crédito = 1 página)

---

## Visão Geral

Implementar um sistema completo de monetização para o LegisVox, onde advogados compram pacotes de créditos e cada página gerada consome 1 crédito. O processamento cobra **antes** da geração via estimativa inteligente, com reconciliação automática após a geração real do PDF.

---

## Decisões Aprovadas pelo Usuário

| Item | Decisão |
|------|---------|
| Gateway | **Asaas** (foco Brasil, NF integrada, taxas menores) |
| Modelo de pricing | **Créditos pré-pagos** (Opção B) |
| Valor base | R$10/página (pacote menor) |
| Melhor preço | R$5/página (pacote maior) |
| Gate de pagamento | Estimativa pós-parsing → cobrar → gerar documento |
| Trial | **1 ata grátis** (sem limite de páginas, única vez) |
| Expiração de créditos | **6 meses** após a compra |
| Métrica de estimativa | Contagem de caracteres pós-parsing (não tamanho do ZIP) |

---

## Pacotes de Créditos

| Pacote | Créditos | Preço Total | Preço/Página | Economia |
|--------|----------|-------------|-------------|----------|
| **Inicial** | 10 páginas | R$100 | R$10,00 | — |
| **Avançado** | 30 páginas | R$240 | R$8,00 | 20% |
| **Profissional** | 80 páginas | R$480 | R$6,00 | 40% |
| **Escritório** | 200 páginas | R$1.000 | R$5,00 | 50% |

**Reconciliação de créditos (quando estimativa erra):**
- **Subestimou (real > estimado)**: Absorver o custo extra (negócio paga, gera confiança)
- **Superestimou (real < estimado)**: Devolver créditos automaticamente ao cliente
- O cliente **nunca paga a mais**

---

## Algoritmo de Estimativa de Páginas

A estimativa acontece **após o parsing do ZIP** (etapa gratuita e rápida ~2s), que nos dá dados precisos sobre o conteúdo filtrado.

### Dados disponíveis pós-parsing

```python
# Após parse_whatsapp_zip(), temos:
parsed_data = {
    "mensagens": [...],         # Lista completa de mensagens filtradas por data
    "total_mensagens": 147,     # Contagem exata
    "total_audios": 12,         # Contagem exata de áudios
    "total_imagens": 5,         # Contagem de imagens
    "arquivos_extraidos": {...} # Bytes dos áudios (tamanho real)
}
```

### Fórmula de Estimativa

```python
def estimate_pages(parsed_data: dict, audio_file_sizes: dict) -> int:
    """
    Estima o número de páginas do documento final.
    
    Métricas (baseadas em testes com documentos reais):
    - ~3.000 caracteres por página A4 (com formatação jurídica)
    - Áudios: estima ~12.5 chars/segundo (750 chars/min de fala)
    - Tamanho do áudio opus: ~16KB/segundo
    - Fator de expansão da IA: ~1.4x (headers, formatação, legal language)
    - Imagens: ~0.5 página por imagem inline
    """
    
    # 1. Caracteres de texto puro
    text_chars = sum(
        len(msg.get("conteudo", ""))
        for msg in parsed_data.get("mensagens", [])
        if msg.get("tipo") == "texto"
    )
    
    # 2. Estimativa de caracteres de transcrição de áudio
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
            audio_chars += 375  # fallback: ~30s de áudio
    
    # 3. Fator de expansão da IA (headers, formatação jurídica)
    expansion_factor = 1.4
    total_chars = (text_chars + audio_chars) * expansion_factor
    
    # 4. Páginas de imagens embutidas (cada imagem ≈ 0.5 página)
    image_pages = parsed_data.get("total_imagens", 0) * 0.5
    
    # 5. Cálculo final (arredonda para cima)
    text_pages = total_chars / 3000
    estimated_pages = math.ceil(text_pages + image_pages)
    
    return max(1, estimated_pages)
```

### Por que essa métrica é confiável

1. **Não depende do tamanho do ZIP** — o ZIP pode ter 300MB mas o filtro de datas reduz a 50 mensagens
2. **Contagem real pós-filtro** — opera sobre as mensagens JÁ filtradas por data
3. **Estimativa de áudio por tamanho do arquivo** — muito mais preciso que chute genérico
4. **Margem de segurança** — arredondamento para cima protege contra subestimativa
5. **Reconciliação pós-geração** — se errar, ajusta automaticamente

---

## Mudanças no Banco de Dados (Supabase)

### Migration: `add_credits_tables`

```sql
-- PACOTES DE CRÉDITOS
CREATE TABLE credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(30) NOT NULL UNIQUE,
    credits INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    price_per_page_cents INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO credit_packages (name, slug, credits, price_cents, price_per_page_cents, sort_order) VALUES
    ('Inicial',       'inicial',       10,  10000, 1000, 1),
    ('Avançado',      'avancado',      30,  24000,  800, 2),
    ('Profissional',  'profissional',  80,  48000,  600, 3),
    ('Escritório',    'escritorio',   200, 100000,  500, 4);

-- SALDO DE CRÉDITOS DO ADVOGADO
CREATE TABLE credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id) UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_credit_balance_updated_at
    BEFORE UPDATE ON credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- TRANSAÇÕES DE CRÉDITOS (histórico completo)
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

-- MAPEAMENTO PARA CLIENTE ASAAS
CREATE TABLE asaas_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id) UNIQUE,
    asaas_customer_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REGISTROS DE PAGAMENTO
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

-- ALTERAÇÕES EM TABELAS EXISTENTES
ALTER TABLE advogados ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false;

ALTER TABLE atas ADD COLUMN IF NOT EXISTS estimated_pages INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS actual_pages INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS credits_charged INTEGER;
ALTER TABLE atas ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;

-- RLS POLICIES
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

Serviço core para gerenciamento de créditos:

| Função | Descrição |
|--------|-----------|
| `get_balance(advogado_id)` | Retorna saldo atual |
| `estimate_pages(parsed_data, audio_file_sizes)` | Estima páginas do documento |
| `has_sufficient_credits(advogado_id, pages)` | Verifica se tem créditos suficientes |
| `debit_credits(advogado_id, ata_id, pages)` | Debita créditos e registra transação |
| `refund_credits(advogado_id, ata_id, estimated, actual)` | Devolve se superestimou |
| `add_credits(advogado_id, package_id, payment_id)` | Adiciona créditos pós-pagamento |
| `check_trial_eligible(advogado_id)` | Verifica se trial está disponível |
| `use_trial(advogado_id, ata_id)` | Marca trial como usado |
| `expire_credits()` | Job de expiração (FIFO, 6 meses) |
| `get_transactions(advogado_id, limit, offset)` | Histórico paginado |

### [NEW] `notorial-api/services/asaas.py`

Integração com API do Asaas:

| Função | Descrição |
|--------|-----------|
| `get_or_create_customer(advogado_id, nome, email, cpf_cnpj)` | Cria/retorna cliente no Asaas |
| `create_pix_payment(customer_id, amount, desc)` | Gera QR Code PIX |
| `create_boleto_payment(customer_id, amount, desc, due)` | Gera boleto |
| `create_card_payment(customer_id, amount, card_data)` | Cobra no cartão |
| `get_payment_status(asaas_payment_id)` | Consulta status |
| `handle_webhook(event_data)` | Processa webhook (libera créditos) |

**API Base URL:**
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://api.asaas.com/v3`

**Webhooks críticos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`

### [NEW] `notorial-api/routers/credits.py`

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/credits/balance` | GET | Saldo atual do advogado |
| `/api/credits/packages` | GET | Pacotes disponíveis |
| `/api/credits/transactions` | GET | Histórico (paginado) |
| `/api/credits/purchase` | POST | Iniciar compra (cria pagamento Asaas) |
| `/api/credits/payment/{id}` | GET | Status de pagamento |

### [NEW] `notorial-api/routers/webhooks.py`

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/webhooks/asaas` | POST | Webhook (sem JWT, validação por token) |

### [MODIFY] `notorial-api/routers/atas.py`

Novo fluxo em **2 fases**:

1. **`POST /api/atas/upload`** — Fase 1 (parse only):
   - Faz apenas o parsing do ZIP (rápido, grátis)
   - Retorna `{ ata_id, estimated_pages, balance, is_trial_eligible }`
   
2. **`POST /api/atas/{id}/confirm-processing`** — Novo endpoint:
   - Recebe confirmação do advogado
   - Debita créditos (ou usa trial)
   - Inicia pipeline completo (transcrição → IA → PDF)
   
3. **Pós-PDF**: Reconciliação automática (conta páginas reais do PDF)

### [MODIFY] `notorial-api/main.py`

- Montar novos routers: `credits`, `webhooks`
- Adicionar CORS para webhook Asaas

### [MODIFY] `notorial-api/.env`

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
- Cards de pacotes para compra
- Histórico de transações (tabela)
- Indicador de expiração

### [NEW] `src/components/CreditBalance.jsx`

Widget de saldo para a Navbar:
- Mostra "💰 23 créditos"
- Indicador se saldo baixo (< 5)
- Link para `/credits`

### [NEW] `src/components/PackageCard.jsx`

Card de pacote:
- Nome, quantidade, preço, preço/página
- Badge "Mais popular" / "Melhor custo-benefício"
- Botão de compra

### [NEW] `src/components/PaymentModal.jsx`

Modal com abas PIX / Boleto / Cartão:
- **PIX**: QR Code + copia-e-cola + countdown
- **Boleto**: Link PDF + vencimento
- **Cartão**: Form de dados
- Auto-polling até confirmação

### [NEW] `src/components/EstimationGate.jsx`

Gate pós-parsing, pré-processamento:

```
┌─────────────────────────────────────────┐
│  📊 Estimativa do Documento             │
│                                          │
│  Mensagens: 247                         │
│  Áudios para transcrever: 15            │
│  Imagens: 8                             │
│                                          │
│  📄 Páginas estimadas: ~14 páginas      │
│  💰 Custo: 14 créditos                  │
│  🏦 Seu saldo: 30 créditos             │
│  ✅ Saldo após: 16 créditos             │
│                                          │
│  ⚠️ Se o documento final tiver menos    │
│  páginas, créditos são devolvidos.       │
│                                          │
│  [✅ Confirmar e Processar]              │
│  [💰 Comprar Créditos]                   │
└─────────────────────────────────────────┘
```

### [MODIFY] `src/pages/Upload.jsx`

Novo fluxo:
1. Upload ZIP → filtros → enviar
2. ~2-3s → parsing completo
3. **EstimationGate** aparece
4. Trial elegível → "Usar ata grátis"
5. Tem créditos → "Confirmar e Processar"  
6. Não tem → "Comprar Créditos"
7. Após confirmar → pipeline continua

### [MODIFY] `src/pages/Dashboard.jsx`

- Widget de saldo no topo
- Badge "Trial disponível" para novos usuários

### [MODIFY] `src/components/Navbar.jsx`

- `CreditBalance` widget
- Link para `/credits`

### [NEW] `src/services/creditsApi.js`

```javascript
getBalance()
getPackages()
getTransactions(page, limit)
purchasePackage(packageId, paymentMethod)
getPaymentStatus(paymentId)
```

---

## Fluxo Completo (End-to-End)

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
   │                            │   (transcribe → IA)    │
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
   │                            │── add_credits(30)      │
   │◀── "30 créditos adicionados"│                       │
```

---

## Perguntas Pendentes

1. **CPF/CNPJ**: O Asaas exige para criar cliente. Adicionar campo na tabela `advogados` e pedir no primeiro pagamento?
2. **Expiração FIFO**: Créditos de compras mais antigas são consumidos primeiro. Concorda?
3. **Pacotes**: Os 4 pacotes (R$100/R$240/R$480/R$1.000) estão bons?

---

## Ordem de Execução

| Ordem | Componente | Estimativa |
|-------|-----------|-----------|
| 1 | Schema do banco (migration) | 1h |
| 2 | `services/credits.py` (core) | 3h |
| 3 | `services/asaas.py` (integração) | 4h |
| 4 | `routers/credits.py` + `routers/webhooks.py` | 2h |
| 5 | Modificar `routers/atas.py` (fluxo 2 fases) | 3h |
| 6 | Frontend: `creditsApi.js` + `Credits.jsx` | 3h |
| 7 | Frontend: `EstimationGate.jsx` + modificar `Upload.jsx` | 3h |
| 8 | Frontend: `PaymentModal.jsx` + `CreditBalance.jsx` | 3h |
| 9 | Frontend: modificar `Dashboard.jsx` + `Navbar.jsx` | 1h |
| 10 | Testes + polimento | 3h |
| | **Total estimado** | **~26h** |

---

## Verificação

### Testes Automatizados
```bash
python -m pytest tests/test_credits.py -v
python -m pytest tests/test_asaas.py -v
python -m pytest tests/test_page_estimator.py -v
```

### Testes Manuais
1. **Trial:** Conta nova → upload → trial → processar grátis → segundo upload sem trial
2. **Compra (Sandbox):** Pacote PIX → webhook → créditos adicionados
3. **Estimativa:** Upload → ~10 páginas → confirmar → debitar → reconciliar
4. **Expiração:** Créditos antigos → job de expiração → saldo atualizado
