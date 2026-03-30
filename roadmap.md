# Notorial.ai — Plano de Implementação
**Projeto:** Notorial.ai — Automação de Atas Notariais a partir de WhatsApp  
**Stack:** Python/FastAPI (backend) + Vite/React (frontend)  
**Data:** 09/03/2026  
---
## Visão Geral
Transformar exports de conversas do WhatsApp (`.zip`) em documentos organizados no formato de ata notarial, com transcrição automática de áudios por IA, gerando PDF em dois formatos: **ata formal (cartório)** e **material preparatório (advogado)**.
---
## Decisões Técnicas Aprovadas
| Item | Decisão |
|------|---------|
| Backend | Python + FastAPI |
| Frontend | Vite + React |
| Transcrição | Groq Whisper (reuso do prontuário) |
| IA/Organização | OpenAI GPT-4.1-mini (reuso do prontuário) |
| PDF | Gotenberg (reuso do prontuário) |
| Banco | Supabase PostgreSQL |
| Storage | Supabase Storage |
| Auth | Supabase Auth (frontend SDK + JWT no backend) |
| Editor de Texto | Tiptap (baseado em ProseMirror) |
| Processamento Assíncrono | FastAPI BackgroundTasks + polling (MVP) |
| Saídas | 2 templates PDF: ata formal + material preparatório |
| Imagens | MVP sem descrição visual (roadmap futuro) |
| Modelo | SaaS (assinatura) |
---
## Arquitetura do Sistema
```
┌─────────────────────────────────────────────────────────┐
│              FRONTEND (Vite + React)                     │
│  Upload ZIP │ Preview │ Editor Revisão │ Download PDF    │
├─────────────────────────────────────────────────────────┤
│              BACKEND (Python / FastAPI)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │  Upload  │→ │  Parser  │→ │   STT    │→ │   IA    ││
│  │  ZIP     │  │  Chat    │  │  Groq    │  │ OpenAI  ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘│
│        ↓                                     ↓          │
│  ┌──────────────┐                   ┌──────────────┐    │
│  │ Background   │                   │  Gotenberg   │    │
│  │ Tasks (async)│                   │  HTML → PDF  │    │
│  └──────────────┘                   └──────────────┘    │
├─────────────────────────────────────────────────────────┤
│              INFRAESTRUTURA                              │
│  • Supabase PostgreSQL — dados, atas                     │
│  • Supabase Storage — ZIPs, PDFs, áudios                 │
│  • Supabase Auth — login advogado (frontend SDK)         │
│  • Groq API — whisper-large-v3                           │
│  • OpenAI API — GPT-4.1-mini                             │
│  • Gotenberg — conversão HTML→PDF                        │
└─────────────────────────────────────────────────────────┘
```

### Estratégia de Processamento Assíncrono
O fluxo ZIP → Parse → STT → IA → PDF pode levar **minutos** para conversas longas.

| Aspecto | Decisão MVP | Evolução Futura |
|---------|-------------|-----------------|
| Execução em background | `BackgroundTasks` do FastAPI | Redis + Celery |
| Notificação ao frontend | Polling via `GET /status` (a cada 3s) | SSE ou WebSocket |
| Falha no meio | Status `error` + mensagem legível | Retry automático |
| Servidor reinicia | Ata fica com status `error`, reprocessar | Fila persistente (Redis) |

---
## Custo Estimado por Ata

> Essencial para definir pricing do SaaS.

| Serviço | Custo estimado por ata | Observação |
|---------|----------------------|------------|
| Groq Whisper | ~$0.01-0.05/min de áudio | Varia com quantidade de áudios |
| OpenAI GPT-4.1-mini | ~$0.10-0.50/request | Depende do tamanho da conversa |
| Gotenberg | $0.00 (self-hosted) | Custo absorvido no servidor |
| Supabase Storage | ~$0.02/GB | Negligível por ata |
| **Total estimado** | **$0.15-0.60 por ata** | Base para pricing |

---
## Fases de Desenvolvimento

### FASE 1 — Fundação do Projeto (Setup) `[2-3h]`
> Montar a estrutura do projeto, configurar as ferramentas e garantir que tudo compila/roda.

