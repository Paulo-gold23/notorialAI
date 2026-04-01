# DESCRIÇÃO TÉCNICA DO PROGRAMA DE COMPUTADOR
## Notorial.ai — Sistema de Automação de Atas Notariais por Inteligência Artificial

---

**Tipo de Obra:** Programa de Computador  
**Natureza:** Sistema Web de Automação Documental com Inteligência Artificial  
**Data de Criação:** 2025  
**Versão:** 1.0.0  
**Idioma de Desenvolvimento:** Português Brasileiro (PT-BR) e Inglês (comentários técnicos)  
**Plataforma de Execução:** Web (SaaS — Software as a Service)

---

## 1. OBJETO E FINALIDADE

O **Notorial.ai** é um sistema original de automação inteligente criado com o propósito específico de transformar exportações brutas de conversas do aplicativo de mensagens WhatsApp em documentos jurídicos formais denominados **Atas Notariais**, prontos para uso em cartórios, processos judiciais e ambientes legais no Brasil.

O software nasce de uma demanda real e não atendida pelo mercado: a tarefa de transcrever, organizar e formalizar centenas ou milhares de mensagens de texto e áudio de um chat — processo que, se feito manualmente por um advogado ou tabelião, pode consumir horas ou dias — passa a ser executada em minutos pelo sistema, com rigor técnico, fidelidade documental e formatação jurídica adequada.

**O problema que o software resolve:**
Atas notariais baseadas em conversas de WhatsApp são cada vez mais utilizadas em processos de divórcio, ações de guarda de filhos, disputas trabalhistas, casos de cyberbullying, investigações de fraude e outros procedimentos judiciais. Contudo, a produção manual desse tipo de documento é extremamente trabalhosa, suscetível a erros de transcrição e omissão de evidências, além de ser financeiramente inacessível para grande parte da população.

O Notorial.ai resolve todos esses gargalos com uma solução tecnológica inédita, precisa e escalável.

---

## 2. DESCRIÇÃO DO FLUXO DE FUNCIONAMENTO ORIGINAL

O sistema opera por meio de um fluxo de processamento sequencial e assíncrono, inteiramente concebido e implementado pelos autores. Cada fase do pipeline foi desenvolvida do zero, sem uso de bibliotecas que automatizem as lógicas de negócio descritas abaixo:

### Fase 1 — Recebimento e Validação do Arquivo ZIP
O usuário faz upload de um arquivo `.zip` exportado nativamente pelo WhatsApp (suporte a iOS e Android). O sistema recebe o arquivo via endpoint FastAPI e o valida internamente, verificando integridade do ZIP e presença de um arquivo de conversa reconhecível (`.txt`) antes de qualquer operação de processamento.

### Fase 2 — Parsing Nativo do Formato WhatsApp (`whatsapp_parser.py`)
Esta é a camada mais técnica e original do sistema. O parser foi desenvolvido com expressões regulares próprias (Regex) que detectam e normalizam **quatro variações distintas do formato de exportação do WhatsApp**:
- Formato Android PT-BR com ano completo (`DD/MM/YYYY, HH:MM`)
- Formato Android PT-BR com ano abreviado (`DD/MM/YY, HH:MM`)
- Formato iOS com colchetes (`[DD/MM/YYYY, HH:MM:SS]`)
- Formato Internacional EN-US com AM/PM (`M/D/YY, H:MM AM/PM`)

O parser identifica autonomamente qual formato está presente no arquivo, normaliza datas (incluindo conversão de anos com 2 dígitos para 4), e classifica cada mensagem individualmente em um dos seguintes tipos originais: `texto`, `audio`, `imagem`, `video`, `midia_omitida` ou `arquivo`.

A classificação de mensagens de áudio utiliza uma lógica de mapeamento dupla original: **lookup por caminho exato** e **lookup por basename normalizado**, o que garante que o áudio seja corretamente identificado mesmo quando o WhatsApp renomeia ou move arquivos dentro do ZIP. O parser também suporta **filtragem por período de datas** (início/fim), permitindo extrair apenas o intervalo de datas relevante para o processo jurídico específico.

