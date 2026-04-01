# LegisVox - Documentação Técnica

Este documento descreve a arquitetura e o funcionamento do sistema LegisVox, uma plataforma de automação de Atas Notariais a partir de conversas do WhatsApp.

## 🏗️ Visão Geral da Arquitetura

O sistema é dividido em duas partes principais:
1. **Frontend**: Aplicação React que lida com o upload do ZIP e edição do documento (TipTap).
2. **Backend**: FastAPI (Python) que processa o ZIP, transcreve áudios e organiza o conteúdo com IA.

### Fluxo de Trabalho (Pipeline)

1. **Upload**: O usuário faz o upload de um arquivo `.zip` exportado do WhatsApp.
2. **Parsing (`services/whatsapp_parser.py`)**:
    - Extrai o arquivo `_chat.txt` (iOS) ou semelhantes.
    - Usa Regex para limpar metadados e identificar participantes.
    - Extrai arquivos de áudio (.m4a, .ogg) do ZIP.
3. **Transcrição (`services/transcription.py`)**:
    - Envia os áudios em paralelo para a API do Groq (Whisper-v3).
    - Mapeia o resultado da transcrição de volta para a mensagem correspondente no chat.
4. **Organização com IA (`services/ai_organizer.py`)**:
    - Converte o JSON do chat em um texto estruturado.
    - Envia para a OpenAI (GPT-4o) para gerar duas versões:
        - **Preparatória**: Linguagem simples, destacando fatos e evidências.
        - **Cartorária (Formal)**: Linguagem jurídica técnica, pronta para o cartório.
5. **Geração de PDF (`services/pdf_generator.py`)**:
    - Converte o HTML do editor (TipTap) em PDF usando Gotenberg.

## 🛠️ Tecnologias Utilizadas

- **Backend**: FastAPI, Pydantic, httpx, respx (testes).
- **IA**: Groq API (Transcrição), OpenAI API (Organização/LLM).
- **Banco de Dados**: Supabase (PostgreSQL + Auth).
- **Processamento de PDF**: Gotenberg (via Docker).

## 📁 Estrutura de Arquivos

```text
notorial-api/
├── main.py              # Ponto de entrada da API
├── config.py            # Configurações via variáveis de ambiente
├── database.py          # Conector Supabase
├── routers/
│   └── atas.py          # Endpoints de upload, status e conteúdo
└── services/
    ├── whatsapp_parser.py  # Regex e extração de ZIP
    ├── transcription.py    # Integração Groq Whisper
    ├── ai_organizer.py     # Prompt Engineering e Lógica de IA
    └── pdf_generator.py    # Integração Gotenberg
```

## 🧪 Como rodar os testes

Todos os serviços principais possuem testes unitários rigorosos:

```bash
python -m pytest tests/test_whatsapp_parser.py
python -m pytest tests/test_transcription.py
python -m pytest tests/test_ai_organizer.py
```

## 🔐 Segurança e Performance

- **Transcrição Paralela**: Áudios são processados concorrentemente usando `asyncio.gather`.
- **Merge Inteligente**: O mapeamento de áudios funciona mesmo se o nome do arquivo sofrer pequenas alterações no ZIP (basename mapping).
- **Sanitização**: Texto do WhatsApp é limpo de caracteres ilegais antes de ser enviado à IA.