#### Backend
##### [NEW] `notorial-api/main.py`
- FastAPI app com CORS, lifespan, middleware
- Montagem de routers
- **INPUT:** Template FastAPI base
- **OUTPUT:** Servidor rodando em `localhost:8000` com `/docs`
- **VERIFY:** `curl http://localhost:8000/docs` retorna Swagger UI

##### [NEW] `notorial-api/requirements.txt`
- `fastapi`, `uvicorn`, `python-multipart`, `python-dotenv`
- `httpx` (para Groq, OpenAI, Gotenberg, Supabase)
- `supabase` (SDK Python)

##### [NEW] `notorial-api/.env`
- `GROQ_API_KEY`, `OPENAI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_KEY`
- `GOTENBERG_URL`

##### [NEW] `notorial-api/config.py`
- Carregamento centralizado de variáveis de ambiente
- Validação de variáveis obrigatórias no startup
- **VERIFY:** App falha com erro claro se variável estiver faltando

##### [NEW] `notorial-api/database.py`
- Cliente Supabase (singleton)

#### Frontend
##### [NEW] Projeto Vite+React
- `npx create-vite@latest notorial-web --template react`
- Limpeza do boilerplate
- Estrutura de pastas: `components/`, `pages/`, `services/`, `styles/`
- **INPUT:** Template Vite padrão
- **OUTPUT:** App React rodando em `localhost:5173`
- **VERIFY:** Página inicial do Vite renderiza no browser

##### [NEW] `notorial-web/src/styles/globals.css`
- Design system: cores, tipografia, dark mode
- Inspiração no design do prontuário

---

### FASE 2 — Banco de Dados e Auth `[3-4h]`
> Fundação de dados — tudo que persiste precisa existir antes do core.

#### Schema PostgreSQL (Supabase)
```sql
-- Perfil do advogado (vinculado ao auth.users)
CREATE TABLE advogados (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    nome VARCHAR(255) NOT NULL,
    oab VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    escritorio VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscas por email
CREATE INDEX idx_advogados_email ON advogados(email);

-- Atas geradas (metadados e controle)
CREATE TABLE atas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id),
    
    -- Identificação
    titulo VARCHAR(255),
    
    -- Dados do upload
    zip_url TEXT,
    zip_filename VARCHAR(255),
    
    -- Metadados parseados
    participantes JSONB,
    periodo_inicio DATE,
    periodo_fim DATE,
    total_mensagens INTEGER,
    total_audios INTEGER,
    
    -- Controle de processamento
    status VARCHAR(30) DEFAULT 'uploading',
    -- Status: uploading → parsing → transcribing → organizing → ready → error
    error_message TEXT,  -- mensagem legível em caso de erro
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frequentes
CREATE INDEX idx_atas_advogado ON atas(advogado_id);
CREATE INDEX idx_atas_status ON atas(status);
CREATE INDEX idx_atas_created ON atas(created_at DESC);

-- Conteúdo pesado (separado para performance nas listagens)
CREATE TABLE atas_conteudo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_id UUID NOT NULL REFERENCES atas(id) ON DELETE CASCADE,
    
    chat_parseado JSONB,        -- JSON estruturado do parser
    conteudo_formal JSONB,      -- Saída da IA: ata formal
    conteudo_preparatorio JSONB, -- Saída da IA: material preparatório
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conteudo_ata ON atas_conteudo(ata_id);

-- PDFs gerados (pode ter múltiplas versões)
CREATE TABLE atas_pdfs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_id UUID NOT NULL REFERENCES atas(id) ON DELETE CASCADE,
    
    tipo VARCHAR(20) NOT NULL, -- 'formal' ou 'preparatorio'
    pdf_url TEXT NOT NULL,
    versao INTEGER DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pdfs_ata ON atas_pdfs(ata_id);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON atas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
```

#### RLS (Row Level Security)
```sql
-- Advogados só veem seus próprios dados
ALTER TABLE atas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_atas" ON atas
    FOR ALL USING (advogado_id = auth.uid());

ALTER TABLE atas_conteudo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_conteudo" ON atas_conteudo
    FOR ALL USING (
        ata_id IN (SELECT id FROM atas WHERE advogado_id = auth.uid())
    );

ALTER TABLE atas_pdfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_pdfs" ON atas_pdfs
    FOR ALL USING (
        ata_id IN (SELECT id FROM atas WHERE advogado_id = auth.uid())
    );
```

