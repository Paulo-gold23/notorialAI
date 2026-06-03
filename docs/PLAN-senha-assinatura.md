# Plano de Implementação: Senha de Assinatura (PIN de 4 dígitos) no LegisVox

Este plano descreve o design e a estratégia de implementação para adicionar uma camada de verificação extra no LegisVox. No momento de confirmar o documento (gerar PDF ou salvar alterações no editor), o advogado deve digitar um PIN numérico de 4 dígitos. A senha é definida logo no login/tela de upload se o usuário ainda não a possuir, e pode ser redefinida no perfil do cliente ou recuperada via código enviado por e-mail se for bloqueada (após 5 erros consecutivos).

## Success Criteria
- [ ] Segurança: O PIN de 4 dígitos é armazenado apenas em formato hash SHA-256 no banco de dados, salgado com o UUID do usuário para evitar ataques de tabela pré-computada.
- [ ] Bloqueio Automático: Após 5 tentativas de verificação incorretas seguidas, o PIN é bloqueado. Qualquer tentativa de verificação subsequente é rejeitada imediatamente com status bloqueado.
- [ ] Fluxo de Recuperação: Um link ou botão "Esqueci meu PIN" envia um código de redefinição de 6 dígitos para o e-mail cadastrado do usuário logado via SMTP, permitindo desbloquear e cadastrar um novo PIN.
- [ ] UX do Novo Usuário (Modal de Bloqueio): Usuários logados sem PIN cadastrado são interceptados na tela de `/upload` por um modal obrigatório que exige o cadastro do PIN de 4 dígitos antes do upload do ZIP.
- [ ] UX do Usuário Existente: Página de perfil (`Profile.jsx`) exibe a opção para cadastrar ou alterar o PIN de assinatura.
- [ ] UX de Confirmação: A tela de revisão (`Review.jsx`) exige o PIN de 4 dígitos antes de concluir o salvamento de alterações e a geração/download do PDF.
- [ ] Auditoria: Ações como `senha_assinatura_criada`, `senha_assinatura_alterada`, `documento_assinado_sucesso` e `tentativa_assinatura_falha` são auditadas no banco com o IP e fingerprint do dispositivo.

---

## Tech Stack
- **Database**: Supabase PostgreSQL (para colunas de segurança na tabela `advogados` e registros de auditoria em `audit_logs`).
- **Backend**: FastAPI (Python), biblioteca padrão `hashlib` para hash salted do PIN, `smtplib` e `email` para envio do token via SMTP.
- **Frontend**: React (Vite), Zustand/contexto local para estado, Tailwind CSS/Vanilla CSS para estilos premium coerentes com o app, ícones Lucide React.
- **Mapeamento de E-mail**: Configurações de SMTP configuradas no `.env` do backend e mapeadas em `config.py`.

---

## File Structure

```text
notorial-api/
├── config.py                            # Mapeamento de SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
├── routers/
│   └── auth.py                          # Novos endpoints (/api/auth/signature-pin/...)
└── tests/
    └── test_signature_pin.py            # [NEW] Testes unitários do fluxo de PIN, rate limit e reset

notorial-web/src/
├── App.jsx                              # Interceptação de advogados sem PIN
├── components/
│   ├── SignaturePinPromptModal.jsx      # [NEW] Modal para definir o PIN inicialmente
│   └── ResetSignaturePinModal.jsx       # [NEW] Modal para digitar o token do e-mail e redefinir o PIN
├── pages/
│   ├── Profile.jsx                      # Nova seção de PIN no Perfil do cliente
│   └── Review.jsx                       # Inserção do PIN ao salvar/gerar PDF
└── services/
    └── api.js                           # Métodos de chamada de API do PIN de assinatura
```

---

## Task Breakdown

### P0: Foundation & Database

#### [MODIFY] `task_db_migration` - Criar migração do banco de dados (tabela advogados)
- **Agent**: `database-architect`
- **Skills**: `database-migrations-sql-migrations`, `supabase-postgres-best-practices`
- **Priority**: P0
- **Dependencies**: Nenhuma
- **INPUT**: N/A
- **OUTPUT**: Arquivo de migração `supabase/migrations/20260603_add_signature_pin.sql`
- **Description**: Adicionar colunas necessárias na tabela `public.advogados` para armazenar de forma segura o PIN e controlar as tentativas falhas de login.
  ```sql
  ALTER TABLE public.advogados 
      ADD COLUMN IF NOT EXISTS senha_assinatura_hash VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS senha_assinatura_erros INTEGER DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS senha_assinatura_bloqueado BOOLEAN DEFAULT FALSE NOT NULL,
      ADD COLUMN IF NOT EXISTS senha_assinatura_token_hash VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS senha_assinatura_token_exp TIMESTAMPTZ DEFAULT NULL;
  ```