Toda a leitura do arquivo `.txt` do chat suporta **detecção multicoding automática**: o sistema tenta sequencialmente os encodings `utf-8`, `utf-8-sig`, `latin-1` e `cp1252`, garantindo compatibilidade total com arquivos exportados em qualquer dispositivo ou configuração regional.

### Fase 3 — Extração e Transcrição de Áudios (`transcription.py`)
Após o parsing, o sistema extrai **somente os arquivos de áudio efetivamente referenciados** nas mensagens identificadas (extração cirúrgica, não extração total do ZIP), reduzindo consumo de memória e tornando o processamento eficiente mesmo em conversas com centenas de arquivos de mídia.

Os áudios extraídos (formatos `.ogg`, `.opus`, `.m4a`) são enviados em paralelo para a API Groq utilizando o modelo **Whisper Large V3**, especificamente configurado para o idioma Português (PT-BR). O paralelismo é controlado por um **semáforo assíncrono** (implementado via `asyncio.Semaphore`) que limita a concorrência a 3 transcrições simultâneas, impedindo estouros de limite de taxa da API (rate limiting) sem sacrificar a velocidade de processamento.

Cada transcrição de áudio conta com sistema de **retry automático com backoff exponencial**: em caso de timeout, erro de servidor (5xx) ou limite de taxa (429), o sistema aguarda progressivamente e tenta novamente até 3 vezes antes de registrar uma falha não-bloqueante na mensagem correspondente.

O resultado de cada transcrição é mapeado de volta à mensagem de origem e injetado no campo `transcricao` do objeto da mensagem, preservando a ordem cronológica e linkando cada áudio à sua transcrição de forma rastreável.

### Fase 4 — Organização com Inteligência Artificial (`ai_organizer.py`)
Esta fase transforma o JSON estruturado (resultado do parser + transcrições) em documento jurídico completo. Foram criados dois **prompts de instrução originais** que guiam os modelos de linguagem (LLMs):

- **PROMPT_FORMAL**: instrui o modelo a produzir uma Ata Notarial completa em linguagem jurídica técnica, com estrutura cartorária (Título, Identificação, Conteúdo Constatado agrupado por dia, Conclusão). O documento segue as convenções formais de registros notariais brasileiros.
- **PROMPT_PREPARATÓRIO**: instrui o modelo a produzir um Relatório Preparatório com índice navegável por data, voltado para uso interno por advogados durante a análise do caso.

Para conversas com volume muito grande de mensagens, o sistema implementa um mecanismo de **chunking inteligente e original**: o texto do chat é dividido em blocos de até 40.000 caracteres (equivalente a ~10.000 tokens), respeitando as quebras de linhas de mensagens (nunca corta no meio de um bloco de texto). Cada chunk recebe uma instrução contextual dinâmica informando se é a primeira parte, parte intermediária ou última parte — garantindo que o documento final, ao ser unificado, não apresente cabeçalhos duplicados, repetições de título ou lacunas no fluxo narrativo.

O processamento de múltiplos chunks ocorre em paralelo (via `asyncio.gather`) com semáforo de concorrência igual a 3.

O sistema implementa ainda uma camada de **pós-processamento de formatação original** (`_apply_formatting`) que aplica regras de padronização via Regex: converte conteúdo de mensagens para negrito Markdown (`**"texto"**`), detecta linhas com erros de transcrição e as sinaliza adequadamente, e garante consistência tipográfica em todo o documento.

Uma função exclusiva (`_unify_index_section`) consolida automaticamente todos os índices de datas gerados nos diferentes chunks em uma única seção de Índice no topo do documento, eliminando duplicações e gerando links de âncora funcionais (`#data-DDMMAAAA`).

O documento final é convertido de Markdown para HTML (via biblioteca `markdown`, com suporte a tabelas e quebras de linha), com injeção de IDs HTML nos cabeçalhos de data para suporte a navegação interna no editor.

### Fase 5 — Edição e Geração de PDF (`pdf_generator.py`)
O documento gerado pela IA é entregue ao frontend como HTML formatado e renderizado no editor de texto rico **TipTap**. O usuário pode revisar, corrigir ou complementar o documento antes da etapa final.