#### Auth
- **Frontend:** Supabase Auth SDK (login, registro, logout)
- **Backend:** Middleware de validação JWT do Supabase nos endpoints protegidos
- **Sem router de auth no backend** — Supabase gerencia tudo via SDK + RLS

##### [NEW] `notorial-api/middleware/auth.py`
- Middleware que extrai e valida JWT do header `Authorization: Bearer <token>`
- Injeta `advogado_id` no request context
- **INPUT:** Request com JWT no header
- **OUTPUT:** `advogado_id` disponível no handler
- **VERIFY:** Request sem JWT retorna 401; JWT inválido retorna 403

---

### FASE 3 — Motor de Processamento (Core Backend) `[8-12h]`
> O coração do sistema: receber ZIP, parsear, transcrever, organizar.

#### Parser de WhatsApp
##### [NEW] `notorial-api/services/whatsapp_parser.py`
O parser é o componente mais crítico. Precisa lidar com:
- **Extrair ZIP** em memória (ou `/tmp`)
- **Parsear `_chat.txt`** com regex:
  ```python
  # Formato BR: DD/MM/AAAA, HH:MM - Remetente: Mensagem
  PATTERN = r'^(\d{2}/\d{2}/\d{4}), (\d{2}:\d{2}) - ([^:]+): (.+)'
  ```
- **Detectar tipo de conteúdo** de cada mensagem:
  - Texto puro
  - Refêrencia a mídia (`<Media omitted>`, `(file attached)`)
  - Mensagens do sistema (criptografia, grupo, etc)
- **Agrupar por data** para organização cronológica
- **Mapear áudios** aos arquivos `.opus` no ZIP
- **Output:** JSON estruturado com toda a conversa parseada

```python
# Estrutura de saída do parser
{
  "participantes": ["João Silva", "Maria Santos"],
  "periodo": {"inicio": "2026-03-02", "fim": "2026-03-15"},
  "mensagens": [
    {
      "data": "2026-03-02",
      "hora": "14:32",
      "remetente": "João Silva",
      "tipo": "texto",
      "conteudo": "Olá, preciso do contrato"
    },
    {
      "data": "2026-03-02",
      "hora": "14:36",
      "remetente": "Maria Santos",
      "tipo": "audio",
      "arquivo": "AUD-20260302-WA0001.opus",
      "transcricao": null  # preenchido na fase de STT
    }
  ],
  "total_mensagens": 147,
  "total_audios": 12,
  "total_imagens": 5
}
```

- **INPUT:** Arquivo ZIP de export do WhatsApp
- **OUTPUT:** JSON estruturado com mensagens, participantes, período
- **VERIFY:**
  - [ ] Parseia ZIP com 100+ mensagens em < 2s
  - [ ] Identifica corretamente texto, áudio, imagem, sistema
  - [ ] Funciona com formato de data BR (DD/MM/AAAA)
  - [ ] Não quebra com mensagens multi-linha
  - [ ] ZIP sem `_chat.txt` retorna erro claro

#### Transcrição de Áudios
##### [NEW] `notorial-api/services/transcription.py`
- Recebe lista de arquivos de áudio do ZIP
- Envia cada áudio para **Groq Whisper** (reuso da lógica do prontuário)
- Processamento **assíncrono** (múltiplos áudios em paralelo com `asyncio.gather`)
- Retorna transcrições indexadas pelo nome do arquivo
- Tratamento de erro por áudio (se um falhar, não trava os outros)

- **INPUT:** Lista de arquivos `.opus` extraídos do ZIP
- **OUTPUT:** Dict `{nome_arquivo: texto_transcrito}`
- **VERIFY:**
  - [ ] Transcreve áudio `.opus` de 30s em < 5s
  - [ ] Áudio corrompido retorna `"[Erro na transcrição]"` sem travar
  - [ ] 10 áudios em paralelo completam em < 15s
  - [ ] Retry com backoff em caso de falha da API Groq

#### Organização com IA
##### [NEW] `notorial-api/services/ai_organizer.py`
- Recebe o JSON do parser (com transcrições preenchidas)
- Envia para **OpenAI GPT-4.1-mini** com prompt específico:
  - Manter TODAS as mensagens na ordem cronológica original
  - NÃO omitir, resumir ou alterar o conteúdo das mensagens
  - Formatar no padrão de ata (data por extenso, remetente em destaque)
  - Adicionar cabeçalho com metadados da conversa
  - Marcar áudios transcritos com indicação visual
  - Sinalizar imagens como `[IMAGEM - nome_arquivo]`
