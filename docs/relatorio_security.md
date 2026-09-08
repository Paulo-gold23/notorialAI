> 🔒 **Localização e sugestão de correção disponíveis no PROguard.** Este relatório FREE mostra o que foi encontrado, não onde nem como corrigir.

# Relatório de Segurança — Paulo-gold23/notorialAI

**Scan:** `cmtixjg1d006q1uuiqaucxp22` · MANUAL · branch `main` · commit `ca6e3c92be0e`
**Status:** COMPLETED · **Executado em:** 2026-09-01T17:17:06.157Z · **Concluído em:** 2026-09-01T17:19:50.848Z
**Relatório gerado em:** 2026-09-01T17:20:59.652Z por GitGuard

## Instruções para a IA que for corrigir isto

- Repositório alvo: Paulo-gold23/notorialAI, branch "main", commit ca6e3c92be0e3aea971bccc92989331976881f02. Aplique as correções diretamente nesse checkout.
- Em "dependencyUpgrades", cada entrada agrupa TODOS os CVEs de um mesmo pacote — faça UM upgrade por pacote (para "recommendedVersion" ou mais recente), não uma correção por CVE.
- Em "secrets", nunca tente adivinhar ou reconstruir o valor original do segredo (ele foi propositalmente redigido) — apenas remova/rotacione conforme "remediation".
- Depois de aplicar as correções, rode os testes existentes do projeto e, se disponível, o linter/build antes de considerar concluído.

## Resumo

- **Total de findings:** 25
- **Por severidade:** HIGH: 6 · MEDIUM: 16 · LOW: 3
- **Por scanner:** SEMGREP: 15 · TRIVY: 10

## Dependências para atualizar

### 📦 `python-multipart` (8 CVEs) — severidade máxima: HIGH

**Ação recomendada:** atualizar de `0.0.9` para `a versão mais recente` (ou superior).

| Severidade | CVE | Descrição | Corrigido em |
|---|---|---|---|
| HIGH | CVE-2024-53981 | python-multipart: python-multipart has a DoS via deformation `multipart/form-data` boundary | — |
| HIGH | CVE-2026-24486 | python-multipart: Python-Multipart: Arbitrary file write via path traversal vulnerability | — |
| HIGH | CVE-2026-42561 | python-multipart: python-multipart: Denial of Service via excessive multipart part headers | — |
| HIGH | CVE-2026-53539 | python-multipart: Python-Multipart: Denial of Service via crafted form-urlencoded bodies | — |
| MEDIUM | CVE-2026-40347 | python-multipart: Python-Multipart: Denial of Service via crafted multipart/form-data requests | — |
| LOW | CVE-2026-53537 | multipart: Python-Multipart: Information disclosure via header parsing discrepancy | — |
| LOW | CVE-2026-53538 | python-multipart: Python-Multipart: Information disclosure due to parser differential in form data handling | — |
| LOW | CVE-2026-53540 | python-multipart: Python-Multipart: Negative Content-Length in parse_form buffers the entire body in memory | — |

### 📦 `react-router` (1 CVE) — severidade máxima: HIGH

**Ação recomendada:** atualizar de `7.18.2` para `a versão mais recente` (ou superior).

| Severidade | CVE | Descrição | Corrigido em |
|---|---|---|---|
| HIGH | — | React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response | — |

### 📦 `python-dotenv` (1 CVE) — severidade máxima: MEDIUM

**Ação recomendada:** atualizar de `1.0.1` para `a versão mais recente` (ou superior).

| Severidade | CVE | Descrição | Corrigido em |
|---|---|---|---|
| MEDIUM | CVE-2026-28684 | python-dotenv: python-dotenv: Arbitrary file overwrite via symbolic link following | — |

## Outros findings

| Severidade | Scanner | Categoria | Título | Local |
|---|---|---|---|---|
| HIGH | SEMGREP | SAST | Semgrep Finding: rules.dockerfile.security.missing-user.missing-user | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.generic.error_disclosure.generic_error_disclosure | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.html.security.audit.missing-integrity.missing-integrity | — |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.timing_attack_node.node_timing_attack | — |
