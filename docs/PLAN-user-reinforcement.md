# Plano de Projeto: Reforços e Dicas de Uso ao Usuário

Este documento detalha o planejamento das melhorias visuais e textuais para instruir os advogados sobre boas práticas de uso, a necessidade de download de mídias e a responsabilidade de auto-autenticação.

## Overview
Para tornar o uso da plataforma mais seguro e transparente, implementaremos:
1. **Grid de Dicas Rápidas na Dashboard**: Uma seção contendo 3 cartões estáticos acima do rodapé para reforçar boas práticas sem atrapalhar a interface principal.
2. **Atualização nos Termos de Uso**: Inclusão de termos explícitos quanto à responsabilidade do advogado de baixar suas mídias integradas e sobre o fato de que o próprio advogado realiza a autenticação do documento gerado (sob a legislação brasileira).

## File Structure
- `notorial-web/src/pages/Dashboard.jsx` (Dicas visuais na dashboard)
- `notorial-web/src/pages/TermsOfUse.jsx` (Cláusulas complementares nos termos)

## Task Breakdown

### Task 1: Seção de Dicas na Dashboard (`Dashboard.jsx`)
- **Agent**: `frontend-specialist`
- **Description**: Inserir uma seção de 3 cartões com grid CSS acima do componente `<LegalFooter />`. O design usará a paleta padrão do sistema (sem tons de roxo), bordas finas com `--border-color`, e ícones da biblioteca `lucide-react`:
  - **Cartão 1 (Download de Mídias)**:
    - *Ícone*: `DownloadCloud` (cor azul/info: `var(--primary-color)`)
    - *Título*: Baixe suas Mídias
    - *Descrição*: Lembre-se de baixar todas as mídias (áudios e imagens) que incorporam sua conversa para anexar ao seu processo.
  - **Cartão 2 (Autenticação pelo Advogado)**:
    - *Ícone*: `FileCheck` ou `Scale` (cor ouro/alerta: `var(--gold-to)`)
    - *Título*: Autenticação pelo Advogado
    - *Descrição*: O próprio advogado realiza a autenticação do documento gerado sob sua responsabilidade profissional (Art. 425, IV, CPC).
  - **Cartão 3 (Resumos e Compartilhamento)**:
    - *Ícone*: `Users` ou `FileText` (cor verde: `var(--success)`)
    - *Título*: Resuma & Compartilhe
    - *Descrição*: Use a plataforma para resumir a conversa com seu cliente e repassar o caso para outro advogado de forma ágil.
- **Verification**: Visualizar a dashboard e garantir que os cartões são responsivos (flex/grid horizontal em telas largas e empilhados em telas pequenas).

### Task 2: Atualização dos Termos de Uso (`TermsOfUse.jsx`)
- **Agent**: `frontend-specialist`
- **Description**: Atualizar as seguintes cláusulas:
  - **Seção 2.3 (Inexistência de Fé Pública)**: Adicionar que, de acordo com o Art. 425, IV, do CPC e legislação aplicável, cabe ao próprio advogado realizar a autenticação e validação do documento gerado sob sua fé profissional.
  - **Seção 4.4 (Guarda do Relatório)**: Explicitar que o usuário deve obrigatoriamente baixar e arquivar todas as mídias (áudios, imagens e arquivos) integradas à conversa.
  - **Seção 8.2 (Responsabilidade de Armazenamento)**: Reinforçar que, devido ao descarte irreversível em 24h, o download de todas as mídias vinculadas à conversa é de inteira responsabilidade do Usuário.
- **Verification**: Acessar `/terms` e verificar se os novos textos estão corretos e legíveis.

### Task 3: Otimização de Ressalvas (Sem Repetição de Trecho e com Contador)
- **Agent**: `frontend-specialist` / `backend-specialist`
- **Description**:
  - Remover a exibição do trecho grifado (`r.excerpt`) nos cards de ressalva no desktop e mobile (`Review.jsx`), deixando apenas a referência (`RESSALVA [N]`) e a observação (`r.note`).
  - Remover `ref. ao trecho: ...` do bloco de compilação de ressalvas no PDF (`pdf_generator.py`).
  - Adicionar contagem dinâmica e exibição de `Total de ressalvas/observações inseridas` no painel de "Verificação final" do PDF (`pdf_generator.py`).
- **Verification**: Gerar o PDF e verificar que a lista de ressalvas ao final de cada dia exibe apenas o índice e a observação, e que o contador no bloco final de auditoria bate exatamente com a quantidade de ressalvas inseridas.

## Phase X: Verification
- [x] Rodar `npm run lint` e verificar ausência de erros (Sucesso)
- [x] Rodar `npm run build` e certificar que a compilação ocorre com sucesso (Sucesso)
- [x] Testar renderização responsiva dos cartões de dicas da dashboard (Sucesso)
- [x] Validar a leitura e formatação dos textos nos Termos de Uso (Sucesso)
- [x] Verificar que a lista de ressalvas no PDF e na barra lateral não repete o trecho grifado (Sucesso)
- [x] Confirmar exibição e precisão do contador de ressalvas na caixa de verificação final (Sucesso)