- **VERIFY**: Executar a migração no Supabase e validar a estrutura usando `list_tables` e `execute_sql`.

---

### P1: Backend Logic & Endpoints

#### [MODIFY] `task_backend_config` - Mapear parâmetros de SMTP em config.py
- **Agent**: `backend-specialist`
- **Skills**: `fastapi-pro`, `clean-code`
- **Priority**: P1
- **Dependencies**: Nenhuma
- **INPUT**: [config.py](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-api/config.py)
- **OUTPUT**: Variáveis de ambiente SMTP no `.env.example` e em [config.py](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-api/config.py)
- **Description**: Mapear `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` na classe `Settings` para viabilizar o envio do código de redefinição por e-mail.
- **VERIFY**: Executar o servidor FastAPI localmente e certificar-se de que a inicialização não falha por variáveis ausentes.

#### [MODIFY] `task_backend_endpoints` - Criar endpoints de gerenciamento do PIN
- **Agent**: `backend-specialist`
- **Skills**: `fastapi-router-py`, `fastapi-pro`
- **Priority**: P1
- **Dependencies**: `task_db_migration`, `task_backend_config`
- **INPUT**: [auth.py](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-api/routers/auth.py)
- **OUTPUT**: Endpoints de PIN em [auth.py](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-api/routers/auth.py)
- **Description**: Criar e implementar:
  1. `POST /api/auth/signature-pin/set`: Salva o hash do PIN de 4 dígitos (`SHA-256` salgado com o `id` do advogado).
  2. `POST /api/auth/signature-pin/verify`: Recebe o PIN de 4 dígitos, valida.
     - Se correto: zera `senha_assinatura_erros` e retorna sucesso.
     - Se incorreto: incrementa `senha_assinatura_erros`. Se atingir 5 erros, define `senha_assinatura_bloqueado = true` e retorna erro de bloqueio.
     - Se a conta já estiver marcada como bloqueada, rejeita imediatamente.
  3. `POST /api/auth/signature-pin/forgot`: Gera um token numérico de 6 dígitos aleatório, salva o hash do token e expiração (15 minutos) e envia por e-mail para o usuário.
  4. `POST /api/auth/signature-pin/reset`: Valida o token de 6 dígitos e altera o PIN de 4 dígitos, resetando bloqueio e erros.
  - *Auditoria*: Gravar registros na tabela `audit_logs` para cada alteração, erro de senha ou bloqueio.
- **VERIFY**: Escrever testes automatizados em `notorial-api/tests/test_signature_pin.py` verificando todos os cenários acima (sucesso, falha até bloqueio, expiração do token e redefinição).

---

### P2: Frontend UI & Components

#### [NEW] `task_frontend_modal_set` - Criar Componente Modal de Configuração de PIN
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `react-patterns`
- **Priority**: P2
- **Dependencies**: `task_backend_endpoints`
- **INPUT**: N/A
- **OUTPUT**: [SignaturePinPromptModal.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/components/SignaturePinPromptModal.jsx)
- **Description**: Componente de modal com interface premium para inserção de um PIN numérico de 4 dígitos (com campos de input separados por dígito para melhor usabilidade mobile/desktop). Deve pedir confirmação do PIN.
- **VERIFY**: Validar que o componente renderiza corretamente, suporta navegação por teclado e valida que os caracteres são exclusivamente numéricos.

#### [MODIFY] `task_frontend_modal_integration` - Interceptar upload de arquivos se PIN não configurado
- **Agent**: `frontend-specialist`
- **Skills**: `react-state-management`, `react-patterns`
- **Priority**: P2
- **Dependencies**: `task_frontend_modal_set`
- **INPUT**: [App.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/App.jsx)
- **OUTPUT**: Lógica de verificação global no [App.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/App.jsx)
- **Description**: Verificar se o advogado possui `senha_assinatura_hash` no Supabase (pode ser retornado junto no endpoint de perfil ou verificação do CPF). Caso esteja nulo, abrir o modal de configuração de PIN de forma obrigatória antes que o usuário faça o upload.
- **VERIFY**: Logar em uma conta nova (ou com o PIN nulo no banco) e tentar acessar a tela de upload. O modal deve se abrir e bloquear ações até que o PIN seja criado.

