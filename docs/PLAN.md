# LegisVox — Implementation Plan (docs/PLAN.md)

Este documento foi gerado pelo **project-planner** baseado no `roadmap.md` existente e detalha os passos atômicos necessários para a implementação do projeto.

## Fase 1: Fundação do Projeto (Setup)
- [x] Criar estrutura do backend Python (FastAPI) em `notorial-api/`
- [x] Configurar `main.py`, `requirements.txt`, `.env`, `config.py` e `database.py`
- [x] **Ação Manual:** Preencher as variáveis reais no arquivo `notorial-api/.env`
- [x] **Ação Manual:** Iniciar o backend (`cd notorial-api && .\venv\Scripts\activate && uvicorn main:app --reload`) e testar em `http://localhost:8000/docs`
- [x] Criar projeto React (Vite) em `notorial-web/` limpando o boilerplate
- [x] Configurar os estilos globais em `src/styles/globals.css`
- [x] **Ação Manual:** Iniciar o frontend (`cd notorial-web && npm run dev`) e testar em `http://localhost:5173`

## Fase 2: Banco de Dados e Auth (Supabase)
- [x] Elaborar schema SQL de tabelas (`advogados`, `atas`, `atas_conteudo`, `atas_pdfs`) e rodar no Supabase (Arquivo `supabase/schema.sql` criado)
- [x] Configurar as RLS (Row Level Security) e Triggers (ex: `update_updated_at`) inseridos no arquivo SQL acima.
- [ ] **Ação Manual (Supabase):** Acesse a dashboard do Supabase > SQL Editor > cole o conteúdo do arquivo `supabase/schema.sql` e execute.
- [x] Configurar conexão e autenticação no Frontend (Supabase Auth SDK instalado e script em `src/services/supabase.js` criado)
- [ ] **Ação Manual (Frontend .env):** Crie um arquivo `.env` dentro da pasta `notorial-web/` e cole as variáveis `VITE_SUPABASE_URL=seu_url` e `VITE_SUPABASE_KEY=sua_anon_key`.
- [x] Implementar middleware de autenticação no Backend FastAPI (`notorial-api/middleware/auth.py` criado)

## Fase 3: Motor de Processamento (Core Backend)
- [x] Implementar parser do arquivo WhatsApp (`services/whatsapp_parser.py`)
- [x] Implementar conexão Groq Whisper para transcrição de áudios (`services/transcription.py`)
- [x] Implementar envio para OpenAI GPT-4.1-mini para geração e organização dos textos (`services/ai_organizer.py`)
- [x] Implementar envio para Gotenberg e salvamento no Supabase Storage (`services/pdf_generator.py`)
- [x] Integrar todos os serviços nos endpoints principais (`routers/atas.py`)

## Fase 4: Templates PDF Profissionais
- [x] Configurar `templates/ata_formal.html` com jargão e cabeçahos jurídicos.
- [x] Configurar `templates/material_preparatorio.html` focado na revisão pelo advogado.
- [ ] Testar os templates com dados mocados + Gotenberg local.

## Fase 5: Frontend UI/UX (React) - Modo Mock
- [x] Criar página e lógica de Autenticação (`src/pages/Login.jsx`)
- [x] Desenvolver Dashboard do Advogado com busca (`src/pages/Dashboard.jsx`)
- [x] Desenvolver página de Upload com Drag & Drop e Filtro de Datas (`src/pages/Upload.jsx`)
- [x] Desenvolver página de Revisão Tiptap com barra de formatação rica (`src/pages/Review.jsx`)
- [x] Mockar endpoints (`listAtas`, `uploadZip`, `preview`, `content`, `generate-pdf`) para simular experiência real no frontend.
- [x] Mockar geração de PDF com abertura de nova tab formatada utilizando Layout de ATA Notarial (`api.js`).

## Fase 6: Transição de Mock para API Real (Próximos Passos)
- [ ] Remover "travas" de mock no React (`App.jsx` e `api.js`): reativar Auth real pelo Supabase.
- [ ] **Ação Manual:** Usuário criar conta no Supabase Auth e logar na aplicação.
- [ ] Rodar os scripts locais de FastAPI / Backend.
- [x] Conectar os disparos reais de Frontend para Backend FastAPI.
- [x] Garantir que `whatsapp_parser.py` suporta filtros de Data Início / Data Fim passando do frontend.
- [ ] Testar integração end-to-end com um `.zip` real (Ajustar limites de tamanho e timeout).

## Fase 7: Polimento e Deploy
- [x] Tratamento de erros inicial no backend (ZIP inválido, filtragem de datas).
- [ ] Refinar tratamento de erros detalhado (formatação diferente de mensagem, mensagens do sistema do WhatsApp).
- [ ] Realizar scripts locais de validação / lint / testes manuais (checklist final)
- [ ] Preparar ambiente de produção (Frontend na Vercel e Backend em provedor de nuvem como Render ou Render + GCP).

## Fase 8: Refinamentos Jurídicos e IA (Próxima Etapa)
- [ ] **Performance & Velocidade**: Implementar processamento paralelo para transcrição de áudios (Groq Whisper) usando `asyncio.gather`.
- [ ] **Aprimoramento de Prompts**: Ajustar o `ai_organizer.py` para gerar textos mais próximos da linguagem cartorial oficial brasileira.
- [ ] **Streaming de Status**: Melhorar o feedback visual no Dashboard para que o advogado veja exatamente em qual etapa o parser está (ex: "Transcrevendo áudio 3/10...").
- [ ] **Edição em Tempo Real**: Melhorar a integração do editor Tiptap na página de revisão para garantir que o que é editado seja refletido no PDF final.
- [ ] **Formatação de PDF**: Adicionar suporte a brasões customizáveis e numeração de páginas jurídica (ex: "Folha X de Y").
- [ ] **Multi-Conversa**: Implementar lógica para lidar com múltiplos arquivos de chat no mesmo ZIP (se necessário).
- [ ] **UX de Progresso**: Adicionar feedback visual mais detalhado durante o parsing (ex: "X mensagens processadas...").

---
**Status:** Integração Real Frontend-Backend em progresso. Filtro de Datas operacional. Próximo passo: Refinamento de Prompts e Testes de Carga.
