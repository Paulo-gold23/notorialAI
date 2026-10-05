# O que o LegisVox registra hoje (válido apenas daqui para frente)

> Nada abaixo vale retroativamente: relatórios emitidos antes do deploy das Sprints 3 e 4 **não têm** recibo.

## Recibo de processamento (`processing_receipts`)
Gravado ao fim do processamento do ZIP. Só metadados, sem conteúdo de conversa e **sem vínculo com a conta**.

- protocolo (`LVX-XXXXXXXX`), data/hora (UTC) do recebimento;
- nome, tamanho e SHA-256 do ZIP;
- inventário por arquivo do ZIP (nome, tamanho, SHA-256; limite de 5.000 entradas, com indicador de truncamento);
- totais do parser (mensagens, áudios, imagens) e contagem de áudios enviados à transcrição, mesclados e sem transcrição;
- modelo de IA, modelo de transcrição, temperatura, SHA-256 dos prompts, versão do template e versão do app (`APP_VERSION` ou `GIT_SHA`; `unknown` se não definida).

## Recibo de emissão (`pdf_issuance_receipts`)
Gravado a cada PDF gerado: SHA-256 do PDF, hash da emissão anterior, SHA-256 do HTML de entrada, nº de anotações, nº da emissão, UTC, versões. O PDF imprime "EMISSÃO: N.º n" e, da 2ª emissão em diante, o hash da emissão anterior.

## Garantias e limites
- Tabelas somente de inserção (trigger bloqueia `UPDATE`/`DELETE`), sem chave estrangeira para `atas`: o job `delete-old-atas` (24h) não as afeta. Não há política de expiração.
- Gravação em melhor esforço: se falhar, o processamento e o PDF seguem e há aviso no log.
- O verificador público consulta `atas` primeiro e, depois, os recibos.
- O recibo comprova **o que a plataforma emitiu e quando**; não comprova a origem do ZIP nem a coleta no aparelho.

## Quadro-resumo do PDF
Contagens calculadas do próprio documento, em declaração da própria plataforma, sem avaliação independente. Anotações: contagem = numeração impressa, um trecho = uma anotação.

## Não registrado hoje
ZIP original (não é guardado); autoria e data de cada anotação; histórico de cada "Salvar"; `ata_id` no log de PIN; correção de avisos de sistema colados à mensagem anterior pelo parser (limitação conhecida); edição/exclusão de parte de um trecho anotado (limitação conhecida); reemissão após 24h (não existe: reprocessar gera nova ata).

## Operação
- `delete-old-atas` (pg_cron, de hora em hora) existe só no banco, fora do repositório.
- Definir `APP_VERSION` (ou `GIT_SHA`) no deploy para que o recibo registre a versão.