#### [MODIFY] `task_frontend_profile_option` - Adicionar controle de PIN na tela de Perfil
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`, `react-patterns`
- **Priority**: P2
- **Dependencies**: `task_backend_endpoints`
- **INPUT**: [Profile.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/pages/Profile.jsx)
- **OUTPUT**: Painel de segurança estendido em [Profile.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/pages/Profile.jsx)
- **Description**: Adicionar uma seção "Assinatura Eletrônica" no card de Segurança do Perfil. Permitir que advogados que ainda não cadastraram o façam ali, ou que alterem o PIN atual (neste caso, por não haver usuários prévios com PIN cadastrado, o botão apenas solicitará a nova senha de 4 dígitos).
- **VERIFY**: Navegar até a página `/profile`, clicar na opção de definir/alterar PIN, digitar a senha e receber o toast de sucesso após a chamada do backend.

#### [MODIFY] `task_frontend_review_pin` - Solicitar PIN antes de Salvar ou Gerar PDF
- **Agent**: `frontend-specialist`
- **Skills**: `react-ui-patterns`, `clean-code`
- **Priority**: P2
- **Dependencies**: `task_backend_endpoints`
- **INPUT**: [Review.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/pages/Review.jsx)
- **OUTPUT**: Lógica de validação integrada no [Review.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/pages/Review.jsx)
- **Description**: Ao clicar em "Salvar Edições" ou "Aceitar e Gerar PDF" (após aceitar os termos), abrir um modal solicitando o PIN de 4 dígitos. A ação real só deve ser despachada para o backend se a chamada de `/api/auth/signature-pin/verify` retornar sucesso.
  - Tratar erro de PIN bloqueado (exibir aviso e botão "Recuperar senha").
  - Tratar erro de PIN incorreto (exibir mensagem com número de tentativas restantes).
- **VERIFY**: Tentar salvar modificações ou gerar PDF. O sistema deve abrir o prompt de PIN, validar a resposta e, em caso de sucesso, executar a ação. Em caso de 5 erros seguidos, a conta deve ser bloqueada para assinatura de atas.

#### [NEW] `task_frontend_pin_reset` - Modal de Redefinição/Recuperação de PIN por E-mail
- **Agent**: `frontend-specialist`
- **Skills**: `react-ui-patterns`, `frontend-design`
- **Priority**: P2
- **Dependencies**: `task_frontend_review_pin`
- **INPUT**: N/A
- **OUTPUT**: [ResetSignaturePinModal.jsx](file:///c:/Users/usuario/Documents/LEGISVOX%20v2.3/notorial-web/src/components/ResetSignaturePinModal.jsx)
- **Description**: Modal aberto a partir do botão "Esqueci minha senha de assinatura" (exibido nos prompts de PIN ou no Perfil).
  1. Envia uma chamada para gerar o código de recuperação por e-mail.
  2. Apresenta o formulário para digitar o código de 6 dígitos enviado ao e-mail.
  3. Solicita a nova senha de assinatura de 4 dígitos para concluir a redefinição e desbloquear a conta.
- **VERIFY**: Bloquear o PIN de uma conta de teste. Clicar em redefinir, confirmar o envio do código, verificar no e-mail (ou log do backend), digitar o código de 6 dígitos no modal, definir um novo PIN de 4 dígitos e testar a assinatura com o novo PIN.

---

## Verification Plan

### Automated Tests
- Criar script de testes unitários no backend `notorial-api/tests/test_signature_pin.py`.
- Rodar os testes usando:
  ```bash
  python -m pytest tests/test_signature_pin.py
  ```

### Manual Verification
1. **Configuração SMTP local**: Configurar variáveis SMTP no `.env` do backend com credenciais válidas (ou usar servidor SMTP fake, como Mailtrap, para testes).
2. **Definição de PIN no Login**: Criar novo usuário (ou deletar `senha_assinatura_hash` do advogado atual no banco). Ao logar e ir na tela de Upload, verificar se o modal exige a definição do PIN de 4 dígitos.
3. **Validação no Perfil**: Ir em `/profile` e usar a seção "Assinatura Eletrônica" para alterar a senha.
4. **Validação na Revisão**: Ir em `/review/<id>`, tentar salvar edições ou gerar PDF. Confirmar que o PIN é cobrado.
5. **Teste de Bloqueio**: Errar o PIN de profissional por 5 vezes consecutivas. Verificar se o sistema bloqueia e impede tentativas.
6. **Teste de Redefinição por E-mail**: Clicar em "Esqueci minha senha" na tela bloqueada, obter o token de 6 dígitos enviado por e-mail, digitá-lo no modal para resetar a senha, definir um novo PIN e confirmar que o acesso de assinatura foi reestabelecido.

### Compliance Rule Checks
- [ ] O visual dos novos componentes deve usar o sistema de cores existente (tons metálicos, cinzas, detalhes dourados) sem utilizar qualquer código hexadecimal violeta ou roxo (Purple Ban).
- [ ] O layout e os inputs dos modais de PIN devem ser responsivos e adaptados para dispositivos móveis (Touch Targets adequados).
- [ ] Garantir que ações críticas geram registros na tabela `audit_logs`.