- **Dois prompts diferentes** para os dois formatos:
  - **Ata formal:** linguagem jurídica, estrutura de cartório
  - **Material preparatório:** linguagem técnica, organizado para o advogado
- **Chunking:** Conversas com > 3000 mensagens são divididas em chunks antes de enviar para a IA

- **INPUT:** JSON parseado com transcrições preenchidas
- **OUTPUT:** Dois textos formatados (formal + preparatório)
- **VERIFY:**
  - [ ] Todas as mensagens originais estão presentes na saída
  - [ ] Ordem cronológica preservada
  - [ ] Conversa de 200 mensagens processa em < 30s
  - [ ] Conversa de 5000+ mensagens faz chunking sem perder mensagens

#### Geração de PDF
##### [NEW] `notorial-api/services/pdf_generator.py`
- Recebe o conteúdo organizado pela IA
- Gera **template HTML** profissional (2 templates)
- Envia para **Gotenberg** para conversão HTML→PDF
- Upload do PDF para **Supabase Storage**
- Salva referência na tabela `atas_pdfs`
- Retorna URL do PDF

- **INPUT:** Texto formatado da IA + tipo (formal/preparatorio)
- **OUTPUT:** URL do PDF no Supabase Storage
- **VERIFY:**
  - [ ] PDF gerado tem encoding UTF-8 correto (acentos, ç, etc)
  - [ ] PDF formal tem cabeçalho jurídico e espaço para assinatura
  - [ ] PDF preparatório tem índice e metadados
  - [ ] Gotenberg fora do ar retorna erro claro (sem travar)

#### Router Principal
##### [NEW] `notorial-api/routers/atas.py`
Endpoints:
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `POST /api/atas/upload` | POST (multipart) | Recebe ZIP, inicia processamento em background |
| `GET /api/atas/{id}/status` | GET | Status do processamento (para polling) |
| `GET /api/atas/{id}/preview` | GET | Preview do conteúdo parseado |
| `PUT /api/atas/{id}/content` | PUT | Salvar edições do advogado |
| `POST /api/atas/{id}/generate-pdf` | POST | Gerar PDF final (tipo: formal/preparatorio) |
| `GET /api/atas/{id}/pdf/{tipo}` | GET | Download do PDF |
| `GET /api/atas` | GET | Listar atas do advogado (sem conteúdo pesado) |
| `DELETE /api/atas/{id}` | DELETE | Excluir ata e arquivos associados |

---

### FASE 4 — Templates PDF Profissionais `[5-8h]`
> Dois templates HTML→PDF de alta qualidade.

#### Template 1: Ata Formal (Cartório)
##### [NEW] `notorial-api/templates/ata_formal.html`
Linguagem jurídica formal com:
- Cabeçalho com dados do solicitante e da conversa
- Fundamentação legal (Art. 384 CPC, Lei 8.935/94)
- Registro cronológico com transcrições
- Referência a mídias como anexos
- Espaço para assinatura e selo

- **INPUT:** Conteúdo organizado pela IA (formato formal)
- **OUTPUT:** HTML renderizado pronto para Gotenberg
- **VERIFY:**
  - [ ] Layout profissional em A4
  - [ ] Margens corretas para impressão
  - [ ] Fundamentação legal visível no cabeçalho
  - [ ] Espaço para assinatura no rodapé

#### Template 2: Material Preparatório
##### [NEW] `notorial-api/templates/material_preparatorio.html`
Formato prático para o advogado com:
- Índice/sumário da conversa
- Mensagens organizadas por data
- Transcrições de áudio em destaque
- Marcação de imagens/vídeos
- Cabeçalho com metadados e estatísticas

- **INPUT:** Conteúdo organizado pela IA (formato preparatório)
- **OUTPUT:** HTML renderizado pronto para Gotenberg
- **VERIFY:**
  - [ ] Índice com links internos funciona
  - [ ] Transcrições visualmente diferenciadas do texto
  - [ ] Metadados (total de mensagens, período, participantes) no cabeçalho

---

### FASE 5 — Frontend (UI/UX) `[10-15h]`
> Interface para o advogado interagir com o sistema.

