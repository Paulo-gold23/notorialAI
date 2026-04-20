# Plano de Implementação (Orquestração)

## 📌 Contexto
1. **Problema da Sessão**: O usuário permanece logado permanentemente. Precisamos de um timeout de inatividade (ex: 30 a 60 minutos) que faça o logoff automático por segurança.
2. **Problema de Roteamento**: Atualmente, a rota `/` (raiz) mostra o Dashboard se o usuário estiver logado. É desejável que a rota `/` sempre apresente a Landing Page, exibindo um botão "Acessar Dashboard" caso o usuário já esteja autenticado, e as rotas da aplicação fiquem reservadas sob caminhos como `/dashboard`.
3. **Cold Start do Backend**: O backend no Render.com "dorme" após 15 minutos sem requisições na camada gratuita. Isso gera um atraso na primeira requisição (cold start). A melhor prática é configurar um ping regular (a cada 10-14 minutos).

## 🛠️ Agentes a Serem Utilizados na Fase 2
- **`frontend-specialist`**: Resolver o roteamento do React Router e criar o componente/hook de *Session Timeout*.
- **`devops-engineer`**: Implementar e instruir sobre a solução de ping para manter o backend ativo (pode ser executado no próprio VPS da Hostinger usando `cron` ou ferramentas simples).
- **`test-engineer`**: Verificará os comportamentos de timeout e se o app não vai quebrar na mudança do router.

## 📝 Ações Planejadas

### 1. Roteamento (Frontend)
- Modificar `notorial-web/src/App.jsx` para definir `/` com o `<LandingPage />` independente de o usuário estar logado ou não.
- Mover `<Dashboard />` logado para a rota explícita `/dashboard`.
- Modificar `<LandingPage />` para exibir "Acessar Dashboard" caso a sessão esteja ativa, ao invés do botão "Iniciar Grátis" e remover as âncoras para `#/login` em casos que o usuário está logado.

### 2. Timeout de Sessão (Frontend)
- Criar o componente/hook global `useSessionTimeout` (ou equivalente). Ele rastreará as ações do usuário (`mousemove`, `keydown`, `touchstart`).
- Após um período determinado (ex: 30 minutos sem interação), chamar a função de auth signOut() e redirecionar para `/login`.

### 3. Mitigação do Cold Start (Backend/Devops)
- Uma rota leve `/health` será adicionada/verificada na API.
- Configuração de um script de Ping nas opções do Hostinger Cron Jobs ou através do UptimeRobot (que faça um request a cada 13 minutos).

---

> **Aprovação Necessária:**
> Por favor, confira o plano acima e confirme para executarmos as correções. Você prefere qual tempo para o timeout da sessão (ex: 30 minutos)? E sobre o ping, prefere que eu configure um pequeno script para seu servidor Hostinger, ou que eu mostre como cadastrar no UptimeRobot?
