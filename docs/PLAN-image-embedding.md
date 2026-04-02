# PLAN: Inserção de Imagens na Ata Notarial

## Objetivo
Permitir que as imagens ("mídias omitidas" ou ocultas) contidas no arquivo ZIP do WhatsApp sejam efetivamente renderizadas dentro do Documento Preparatório e Formal (Ata Final), na ordem cronológica exata, com o respectivo timestamp.

## Arquitetura Recomendada: Pós-Processamento com Placeholders e Base64
A inserção de imagens requer cautela, pois a OpenAI não deve (e não precisa) processar os arquivos diretamente para estruturar o texto, e enviar imagens grandes consumiria muitos tokens desnecessariamente.

**O Fluxo sugerido é:**
1. **Parse do ZIP (`whatsapp_parser.py`):**
   - Além dos áudios, extrair as imagens (JPG, PNG, WEBP).
   - Ao invés de classificar a imagem apenas como `[IMAGEM ANEXADA]`, classificar como `[IMAGEM: nome_do_arquivo.jpg]`.
2. **Interação OpenAI (`ai_organizer.py`):**
   - Passar a string literal `[IMAGEM: nome_do_arquivo.jpg]` para a LLM.
   - Nas regras de ouro do prompt, pedir expressamente à IA para **conservar** a string `[IMAGEM: nome_do_arquivo.jpg]` na transcrição final, idêntico ao tratamento feito com os Áudios Transcritos.
3. **Pós-Processamento (`ai_organizer.py`):**
   - Após a IA retornar o texto formatado e organizado cronologicamente, interceptar o conteúdo gerado.
   - Realizar um "Replace" utilizando Expressão Regular para encontrar padrões `[IMAGEM: nome_do_arquivo.jpg]`.
   - Ler os bytes guardados na extração, converter para Base64.
   - Substituir o texto acima por uma tag HTML válida: `<img class="ata-imagem-anexada" src="data:image/jpeg;base64,...(base64)..." />`.
4. **Renderização PDF (`pdf_generator.py` e CSS):**
   - Adicionar estilos (CSS) para limitar o tamanho da imagem (`max-width: 400px; display: block; margin: 10px 0;`).

## Task Breakdown (Lista de Tarefas)

### [ ] 1. Alteração no `whatsapp_parser.py`
- Adicionar detecção para extração de arquivos de imagens (já temos a regex e lista de extensões, basta acionar `_extract_selected_audio_files` também para imagens, ou criar função genérica `_extract_media_files`).
- Mapear a leitura do `chat.txt` para vincular o título da imagem anexa ("Ex: IMG-2023...jpg (arquivo anexado)") e alterar a classificação (`_classify_message`) para retornar não só o tipo mas também o próprio nome do arquivo ("imagem", "IMG-123.jpg").

### [ ] 2. Ajuste na Memória da Rota (`routers/atas.py`)
- Em `_process_pipeline`, o retorno do parser conterá o dicionário de imagens no `parsed_data["arquivos_extraidos"]`.
- Salvar esses bytes (ou persistir no Supabase, caso o documento seja grande) e repassar no fluxo ao final da geração do AI Organizer.
  *(Nota: Se usar Base64, é só preservar em memória para o pós-processo; Se usar Supabase, um step adicional faz o Upload e salva as URLs).*

### [ ] 3. Atualização de Prompts e Pós-processamento (`ai_organizer.py`)
- Mudar `_chat_to_text(chat_json)` para emitir `[IMAGEM ANEXADA: nome_arquivo]`.
- Mudar prompts `PROMPT_FORMAL` e `PROMPT_PREPARATORIO` incluindo regra de ouro: *NUNCA remover tags do formato `[IMAGEM ANEXADA: xpto.jpg]`.*
- Criar a função `_restore_images_and_convert_base64_or_links(html_string, extracted_media_dict)` similar ao `_restore_audio_markers`.
- Fazer a substituição final onde o `html_string` ganha as marcações `<img>`.

### [ ] 4. Ajustes Visuais e de CSS (`pdf_generator.py`)
- Adicionar regras no `<style>` para tratar quebras de página impróprias e limitação do tamanho das imagens caso sejam gigantes:
  ```css
  .ata-imagem-anexada {
      max-width: 80%;
      height: auto;
      border: 1px solid #ccc;
      page-break-inside: avoid;
  }
  ```

## Questões em Aberto (Socratic Gate)
1. Deve-se redimensionar/processar as imagens com o `Pillow` antes, visando não travar a UI se o usuário subir 200 fotos de alta qualidade em Base64?
2. Precisaremos de um Bucket no Supabase Storage para otimizar, ou Base64 inline em HTML e PDF é preferível?
3. Há necessidade de uma "marca d'água" estampada na foto para integridade em PDF forense?