Ao finalizar a edição, o HTML resultante é enviado de volta ao backend, que o processa via **Gotenberg** (servidor de conversão de documentos executado em container Docker), gerando um PDF final pronto para impressão e protocolação em cartório.

---

## 3. ARQUITETURA TÉCNICA ORIGINAL

### 3.1 Backend — API REST (FastAPI / Python)

```
notorial-api/
├── main.py                   # Ponto de entrada — instância FastAPI, CORS e roteamento
├── config.py                 # Gerenciamento de variáveis de ambiente via Pydantic Settings
├── database.py               # Conector ao Supabase (cliente autenticado)
├── middleware/               # Middlewares personalizados de segurança e rastreamento
├── routers/
│   └── atas.py               # Endpoints REST: /upload, /status/{id}, /content/{id}
└── services/
    ├── whatsapp_parser.py    # Engine de parsing (4 formatos, multicoding, chunking)
    ├── transcription.py      # Motor de transcrição paralela com retry
    ├── ai_organizer.py       # Orquestrador de IA (prompts, chunking, formatação)
    └── pdf_generator.py      # Geração de PDF via Gotenberg
```

**Padrões técnicos utilizados:**
- Processamento totalmente assíncrono (`async/await`)
- Padrão de concorrência controlada com `asyncio.Semaphore`
- Serviços compartilhando cliente HTTP persistente (`httpx.AsyncClient`)
- Configurações centralizadas via `pydantic-settings` com validação de tipo em tempo de execução
- Autenticação e controle de acesso via JWT Supabase

### 3.2 Frontend — Interface Web (React + Vite)

```
notorial-web/src/
├── App.jsx                   # Roteamento principal (React Router)
├── main.jsx                  # Entry point da aplicação
├── pages/
│   ├── Login.jsx             # Tela de autenticação segura
│   ├── Upload.jsx            # Interface de upload com suporte drag-and-drop e barra de progresso em tempo real
│   ├── Dashboard.jsx         # Painel de histórico com busca, filtros e métricas animadas
│   ├── Review.jsx            # Editor de documentos com TipTap + exportação PDF
│   └── AdminDashboard.jsx    # Painel administrativo com gráficos SVG (barras e donut)
├── components/
│   ├── Logo.jsx              # Logo vetorial animado proprietário
│   ├── AnimatedNumber.jsx    # Animação de incremento de métricas numéricas
│   ├── SettingsModal.jsx     # Modal de configurações do usuário
│   ├── Modal.jsx             # Componente modal genérico e reutilizável
│   ├── ConfirmModal.jsx      # Modal de confirmação de ações destrutivas
│   ├── AlertModal.jsx        # Modal de alertas e notificações
│   ├── ToastContext.jsx      # Sistema global de notificações toast
│   ├── Skeleton.jsx          # Componentes de carregamento (skeleton screens)
│   └── BackButton.jsx        # Botão de navegação contextual
└── services/                 # Camada de abstração de comunicação com a API
```

### 3.3 Banco de Dados — Supabase (PostgreSQL)

O sistema utiliza o Supabase como plataforma de banco de dados relacional e autenticação. As principais entidades gerenciadas são:
- **Usuários**: gerenciados via Supabase Auth com controle de acesso por email convidado
- **Atas**: registros de cada processamento, com campo de status (`pendente`, `processando`, `concluido`, `erro`) e conteúdo HTML armazenado
- **Políticas de Segurança em Nível de Linha (RLS)**: cada usuário acessa exclusivamente seus próprios registros

---

## 4. CARACTERÍSTICAS TÉCNICAS ORIGINAIS E INOVAÇÕES

As seguintes soluções técnicas foram concebidas e implementadas de forma original pelos autores, sem referência ou cópia de projetos preexistentes:

1. **Parser Multi-Formato Unificado**: Detecção automática e parsing de 4 variações de formato de exportação do WhatsApp em um único sistema de regras Regex, com normalização de datas e encodings.

2. **Mapeamento Duplo de Áudios (exact + basename)**: Algoritmo que vincula arquivos de áudio às mensagens mesmo quando os caminhos internos do ZIP foram modificados pelo WhatsApp durante a exportação.

