EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(ÍZA) DE DIREITO DA [VARA] DA COMARCA DE [COMARCA]

**Processo nº [NÚMERO]**  
**Parte autora:** [NOME]  
**Parte ré:** [NOME]  
**Terceira interessada:** [RAZÃO SOCIAL RESPONSÁVEL PELO LEGISVOX]

---

# PETIÇÃO 1: CONFIRMAÇÃO DA PRESERVAÇÃO (item 1.2)

**[RAZÃO SOCIAL]**, inscrita no CNPJ sob o nº [...], com sede em [ENDEREÇO], por seu advogado, vem, em cumprimento ao item 1.2 da r. decisão, informar:

1. **Providência adotada.** Em [DATA/HORA], a partir da ciência da decisão, a empresa suspendeu a exclusão automática de todos os registros ainda existentes relativos ao protocolo LVX-E55349B0, pelo prazo de 90 dias, sujeito à reavaliação deste juízo. A suspensão foi feita da seguinte forma: [MEDIDA TÉCNICA ADOTADA]. O responsável é [NOME, CARGO].

2. **Registros preservados.** Na data da ciência, ainda existiam e foram preservados os seguintes registros: [LISTA].

3. **Registros já inexistentes.** O arquivo ZIP enviado pelo usuário, os áudios e o arquivo de texto da conversa não são armazenados de forma permanente pela plataforma. Eles são apagados ao fim do processamento, conforme a política de retenção prevista nos Termos de Uso e na Política de Privacidade. Por isso, já não existiam na data da ciência e não puderam ser preservados. O detalhamento consta do item 5.2 da resposta principal.

4. A preservação ficou restrita ao protocolo indicado e não abrange dados de outros clientes.

Termos em que pede deferimento.  
[Local], [data].  
[Advogado], OAB/[UF] nº [...]

---

# PETIÇÃO 2: RESPOSTA À EXIBIÇÃO E AOS ESCLARECIMENTOS (itens 2 a 7)

**[RAZÃO SOCIAL]**, já qualificada, citada como terceira detentora nos termos do art. 401 do CPC, vem apresentar sua resposta. A resposta segue a numeração da r. decisão e indica, para cada item, os documentos correspondentes.

Responsável técnico pelas informações: **[NOME, CARGO]**.

## Item 2.1: documentos e arquivos

**a) ZIP e arquivo de texto da conversa.** Não estão em poder da empresa. A plataforma recebe o ZIP, calcula seu hash SHA-256 no recebimento e o processa em área temporária. Os arquivos temporários são apagados ao fim do processamento. A plataforma não mantém cópia permanente do ZIP nem do arquivo de texto (Anexo 1).

**b) Mídias e áudios transcritos.** Não estão em poder da empresa. Os áudios foram enviados ao serviço de transcrição (Groq, modelo Whisper) e não foram mantidos após o processamento. As imagens [foram eliminadas pela rotina de limpeza de 7 dias / estão preservadas e são juntadas como Anexo 2].

**c) PDF gerado e versões intermediárias.** O PDF gerado [é juntado como Anexo 3, com acesso restrito / não está mais armazenado]. A plataforma não conservava versões intermediárias. O editor gravava cada salvamento por cima do anterior, sem histórico.

**d) Inventários, hashes e registros.** O registro do documento contém o hash SHA-256 do ZIP, calculado no recebimento (Anexo 4). À época do processamento, a plataforma não gravava inventário arquivo por arquivo do conteúdo do ZIP.

**e) Conta solicitante, data, horário e fuso.** O processamento foi solicitado pela conta [IDENTIFICAÇÃO]. O ZIP foi recebido em [DATA E HORA, UTC] e o relatório foi gerado em [DATA E HORA, UTC]. Os horários são gravados pelo servidor no fuso UTC, que corresponde ao horário de Brasília acrescido de 3 horas (Anexo 5).

**f) Documentação técnica da época.** A empresa junta os trechos do código-fonte vigente à época que geravam as declarações do relatório (Anexo 6). Não havia documento técnico separado que sustentasse as declarações de paridade, preservação ou conformidade.

## Item 3: fatos de conhecimento da prestadora (art. 380, I, do CPC)

**3.1. Origem do material.** A plataforma **não teve acesso ao aparelho celular**. Ela recebeu, pela internet, um arquivo ZIP enviado pelo usuário. Esse arquivo é gerado pela função "Exportar conversa" do próprio WhatsApp. **Nenhuma informação de origem foi verificada pela plataforma.** Aparelho, conta de WhatsApp, participantes, números e datas foram lidos do arquivo recebido, tal como vieram. A plataforma não confere se a exportação está completa nem se o arquivo foi alterado antes do envio.

