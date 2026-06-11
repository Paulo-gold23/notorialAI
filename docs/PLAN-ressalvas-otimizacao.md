# Plano de Projeto: Otimização de Ressalvas (Grandes Documentos)

Este documento detalha o planejamento das melhorias de usabilidade e performance nas ressalvas do LegisVox.

## Overview
Para melhorar a fluidez de seleção e navegação das ressalvas em documentos muito extensos, implementaremos:
1. **Posicionamento Reativo do Botão de Confirmação**: Atualização de posição ao rolar/redimensionar a tela, evitando que o botão desapareça.
2. **Navegação Bidirecional**: Clique direto nas marcações laranja do editor rola a barra lateral até o respectivo card.
3. **Modo Contínuo de Ressalva**: Manter o modo ativo após salvar uma ressalva para inserções em sequência.
4. **Otimização de Latência e CPU**: Remover a animação infinita de pintura no editor para eliminar lentidão imediata.

## File Structure
- `notorial-web/src/pages/Review.jsx` (Lógica e Handlers)
- `notorial-web/src/styles/globals.css` (Visual do feedback de destaque)

## Task Breakdown

### Task 1: Modo Contínuo de Ressalva
- **Agent**: `frontend-specialist`
- **Description**: Modificar `handleConfirmSelection` em `Review.jsx` para não desativar o modo de anotação. Alterar o botão do banner superior para "Concluir (Sair)".
- **Verification**: Adicionar uma ressalva e verificar se é possível adicionar a próxima imediatamente sem clicar em "+ Adicionar Ressalva".

### Task 2: Eliminar Pintura Infinita (globals.css)
- **Agent**: `frontend-specialist`
- **Description**: Remover `animation: annotationPulse ...` da regra `.ProseMirror-wrapper.is-annotation-mode .ProseMirror`.
- **Verification**: Ativar o modo de ressalva em documento grande e observar o consumo de CPU / resposta rápida da interface.

## Phase X: Verification
- [x] Rodar `npm run lint` e verificar ausência de erros (Sucesso)
- [x] Rodar `npm run build` e verificar ausência de erros (Sucesso)
- [x] Testar múltiplos cadastros em sequência (Modo Contínuo funcionando)
- [x] Eliminar lag de pintura do ProseMirror (Animação de pulso removida)

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Build: ✅ Success
- Date: 2026-06-11