#### Páginas
##### [NEW] `src/pages/Login.jsx`
- Login com Supabase Auth (SDK no frontend)
- Registro de novo advogado
- Design profissional, dark mode
- **VERIFY:** Login com credenciais válidas redireciona ao Dashboard

##### [NEW] `src/pages/Dashboard.jsx`
- Lista de atas do advogado (query leve, sem conteúdo pesado)
- Status de cada processamento (badge visual)
- Botão "Nova Ata"
- **VERIFY:** Lista carrega em < 1s; atas de outro advogado não aparecem

##### [NEW] `src/pages/Upload.jsx`
- Zona de drag & drop para o ZIP
- Barra de progresso do processamento
- Feedback visual das etapas (parsing, transcrição, organização)
- **VERIFY:** Upload de ZIP de 10MB completa; ZIP sem `_chat.txt` mostra erro

##### [NEW] `src/pages/Review.jsx`
- Preview do documento gerado
- **Abas** para alternar entre ata formal e material preparatório
- Editor Tiptap para ajustes do advogado
- Botão para gerar cada tipo de PDF
- **VERIFY:** Edições são salvas; PDF gerado reflete as edições

#### Componentes
##### [NEW] `src/components/FileUploader.jsx`
- Drag & drop + seleção de arquivo
- Validação (apenas `.zip`, tamanho máximo configurável)
- Animação de upload

##### [NEW] `src/components/ProcessingStatus.jsx`
- Etapas visuais: Upload → Parse → Transcrição → IA → Pronto
- Indicador de progresso em cada etapa
- Estado de erro com mensagem legível

##### [NEW] `src/components/MessagePreview.jsx`
- Renderiza as mensagens parseadas estilo chat
- Diferencia texto, áudio (com transcrição), imagens

##### [NEW] `src/components/DocumentEditor.jsx`
- Editor **Tiptap** (ProseMirror) para ajustes no conteúdo
- Preserva formatação da ata
- Toolbar mínima: negrito, itálico, desfazer/refazer
- **Dependência:** `@tiptap/react`, `@tiptap/starter-kit`

##### [NEW] `src/components/Navbar.jsx`
- Navegação, toggle dark mode, logout

#### Serviços
##### [NEW] `src/services/api.js`
- Cliente HTTP para comunicação com o backend
- Interceptor de auth (JWT do Supabase no header Authorization)

##### [NEW] `src/services/supabase.js`
- Configuração do cliente Supabase para auth

---

### FASE 6 — Polimento e Deploy `[5-8h]`
> Tratamento de erros, edge cases, deploy.

#### Error Handling Detalhado

| Cenário | Tratamento | UX |
|---------|------------|-----|
| ZIP sem `_chat.txt` | Rejeitar no parser | "Arquivo não contém conversa do WhatsApp" |
| ZIP corrompido | Falha na extração | "Arquivo ZIP inválido ou corrompido" |
| ZIP > 100MB | Rejeitar no upload | "Arquivo excede o limite de 100MB" |
| Conversa > 5000 msgs | Chunking automático | Processamento normal, mais lento |
| Áudio corrompido | Pular com aviso | "[Áudio não pôde ser transcrito]" no lugar |
| API Groq fora do ar | Retry 3x com backoff | "Transcrição temporariamente indisponível" |
| API OpenAI timeout | Retry com chunks menores | "Processamento está demorando mais que o normal" |
| Gotenberg falha | Retornar erro, manter conteúdo | "Erro ao gerar PDF, tente novamente" |
| Emojis/caracteres especiais | Encoding UTF-8 em todo pipeline | Renderização correta |
| Mensagens multi-linha | Regex com lookahead | Parsing correto |

#### Deploy
- Backend: mesmo servidor do prontuário ou container separado
- Frontend: build estático (Vite) servido via nginx ou Vercel
- SSL obrigatório
- Domínio: notorial.ai
- Variáveis de ambiente via `.env` (nunca commitado)

#### Loading States
- Skeleton loading no Dashboard
- Barra de progresso com etapas no Upload
- Spinner com mensagem em ações do usuário (gerar PDF, salvar edição)