**3.2. Hash impresso.** O hash impresso no PDF, com o rótulo "HASH SHA-256 (ZIP)" no cabeçalho e no rodapé, corresponde ao **arquivo ZIP recebido**. Ele foi calculado no momento do recebimento, antes de qualquer processamento. Ele comprova apenas que o ZIP recebido tinha aquele conteúdo exato. Ele **não** se refere ao PDF e não comprova a origem da conversa. O hash está vinculado ao protocolo pelo registro do documento no banco de dados (Anexo 4). Nenhum cálculo novo foi feito para esta resposta.

**3.3. Transformações e inteligência artificial.**
- **Etapas por regra fixa, sem inteligência artificial:** descompactação, leitura do arquivo de texto, separação por data e remetente, inserção de imagens, cálculo do hash, contagens do quadro final e montagem do PDF. A montagem do PDF é feita no próprio servidor da empresa.
- **Etapas com inteligência artificial:**
  - transcrição dos áudios (Groq, modelo Whisper);
  - organização do texto da conversa por modelo de linguagem da OpenAI ([MODELO], temperatura 0,2). **O texto das mensagens foi enviado a esse modelo**, dividido em blocos de até cerca de 15.000 caracteres.
- **Possibilidade de alteração do texto.** As instruções enviadas ao modelo proibiam interpretar, resumir ou corrigir o conteúdo. **Essa proibição era uma instrução ao modelo, não uma trava técnica.** À época, a plataforma não comparava automaticamente o texto de entrada com o de saída. Por isso, não há como garantir a ausência de reescrita, agrupamento ou reordenação.
- **Edição pelo usuário.** Depois da geração, o usuário podia editar livremente o texto no editor. O editor também oferecia ao usuário ações de inteligência artificial ("resumir", "formalizar" e "corrigir"), acionadas por ele. A plataforma **não registrava** quais edições foram feitas nem se essas ações foram usadas neste documento.

**3.4. Vínculo entre áudio, transcrição e remetente.** O remetente de cada áudio foi extraído da linha do arquivo de texto do WhatsApp que cita o nome do arquivo de áudio, e não do conteúdo do áudio. A transcrição foi inserida nessa mesma posição. Os registros de uso de inteligência artificial deste processamento indicam [SERVIÇOS E MODELOS] (Anexo 7). A versão do sistema não era gravada a cada processamento.

**3.5. Revisão humana.** A revisão é feita pelo próprio usuário, que é advogado, antes de gerar o PDF, e é confirmada por PIN. **Não há revisão por equipe da empresa.** Não eram conservadas versões anteriores nem o registro das alterações feitas pelo usuário. O registro do PIN não guardava o identificador do documento.

## Item 4: ocorrências controvertidas

**4.1. Página 22 (aviso de código de segurança dentro de mensagem).** Como o ZIP não está disponível, a empresa **não pode demonstrar** como o trecho constava na entrada. A empresa informa que a rotina de leitura do arquivo de texto trata como continuação da mensagem anterior toda linha que não começa com data e hora. Avisos do WhatsApp sem esse padrão podem ser anexados à mensagem do participante anterior, o que pode explicar a diferença de horário. Também não se pode descartar alteração na etapa de inteligência artificial ou na edição pelo usuário, pois nenhuma das duas era registrada.

**4.2. Página 101 (anotação "[5] Não").** As anotações numeradas são textos digitados pelo usuário no editor, na função "ressalva", e não são geradas pela plataforma. A anotação "[5] Não" refere-se ao trecho que recebe a marca [5] no corpo do relatório. **A plataforma não registrava o autor nem a data de cada anotação.** O documento pertence à conta indicada no item 2.1(e).

**4.3. Página 102 (seis observações declaradas e cinco notas numeradas).** O sistema usava critérios diferentes para as duas contagens:
- **o número declarado** somava todos os trechos marcados como anotação no editor, inclusive marcações sem texto e marcações no título de um dia;
- **a numeração de [1] a [5]** incluía apenas as marcações com texto fora dos títulos de dia.

A divergência decorre de uma marcação desse tipo. Trata-se de erro de contagem do sistema.

**4.4. 1.692 registros, 125 áudios, 155 arquivos e "100% de paridade".** As três quantidades foram apuradas **sobre o próprio documento final**, pela contagem de padrões de texto: linhas com data e hora, a expressão "Áudio Transcrito" e as imagens e documentos inseridos. **Não houve comparação com o arquivo de exportação.** A expressão "100% de paridade com o arquivo de exportação" era **texto fixo do modelo do relatório**. Ela era impressa em todos os documentos e não resultava de nenhum procedimento de comparação de quantidade ou de conteúdo. Não existe registro que a sustente.

