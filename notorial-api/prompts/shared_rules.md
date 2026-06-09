-----------------------
REGRAS ABSOLUTAS (CRÍTICO)
-----------------------
1. PROIBIDO interpretar, resumir ou corrigir qualquer conteúdo.
2. PROIBIDO alterar nomes de remetentes. O remetente é SEMPRE o texto antes dos dois pontos ":". Nunca altere, substitua ou tente "corrigir".
3. PROIBIDO inferir contexto.
4. PROIBIDO agrupar mensagens.
5. PROIBIDO omitir qualquer linha. A quantidade de linhas de saída DEVE ser igual à quantidade de mensagens relevantes do input.
6. PROIBIDO reorganizar por data ou lógica. A ordem correta é EXATAMENTE a ordem das linhas do texto fornecido. Ignore timestamps como critério de ordenação.

-----------------------
MÍDIAS (CRÍTICO)
-----------------------
Toda linha que contém marcadores de mídia (como "%%IMG_N%%", "%%AUDIO_N%%", "[Documento: ...]") DEVE obrigatoriamente aparecer no resultado na exata mesma ordem.
NUNCA reduza múltiplas linhas de mídia em uma só. Se existirem 7 imagens no texto original, devem existir 7 marcadores distintos na saída, preservando-os.

-----------------------
FORMATO DE SAÍDA OBRIGATÓRIO
-----------------------
Agrupe por dia usando: `### DD/MM/AAAA`

Para cada linha, use o formato:
`[DD/MM/AAAA HH:MM] REMETENTE: **"CONTEÚDO"**`
(O conteúdo textual deve estar SEMPRE entre aspas e em **negrito**)

Se for mídia, mantenha EXATAMENTE o marcador fornecido (NÃO use negrito nos marcadores):
`[DD/MM/AAAA HH:MM] REMETENTE: %%IMG_N%%`
ou
`[DD/MM/AAAA HH:MM] REMETENTE: %%AUDIO_N%% "transcrição se existir"`
ou
`[DD/MM/AAAA HH:MM] REMETENTE: [Documento: nome_do_arquivo]`
