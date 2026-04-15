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
- [x] Configurar conexão e autenticação no Frontend (Supabase Auth SDK instalado e script em `src/services/supabase.js` criado)
- [x] Implementar middleware de autenticação no Backend FastAPI (`notorial-api/middleware/auth.py` criado)

## Fase 3-6: Implementações de Core (Aprovadas / Concluídas)
- [x] Core processing FastAPI + AI
- [x] Mock e Autenticação Supabase 
- [x] Páginas Principais (Dashboard, Upload, Review, etc)
- [x] Vínculo de Arquivos, Checkout Asaas e Gestão de Créditos

## Fase 7: Polimento e Deploy
- [x] Tratamento de erros inicial no backend (ZIP inválido, filtragem de datas).
- [ ] ~~Refinar tratamento de erros detalhado~~ (REMOVIDO: Documento deve ser totalmente fiel à extração original do WhatsApp para servir como prova judicial).
- [ ] Realizar scripts locais de validação / lint / testes manuais (checklist final)
- [ ] Preparar ambiente de produção na VPS e infraestrutura de domínio da Hostinger.

## Fase 8: Refinamentos Jurídicos e IA (Próxima Etapa)
- [ ] ~~Aprimoramento de Prompts para linguagem cartorial~~ (REMOVIDO: Foco exclusivo para uso diário de advogados, documentação clara e provatória).
- [ ] **UX de Progresso**: Adicionar feedback visual mais detalhado durante o parsing.

## Fase 9: Lapidações Pré-Produção (UX de Perfil & Termos Legais)
**Objetivo:** Melhorar a experiência do Perfil de Usuário, clareza no uso de créditos e proteger a aplicação com termos de uso e privacidade antes do lançamento em produção.

- [ ] **Perfil (Identidade Fiscal):** Verificar e confirmar o destaque do CPF/CNPJ já implementado na página de Profile (`Profile.jsx`), focando na comunicação de visualização para o usuário (read-only).
- [ ] **Perfil (Gauges de Consumo de Créditos):**
  - Consumir da API o histórico de transações ou total disponível (`creditsApi.js`).
  - Desenvolver uma visualização com barras de progresso (gauges) do consumo de créditos na página `Profile.jsx` (Total adquirido vs Consumido vs Disponível). 
- [ ] **Páginas Legais:**
  - Criar `TermsOfUse.jsx` (Termos de Uso e Copyright) na pasta `src/pages`.
  - Criar `PrivacyPolicy.jsx` (Políticas de Privacidade) na pasta `src/pages`.
  - Adicionar as rotas no `App.jsx`.
- [ ] **UX & Navegação das Páginas Legais:**
  - Adicionar links visíveis para "Termos de Uso" e "Política de Privacidade" no rodapé / footer da página de Cadastro/Login (`Login.jsx`).
  - Adicionar atalhos sutis nas configurações ou dashboard se necessário.

---
**Status:** Orquestração da Fase 9 em Andamento (Passo a Passo).