3. **Pipeline Assíncrono com Semáforo Configurável**: Arquitetura de concorrência que processa transcrições e chamadas de IA em paralelo sem violar limites de taxa das APIs externas.

4. **Chunking Inteligente com Instruções Contextuais por Bloco**: Sistema de divisão de texto em chunks com instrução dinâmica por posição (primeira, intermediária, última parte), garantindo coerência documental no documento unificado final.

5. **Unificação de Índice Multi-Chunk**: Algoritmo que consolida os índices de data gerados em múltiplos chunks em uma única seção de navegação sem duplicatas.

6. **Pós-Processamento Regex de Formatação Jurídica**: Camada de aplicação de formatação automática (negrito, aspas, indicação de erro de transcrição) que complementa as saídas dos modelos de linguagem.

7. **Prompts Jurídicos Especializados para Atas Notariais**: Dois conjuntos de instruções de prompt originais, desenvolvidos especificamente para o contexto jurídico-notarial brasileiro, com regras de agrupamento cronológico, identificação de participantes e estrutura documental cartorária.

8. **Sistema de Progresso em Tempo Real**: Implementação de Server-Sent Events (SSE) no backend para transmitir o progresso do processamento em tempo real ao frontend, permitindo que o usuário acompanhe cada etapa (parsing, transcrição, geração de IA, finalização).

9. **Modo Demonstração com Mocks Realistas**: Capacidade de simular o fluxo completo de processamento no frontend sem depender do backend, utilizando respostas sintéticas que imitam o comportamento real do sistema.

---

## 5. TECNOLOGIAS E BIBLIOTECAS UTILIZADAS

| Componente          | Tecnologia              | Versão           |
|---------------------|-------------------------|------------------|
| Linguagem Backend   | Python                  | 3.10+            |
| Framework Backend   | FastAPI                 | 0.115+           |
| Validação de Dados  | Pydantic / pydantic-settings | 2.x         |
| HTTP Assíncrono     | httpx                   | 0.27+            |
| Servidor ASGI       | Uvicorn                 | 0.30+            |
| Banco de Dados      | PostgreSQL (via Supabase) | 15+            |
| Autenticação        | Supabase Auth (JWT)     | —                |
| Transcrição de Áudio | Groq API (Whisper Large V3) | —           |
| Geração de Texto    | OpenAI API (GPT-4o-mini) | —               |
| Geração de PDF      | Gotenberg               | —                |
| Conversão Markdown  | Python-markdown         | 3.x              |
| Linguagem Frontend  | JavaScript (ES2022+)    | —                |
| Framework Frontend  | React                   | 18+              |
| Build Tool          | Vite                    | 5.x              |
| Editor de Texto Rico | TipTap                 | 2.x              |

---

## 6. ESCOPO DA PROTEÇÃO PLEITEADA

O presente pedido de registro abrange a totalidade do código-fonte, estrutura de dados, algoritmos, fluxos de processamento, prompts de instrução de IA, interfaces de usuário, componentes de software e documentação técnica que compõem o sistema **Notorial.ai**, conforme descritos neste documento, compreendendo:

- O código-fonte completo do módulo backend (`notorial-api/`), incluindo todos os arquivos `.py` das subpastas `services/`, `routers/` e `middleware/`
- O código-fonte completo do módulo frontend (`notorial-web/src/`), incluindo todos os arquivos `.jsx` das subpastas `pages/`, `components/` e `services/`
- Os prompts originais de instrução de IA definidos em `ai_organizer.py` (`PROMPT_FORMAL` e `PROMPT_PREPARATORIO`)
- Os algoritmos de parsing (`whatsapp_parser.py`), mapeamento de áudio e detecção de formato
- A arquitetura de pipeline assíncrono com controle de concorrência via semáforo
- A estrutura, organização e nomenclatura dos módulos e componentes do sistema

---

*Este documento foi elaborado para fins de registro de programa de computador junto ao Instituto Nacional da Propriedade Industrial (INPI), conforme Lei nº 9.609/98 (Lei do Software) e demais normas aplicáveis.*
