# PLAN: Blindagem Arquitetural para Concorrência e Arquivos Grandes (LegisVox)

> **Status:** Congelado para alinhamento com a equipe (Setembro/2026)  
> **Objetivo:** Proposta técnica para prevenir gargalos de memória (OOM), sobrecarga de CPU e limites de API (OpenAI Rate Limits) em cenários de múltiplos advogados processando simultaneamente conversas imprevisíveis.

---

## 1. Contexto & Dados Reais Coletados

No teste de estresse de um arquivo de **345 páginas** (~120 MB ZIP, 7.200 mensagens, 271 áudios) na VPS Hostinger KVM2 (2 vCPUs, 8 GB RAM), foram aferidos os seguintes consumos máximos:

* **API (`legisvox_api`):** Pico de **998 MB de RAM** (limite Docker: 2.0 GB) e **102% de CPU** (1 núcleo vCPU).
* **PDF (`legisvox_gotenberg`):** O Chromium consome entre **800 MB e 1.2 GB de RAM** durante 30 a 60 segundos para compilar ~200 a 350 páginas.
* **OpenAI (Tokens):** ~500.000 tokens por documento gigante.
* **Memória Global da VPS:** Permanece com mais de **6.5 GB de RAM livres** no uso unitário.

---

## 2. Cenário de Risco Hipotético (Sem Blindagem)

Se 3 ou mais advogados dispararem o processamento ou exportação de documentos de 300+ páginas no mesmo minuto:
1. **API:** 3 × 800 MB = 2.4 GB ➔ Ultrapassa o limite de 2.0 GB do container (`OOMKilled`).
2. **Gotenberg:** 3 PDFs simultâneos = 3.0 GB ➔ Ultrapassa o limite de 1.5 GB do container (`OOMKilled`).
3. **OpenAI:** > 1 milhão de tokens em 1 minuto ➔ Erro HTTP `429 Too Many Requests` em contas Pay-as-you-go.

---

## 3. As 3 Soluções Propostas

### Blindagem 1: Fila Inteligente da API (`MAX_CONCURRENT_PIPELINES = 2`)
* **Proposta:** Limitar o processamento concorrente pesado para 2 arquivos simultâneos por padrão na KVM2.
* **Benefício:** A API consome no máximo `2 × 800 MB = 1.6 GB` de RAM (sempre dentro da margem de 2.0 GB).
* **Experiência do Usuário:** O 3º usuário entra em fila suavemente com a mensagem:  
  *"Aguardando liberação na fila de processamento..."* sem receber erro ou falha.

### Blindagem 2: Gotenberg Guard (Fila de 1 PDF Pesado por Vez)
* **Proposta:** Adicionar um semáforo de concorrência (`asyncio.Semaphore(1)`) na rota de geração de PDF do backend e subir timeout de 90s para 180s.
* **Benefício:** O Chromium processa um PDF por vez (leva 30-45s). Garante que o Gotenberg nunca ultrapasse 1.2 GB de RAM, eliminando qualquer risco de queda do container.

### Blindagem 3: Tolerância a Picos de Tokens na OpenAI (429 Backoff com Jitter)
* **Proposta:** Em caso de HTTP 429 da OpenAI, ler o cabeçalho `retry-after` e aplicar espera inteligente com até 5 tentativas.
* **Benefício:** Se houver pico de uso simultâneo que encoste na cota de tokens por minuto (TPM), a API aguarda a janela liberar sem quebrar o processamento do advogado.

---

## 4. Próximos Passos (Quando Descongelar)

1. Validação com a equipe de negócios/produto sobre os tempos aceitáveis de fila.
2. Definição se o semáforo de PDF deve ser 1 ou 2 simultâneos.
3. Aplicação dos ajustes com testes unitários no ambiente de desenvolvimento.