---
## Estrutura de Diretórios Final
```
notorial.ai/
├── notorial-api/               # Backend Python
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── requirements.txt
│   ├── .env
│   ├── middleware/
│   │   └── auth.py             # Validação JWT Supabase
│   ├── routers/
│   │   └── atas.py
│   ├── services/
│   │   ├── whatsapp_parser.py
│   │   ├── transcription.py
│   │   ├── ai_organizer.py
│   │   └── pdf_generator.py
│   └── templates/
│       ├── ata_formal.html
│       └── material_preparatorio.html
│
├── notorial-web/               # Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx
│   │   │   └── Review.jsx
│   │   ├── components/
│   │   │   ├── FileUploader.jsx
│   │   │   ├── ProcessingStatus.jsx
│   │   │   ├── MessagePreview.jsx
│   │   │   ├── DocumentEditor.jsx  # Tiptap editor
│   │   │   └── Navbar.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── supabase.js
│   │   └── styles/
│   │       └── globals.css
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```
---
## Ordem de Execução

| Ordem | Fase | O quê | Estimativa |
|-------|------|-------|-----------|
| 1 | **Fase 1** | Setup do projeto (backend + frontend) | 2-3h |
| 2 | **Fase 2** | Schema do banco + Auth + RLS | 3-4h |
| 3 | **Fase 3** | Parser WhatsApp + Transcrição + IA + PDF | 8-12h |
| 4 | **Fase 4** | Templates PDF profissionais | 5-8h |
| 5 | **Fase 5** | Frontend (Upload → Status → Preview → Revisão) | 10-15h |
| 6 | **Fase 6** | Polimento, error handling, deploy | 5-8h |
| | | **Total estimado** | **~33-50h** |

> **Nota:** Fases 1-2 são fundação obrigatória. A Fase 3 pode ser testada via Postman/curl antes do frontend existir.

---
## Verificação

### Testes Automatizados (Backend)
1. **Parser de WhatsApp:**
   - [ ] Criar arquivo `_chat.txt` de teste com mensagens variadas (texto, áudio, imagem, mensagem do sistema)
   - [ ] Testar regex com formatos de data BR
   - [ ] Testar mensagens multi-linha
   - [ ] Testar ZIP com e sem mídia
   - [ ] Testar ZIP sem `_chat.txt` → erro claro

2. **Transcrição:**
   - [ ] Mock da API Groq para testes unitários
   - [ ] Teste de integração com áudio real `.opus`
   - [ ] Teste de retry em caso de falha da API
   - [ ] Teste de áudio corrompido → fallback sem travar

3. **Geração de PDF:**
   - [ ] Validar que HTML é gerado corretamente
   - [ ] Verificar encoding UTF-8 (acentos, ç, emojis)
   - [ ] Validar que Gotenberg offline retorna erro tratado

4. **Auth & Segurança:**
   - [ ] Request sem JWT → 401
   - [ ] JWT inválido → 403
   - [ ] Advogado A não acessa atas do Advogado B
   - [ ] Upload > limite configurado → 413

### Teste Manual (E2E)
1. **Exportar uma conversa real do WhatsApp** (com áudios)
2. **Fazer upload** do ZIP no app
3. **Verificar** se todas as mensagens aparecem no preview
4. **Verificar** se os áudios foram transcritos
5. **Editar** alguma transcrição no editor Tiptap
6. **Alternar** entre aba formal e preparatório
7. **Gerar** os dois PDFs e validar formatação
8. **Testar** no celular (responsividade)
9. **Testar** com ZIP inválido (sem `_chat.txt`)
10. **Testar** logout e login com outro advogado (isolamento)

### Teste do Advogado (User Testing)
- Enviar o app para o advogado testar com um caso real
- Coletar feedback sobre:
  - Qualidade da transcrição
  - Formato da ata gerada
  - Fluidez do fluxo
  - O que está faltando

---
## Roadmap Futuro (Pós-MVP)
| Feature | Prioridade | Descrição |
|---------|-----------|-----------|
| Organização por Casos | Alta | Agrupar atas por processo/caso judicial |
| Comparação lado-a-lado | Média | View split entre ata formal e preparatório |
| Descrição de Imagens via IA | Média | GPT Vision para descrever imagens no chat |
| Planos SaaS e Billing | Alta | Tela de planos, integração Stripe |
| Notificação em tempo real | Baixa | SSE ou WebSocket no lugar do polling |
| Multi-idioma no parser | Baixa | Suporte a formatos de data de outros países |