**4.5. "Fidelidade semântica", "preservação integral" e mídias indisponíveis.** As expressões "estrita fidelidade semântica", "arquivos preservados" e "remetentes preservados sem alterações" também eram **textos fixos do modelo**, sem verificação. Quanto às mídias, o relatório usa duas marcações diferentes:
- **"Mídia não disponível no export":** a mensagem citava uma mídia que não veio no ZIP, ou seja, a ausência já estava na entrada;
- **"Imagem referenciada não encontrada no ZIP":** o arquivo era citado, mas não foi localizado durante o processamento.

Sem o ZIP, a empresa não pode confirmar caso a caso qual das duas situações ocorreu.

**4.6. "Carimbo temporal intacto".** Era texto fixo do modelo. **Não corresponde** a serviço de carimbo do tempo, a metadados de arquivo nem a registro do servidor. As datas e horas das mensagens no relatório são as que constam do texto exportado pelo WhatsApp. Os únicos horários registrados pelo servidor são os do recebimento e do processamento, em UTC.

**4.7. "CONFORMIDADE ISO/IEC 27037".** O modelo citava a norma ABNT NBR ISO/IEC 27037:2013. **A declaração era da própria empresa.** Não houve avaliação independente nem certificação, e não existe documento que relacione os procedimentos da plataforma à norma. A declaração não alcança nenhuma etapa anterior ao recebimento do ZIP, porque a plataforma não participa da coleta.

## Item 5: indisponibilidade

**5.1 e 5.2.** Itens não apresentados:

| Item | Situação | Data, motivo e política aplicável |
| :--- | :--- | :--- |
| ZIP, arquivo de texto e áudios | Eliminados | Ao fim do processamento, em [DATA], conforme a política de retenção dos Termos de Uso (Anexo 1) |
| Imagens | [Eliminadas / preservadas] | Rotina de limpeza de 7 dias |
| Versões intermediárias do texto | Nunca produzidas | O editor não guardava histórico |
| Autor e data de cada anotação | Nunca produzidos | Não eram registrados |
| Inventário arquivo por arquivo do ZIP | Nunca produzido | Não era gravado à época |
| Versão do sistema por processamento | Nunca produzida | Não era gravada à época |
| Comparação entre entrada e saída ("paridade") | Nunca produzida | O procedimento não existia |
| Registro do documento e conteúdo revisado | [Disponíveis, Anexo 4 / eliminados em DATA] | Rotina automática de descarte |

Nenhuma parte do material está sob guarda de terceiro. Os serviços de inteligência artificial contratados (OpenAI e Groq) operam sem retenção dos dados enviados (Anexo 8).

**5.3.** Nenhum arquivo histórico foi substituído. Nenhuma reconstrução ou teste foi juntado a esta resposta.

## Providências posteriores ao processamento

Depois da geração do relatório examinado, a empresa adotou as seguintes medidas:
- retirou do modelo de relatório as expressões "100% de paridade", "fidelidade semântica", "carimbo temporal", "preservados" e "certidão forense", além do selo ISO/IEC 27037;
- corrigiu a contagem de anotações, que agora coincide com a numeração impressa;
- passou a gravar recibos permanentes de cada processamento, apenas com metadados: inventário do ZIP, modelos, configurações e versão do sistema.

**Essas medidas não alteram nem completam os registros do protocolo LVX-E55349B0.**

## Item 6: forma de apresentação

Os anexos que contêm conversas e dados pessoais são juntados com pedido de acesso restrito ao juízo, às partes, a seus procuradores e ao perito, se nomeado, nos termos do art. 189, III, do CPC. [Caso o volume exceda a capacidade do sistema processual, requer a indicação de meio adequado de depósito, conforme o item 6.2.]

## Pedidos

Diante do exposto, requer:
1. o recebimento desta resposta e dos anexos, como cumprimento dos itens 2 a 6 da r. decisão;
2. a manutenção do acesso restrito aos anexos que contêm dados pessoais.

Termos em que pede deferimento.  
[Local], [data].

[Advogado], OAB/[UF] nº [...]  
[Responsável técnico], [cargo]

---

**Anexos**
1. Termos de Uso e Política de Privacidade vigentes na data do processamento
2. Imagens [se preservadas]
3. PDF gerado [se preservado]
4. Registro do documento (hash do ZIP, datas, conta)
5. Registros de data, horário e conta
6. Trechos do código-fonte vigente à época
7. Registros de uso de inteligência artificial
8. Termos dos serviços OpenAI e Groq sobre retenção de dados
