# LegisVox 🏛️🤖

LegisVox é uma plataforma inovadora baseada em Inteligência Artificial projetada para automatizar a criação de **Atas Notariais** a partir de exportações de conversas do WhatsApp. O sistema extrai as mensagens, transcreve áudios com alta precisão e estrutura os diálogos em formatos prontos para uso em processos jurídicos e cartorários.

---

## 🚀 Principais Funcionalidades

- **Upload Simples:** Aceita arquivos `.zip` exportados nativamente pelo WhatsApp (iOS e Android).
- **Extração Inteligente (`whatsapp_parser`):** Lida com arquivos de texto (`_chat.txt`), limpando metadados nativos e identificando as partes envolvidas na conversa.
- **Transcrição de Áudio (Whisper):** Extrai arquivos `.m4a` e `.ogg` do zip e realiza a transcrição paralela de alta velocidade utilizando o modelo Whisper-v3 através da API da Groq.
- **Organização Contextual com IA (GPT-4o):**
  - **Versão Preparatória:** Um resumo claro e focado nos fatos e evidências da conversa, ideal para construção de argumento por advogados.
  - **Versão Cartorária (Formal):** Um documento refinado com linguagem jurídica e técnica, pré-estruturado do modo  como a formalidade notarial exige.
- **Geração de PDF:** Converte a edição final feita no sistema (via editor TipTap integrado na UI) diretamente para um formato PDF elegante utilizando o Gotenberg.
- **Autenticação e Segurança:** Protegido pelo Supabase (PostgreSQL + Auth), garantindo rígido controle de acesso e sigilo das informações processadas.

---

## 🛠️ Stack Tecnológico

**Frontend (Interface Web)**
- React & Vite
- TipTap (Editor de Textos Rico)
- Interface de usuário moderna e responsiva

**Backend (API Core)**
- FastAPI (Python)
- Pydantic
- Chamadas HTTP assíncronas nativas (`httpx`)

**Inteligência Artificial & APIs Externas**
- Groq API (Transcrição de Áudio hiperveloz via Whisper)
- OpenAI API (GPT-4o para sumarização técnica e formatação jurídica)
- Gotenberg (Geração e renderização de PDF em container Docker)

**Infraestrutura & Banco de Dados**
- Supabase (Autenticação e banco relacional PostgreSQL)

---

## 📁 Estrutura do Projeto

A aplicação é dividida em dois subprojetos principais no monorepo:

```text
notorial_ai/
├── notorial-api/          # Backend Python (FastAPI)
│   ├── main.py            # Entry point da API
│   ├── config.py          # Configurações dinâmicas de ambiente
│   ├── database.py        # Conector Supabase
│   ├── routers/           # Endpoints de API (Upload, Processamento)
│   ├── services/          # Motores e orquestradores IA e Parsers
│   └── tests/             # Bateria de testes unitários do motor CORE
│
└── notorial-web/          # Frontend Web (React + Vite)
    ├── src/               # Código fonte UI, telas e componentes (Upload, Dashboard)
    ├── package.json       # Configuração NPM
    └── ...
```

---

## 💻 Como Rodar o Projeto Localmente

### 1. Pré-Requisitos Principais
- Node.js (v18+) e NPM instalados
- Python (v3.10+) 
- [Supabase](https://supabase.com/) configurado
- Chaves ativas de API Groq (transcrição) e OpenAI (geração de texto)



## 🧪 Testes

Os serviços e parsers internos têm garantia estrita por testes unitários e de integração elaborados usando `pytest`. Verifique se seu ambiente está ok rodando localmente a validação de arquitetura:

---

## 🔒 Segurança

O design e as metodologias de infraestrutura do LegisVox baseiam-se numa implementação defensiva forte e restrita: 
- O acesso completo é limitado via as diretrizes RLS do Supabase. 
- Processamentos de áudio/IO, são despojados do sistema e transitados em memória (Asyncio paralellizing).
- Textos nativos advindos do chat de origem contam com regex assertiva e forte pré-sanitização, o que protege envios aos modelos LLM posteriores de envenenamento ou injecção não esperada de comandos prompt.
