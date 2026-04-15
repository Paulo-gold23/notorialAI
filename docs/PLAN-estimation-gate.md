# PLAN: Estimation Gate — Barreira de Créditos no Upload

## Objetivo
Implementar um checkpoint de créditos **entre** o upload do ZIP e o processamento com IA, impedindo que documentos sejam processados sem saldo suficiente.

## Princípio: Não Quebrar o Existente
- O endpoint `/api/atas/upload` atual **não será modificado** — será mantido intacto.
- O frontend `Upload.jsx` receberá uma etapa intermediária inserida **antes** do disparo do processamento.
- Nenhum componente fora do Upload será alterado.

---

## Arquitetura do Fluxo

```
[ANTES]  Upload ZIP → Processa tudo imediatamente → Ready

[DEPOIS] Upload ZIP → Parse rápido (estima páginas) → 
         → PAUSA: mostra estimativa + saldo → 
         → Usuário confirma → Debita créditos → Processa com IA → Ready
```

---

## Tarefas

### BACKEND

#### Tarefa 1: Novo endpoint `POST /api/atas/upload/estimate`
- Recebe o ZIP + datas (igual ao upload atual)
- Faz **apenas** o parse rápido (sem transcrição, sem IA)
- Chama `credits_service.estimate_pages(parsed_data, audio_file_sizes)`
- Retorna: `{ ata_id, estimated_pages, balance, has_credits }`
- **Guarda o ZIP em memória** temporariamente (cache) para não forçar re-upload

#### Tarefa 2: Novo endpoint `POST /api/atas/upload/confirm`
- Recebe `{ ata_id }`
- Verifica saldo via `credits_service.has_sufficient_credits()`
- Debita via `credits_service.debit_credits()`
- Dispara `_process_pipeline()` (a pipeline existente, intocada)
- Retorna: `{ status: "processing", ata_id }`

#### Tarefa 3: Manter `/api/atas/upload` original como fallback

### FRONTEND

#### Tarefa 4: Nova etapa "Estimation Gate" no `Upload.jsx`
- Após o usuário clicar "Enviar", chama `/upload/estimate` em vez de `/upload`
- Mostra um card intermediário com:
  - "Estimamos **X páginas** para este documento"
  - "Seu saldo atual: **Y créditos**"
  - Se Y >= X: Botão verde "Confirmar e Processar (debitar X créditos)"
  - Se Y < X: Alerta + Botão "Comprar Créditos" (vai pra `/credits`)
- Ao confirmar, chama `/upload/confirm` e segue o fluxo de polling existente

#### Tarefa 5: Adicionar `estimateUpload()` e `confirmUpload()` em `api.js`

### SEGURANÇA
#### Tarefa 6: Validação de ownership e race conditions
- Cache ZIP expira em 10min
- Não permitir double-debit (confirmar 2x o mesmo ata_id)

---

## Arquivos Afetados

| Arquivo | Tipo de Mudança |
|---------|----------------|
| `notorial-api/routers/atas.py` | 2 novos endpoints + cache temporário |
| `notorial-web/src/pages/Upload.jsx` | Nova etapa intermediária de confirmação |
| `notorial-web/src/services/api.js` | 2 novas funções (estimate + confirm) |

## Arquivos NÃO Afetados (zero risco de regressão)
- `Dashboard.jsx`, `Credits.jsx`, `Review.jsx`, `credits.py` (service/router), `globals.css`
