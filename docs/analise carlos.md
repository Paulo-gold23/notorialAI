

## ASSUNTO: ADEQUAÇÕES TÉCNICAS, DE INTERFACE E DE CONFORMIDADE
## DO LEGISVOX
Após análise jurídica do site e dos fluxos internos do LegisVox, identificamos
adequações que precisam ser realizadas pela equipe responsável pelo sistema. As
providências abaixo não envolvem, neste momento, a substituição integral dos Termos
de Uso e da Política de Privacidade, que serão revisados separadamente pelo setor
jurídico.
Precisamos, inicialmente, corrigir afirmações tecnicamente imprecisas, implementar
mecanismos adequados de aceite e obter o mapeamento real do tratamento de dados
realizado pelo sistema.
## 1. CORREÇÕES IMEDIATAS DE TERMINOLOGIA E PUBLICIDADE
1.1. Retirar de todas as páginas públicas, dashboard, tutoriais, modais, PDFs e demais
interfaces as seguintes expressões:
 “autenticidade garantida”;
 “protocolo de autenticidade”;
 “cadeia de custódia”, quando utilizada para afirmar que o sistema constitui ou
garante cadeia de custódia jurídica;
 “assinatura digital SHA-256”;
 “chancelar a integridade jurídica”;
 “segurança notarial”;
 “folhas notariais”;
 “ata” ou “atas” para designar os relatórios do LegisVox;
 “fé pública do advogado”;
 “documento pronto para protocolo”, quando apresentado sem ressalva;
 qualquer afirmação de que o documento possui autenticidade, fé pública,
validade judicial ou admissibilidade garantida.
1.2. Utilizar provisoriamente as seguintes expressões:
 “Integridade verificável por hash SHA-256”;
 “Resumo criptográfico do arquivo-fonte e do relatório final”;
 “Material preparatório sujeito à revisão profissional”;
 “Relatório de organização e transcrição de comunicações”;
 “PIN de confirmação e assinatura eletrônica interna”;
 “Documento gerado para conferência e eventual utilização pelo profissional
responsável”.
1.3. Na explicação sobre o hash, utilizar provisoriamente:
“O LegisVox gera resumos criptográficos SHA-256 do arquivo-fonte e do relatório
final, permitindo verificar se esses arquivos sofreram alterações após o processamento.
O hash não certifica autoria, veracidade, completude, origem ou admissibilidade judicial
do conteúdo.”
1.4. Excluir a afirmação:

“O próprio advogado realiza a autenticação do documento gerado sob sua
responsabilidade profissional e fé pública (Art. 425, IV, CPC).”
Substituir provisoriamente por:
“A juntada ou utilização do relatório pelo advogado não lhe confere fé pública nem
certifica a veracidade das comunicações. O valor probatório do documento será
apreciado pela autoridade competente em conjunto com os arquivos originais e as
demais provas.”
1.5. Substituir “Senha de Assinatura” por:
“PIN de confirmação e assinatura eletrônica interna”.
Não utilizar expressões que indiquem certificação ICP-Brasil, assinatura digital
qualificada, autenticação notarial ou chancela jurídica.
1.6. Excluir imediatamente qualquer referência a “criptografia Base64”.
Base64 é codificação, e não criptografia. Enquanto a arquitetura de segurança não for
formalmente confirmada, utilizar:
“Os dados são protegidos por medidas técnicas e administrativas de segurança,
compatíveis com a natureza das informações tratadas.”
1.7. Revisar as afirmações de desempenho:
 “97%+ de precisão”;
 “menos de 5 minutos”;
 “independentemente do volume”.
Essas afirmações somente devem permanecer se houver testes documentados,
metodologia, amostragem, condições e limitações. Caso contrário, substituir por
redação sem garantia objetiva, como:
“O tempo e a precisão podem variar conforme o volume, a qualidade dos áudios, o
idioma, a conexão, o formato dos arquivos e a disponibilidade dos fornecedores
tecnológicos.”
1.8. Alinhar a informação sobre edição do documento.
O site atualmente informa que o documento é “editável”, enquanto o sistema
aparentemente impede a alteração direta da transcrição e permite apenas ressalvas,
preenchimentos específicos e ajustes controlados.
A interface deve explicar:
 a transcrição originária não é editável diretamente;
 o usuário pode inserir ressalvas destacadas;
 eventuais preenchimentos autorizados devem ficar registrados;

 as alterações não podem ser confundidas com o conteúdo originalmente
processado.
O botão “Salvar Edições” deve ser revisto. Sugestões:
 “Salvar Revisão e Ressalvas”; ou
 “Salvar Ajustes Permitidos”.
1.9. Substituir “pronto para protocolo” por:
“Pronto para revisão e eventual utilização profissional.”
## 2. CORREÇÕES DE PREÇOS, CRÉDITOS E RETENÇÃO
2.1. Conferir e uniformizar em todo o sistema:
 quantidade mínima de créditos;
 quantidade máxima por compra;
 preço por página em cada faixa;
 existência de pacote personalizado;
 validade dos créditos;
 data de início da validade;
 tratamento dos créditos gratuitos;
 tratamento de créditos expirados;
 forma de reserva estimada;
 ajuste após o número real de páginas;
 devolução de créditos quando o processamento falhar;
 tratamento de processamento parcial;
 cobrança duplicada;
 exclusão da conta com saldo remanescente.
2.2. Atualmente há aparente divergência entre:
 página pública indicando pacote de 5 a 500 páginas;
 fluxo interno indicando compra mínima de 50 e máxima de 2.000 créditos;
 informação de validade de seis meses, que não aparece adequadamente nos
## Termos.
A equipe deve informar qual é a regra efetivamente aplicada pelo backend.
2.3. Uniformizar a política de retenção. Atualmente aparecem informações diferentes:
 eliminação em até 24 horas após o processamento;
 eliminação 24 horas após a criação;
 eliminação depois de período configurável;
 permanência de hashes e registros;
 permanência temporária do documento no dashboard.
Precisamos saber exatamente quando começa a contagem de 24 horas e quais arquivos
são eliminados em cada etapa.

## 3. ACEITE DOS TERMOS E REGISTRO CONTRATUAL
3.1. Implementar, no cadastro, checkbox não pré-marcado com a seguinte estrutura:
“Declaro que li e concordo com os Termos de Uso e com a Política de Privacidade.”
As expressões “Termos de Uso” e “Política de Privacidade” devem ser links que abram
os respectivos documentos.
3.2. O usuário não poderá concluir o cadastro sem marcar o checkbox.
3.3. O sistema deverá registrar:
 ID do usuário;
 versão dos Termos;
 versão da Política;
 data e hora do aceite;
 endereço IP;
 user agent ou informações técnicas equivalentes;
 origem do aceite;
 hash ou identificador da versão aceita;
 eventual retirada ou renovação do aceite, quando aplicável.
3.4. O aceite dos Termos e da Política deve ser separado do consentimento para
publicidade ou marketing.
O consentimento de marketing deve ser facultativo, não pré-marcado e não pode
impedir o cadastro.
3.5. Alterações substanciais nos Termos ou na Política deverão permitir:
 aviso ao usuário;
 apresentação da nova versão;
 registro de novo aceite quando juridicamente necessário;
 manutenção do histórico das versões anteriores.
3.6. Após o cadastro ou aceite, o usuário deve ter acesso permanente à versão contratual
aceita, preferencialmente em seu perfil.
3.7. Antes de finalizar a compra de créditos, o sistema deve exibir resumo contendo:
 quantidade de créditos;
 preço unitário ou faixa aplicável;
 preço total;
 validade;
 forma de pagamento;
 regra de consumo;
 política de falha e estorno;
 link para os Termos.

3.8. O sistema deve registrar a confirmação da compra e permitir que o usuário conserve
ou reproduza as condições contratadas.
## 4. TERMO DE RESPONSABILIDADE ANTES DO PDF
4.1. O atual Termo de Responsabilidade será substituído pelo setor jurídico.
Até o envio da nova redação, não ampliar nem modificar o texto atual sem validação
jurídica.
4.2. A equipe deve preparar o sistema para:
 vincular o aceite à versão exata do Termo de Responsabilidade;
 registrar data e hora;
 registrar usuário;
 registrar ID do documento;
 registrar hash do documento;
 registrar versão do termo;
 registrar método de autenticação utilizado;
 inserir essas informações no relatório de auditoria.
4.3. O aceite do Termo de Responsabilidade não deve ser salvo genericamente como
aceite dos Termos de Uso. São documentos e manifestações distintas.
Revisar, portanto, o endpoint atualmente denominado
/api/auth/accept-terms, para
que diferencie:
 aceite dos Termos de Uso;
 ciência da Política de Privacidade;
 aceite do Termo de Responsabilidade;
 consentimento de marketing;
 confirmação ou assinatura de determinado relatório.
## 5. COOKIES E TECNOLOGIAS DE RASTREAMENTO
5.1. Informar se Google Analytics, PostHog ou qualquer outro serviço de analytics está
efetivamente ativo.
5.2. Informar todos os cookies, local storage, pixels, identificadores, scripts e
tecnologias semelhantes utilizados pelo site e pela aplicação.
5.3. Caso existam cookies não estritamente necessários, implementar banner com:
 “Aceitar todos”;
 “Rejeitar não necessários”;
 “Gerenciar preferências”.
Os botões de aceitar e rejeitar devem possuir destaque e facilidade equivalentes.

5.4. Cookies analíticos ou publicitários não devem ser carregados antes da manifestação
válida do usuário, salvo se houver fundamento técnico-jurídico previamente validado.
5.5. O usuário deve poder alterar posteriormente suas preferências.
## 6. MAPEAMENTO DOS DADOS TRATADOS
A equipe deverá entregar ao jurídico um inventário contendo, para cada dado:
 dado coletado;
 fonte;
 finalidade;
 local de armazenamento;
 prazo de retenção;
 fornecedor que acessa;
 país ou região de processamento;
 mecanismo de exclusão;
 existência de backup;
 pessoas ou perfis com acesso;
 criptografia aplicada;
 logs existentes.
O inventário deve abranger, no mínimo:
 nome;
 e-mail;
##  CPF/CNPJ;
 número de OAB;
 organização ou escritório;
 telefone;
 credenciais;
 login por Google;
 tokens de autenticação;
 PIN de confirmação;
 fingerprint do dispositivo;
##  IP;
 user agent;
 dados de navegação;
 informações de pagamento;
 notas fiscais;
 saldo e consumo de créditos;
 ZIP enviado;
 arquivo _chat.txt;
 mensagens;
 nomes e telefones de interlocutores;
 áudios;
 imagens;
 documentos anexados;
 transcrições;
 prompts enviados às IAs;

 respostas retornadas pelas IAs;
 arquivos temporários;
 relatório editável;
 ressalvas do usuário;
 PDF final;
 título do documento;
 hash do arquivo-fonte;
 hash do PDF;
 logs de auditoria;
 logs de erro;
 backups;
 chamados de suporte;
 registros de exclusão.
## 7. FORNECEDORES E SUBOPERADORES
A equipe deve informar todos os terceiros que recebem ou podem acessar dados,
incluindo:
##  Supabase;
##  Asaas;
 OpenAI;
##  Groq;
##  Google;
 Gotenberg, esclarecendo se é hospedado internamente ou por terceiro;
##  Cloudflare;
 serviço de hospedagem;
 serviço de e-mail;
 serviço de monitoramento;
 armazenamento;
 backup;
 logs;
 analytics;
 suporte;
 qualquer outro fornecedor.
Para cada fornecedor, informar:
 razão social;
 produto utilizado;
 finalidade;
 dados enviados;
 país de processamento;
 região de servidor;
 prazo de retenção;
 possibilidade de acesso humano;
 utilização ou não para treinamento;
 configuração de “zero data retention”, quando existente;
 existência de contrato ou DPA;
 existência de cláusulas de transferência internacional;

 link da documentação de privacidade e segurança.
## 8. PROCESSAMENTO POR INTELIGÊNCIA ARTIFICIAL
8.1. Informar exatamente:
 quais modelos são utilizados;
 em quais etapas;
 quais trechos dos documentos são enviados;
 se o ZIP inteiro é enviado;
 se os áudios são enviados;
 se imagens são enviadas;
 se dados de identificação são removidos antes do envio;
 se os prompts ficam registrados;
 por quanto tempo cada fornecedor conserva os dados;
 se os dados podem ser revisados por humanos;
 se são utilizados para treinamento;
 quais configurações contratuais impedem o treinamento.
8.2. A afirmação de que “é terminantemente vedado aos parceiros utilizar os dados para
treinamento” somente poderá permanecer se houver garantia contratual ou configuração
técnica comprovável em todos os fornecedores.
## 9. POLÍTICA REAL DE RETENÇÃO E EXCLUSÃO
A equipe deve responder separadamente qual o prazo de retenção de:
 ZIP original;
 arquivo descompactado;
 mensagens;
 áudios;
 imagens;
 documentos anexos;
 transcrição;
 prompts;
 respostas dos modelos;
 arquivos temporários;
 documento em revisão;
##  PDF;
 backups;
 logs de segurança;
 logs de erro;
 hashes;
 registros de aceite;
 dados cadastrais;
 dados fiscais;
 dados de pagamento;
 chamados de suporte.
Também deverá informar:

 quando começa a contagem do prazo;
 se o cron job apenas marca ou efetivamente elimina;
 como a exclusão é comprovada;
 se a exclusão abrange backups;
 prazo para expurgo dos backups;
 comportamento em caso de falha do cron job;
 existência de alerta ou auditoria de exclusão;
 existência de cópia nos fornecedores de IA.
## 10. SEGURANÇA DA INFORMAÇÃO
Precisamos de confirmação técnica documentada sobre:
 uso de TLS;
 criptografia em repouso;
 algoritmo efetivamente utilizado;
 gerenciamento de chaves;
 segregação entre usuários;
 controle de acesso administrativo;
 autenticação multifator para administradores;
 registro de acesso administrativo;
 proteção do PIN;
 hashing de senhas;
 política de senhas;
 proteção contra tentativas sucessivas;
 backups;
 testes de restauração;
 varredura de vulnerabilidades;
 atualização de dependências;
 gestão de segredos e chaves de API;
 monitoramento;
 plano de resposta a incidentes;
 testes de invasão, caso existentes.
Não utilizar nas páginas públicas as expressões “AES-256”, “criptografia avançada”,
“zero knowledge” ou equivalentes antes da confirmação documental.
## 11. ACESSO ADMINISTRATIVO E SUPORTE
A equipe deve informar:
 quais administradores conseguem visualizar dados cadastrais;
 quem consegue visualizar conversas, áudios ou relatórios;
 se o suporte acessa conteúdo;
 em quais situações ocorre acesso humano;
 se o usuário é informado ou autoriza o acesso;
 se o acesso gera log;
 por quanto tempo o log é mantido;
 se funcionários e prestadores assinam cláusulas de confidencialidade.

Preferencialmente, o acesso ao conteúdo deve ocorrer somente:
 mediante autorização específica do usuário;
 para resolução de incidente;
 para cumprimento de obrigação legal;
 de maneira limitada, registrada e auditável.
## 12. INCIDENTES DE SEGURANÇA
A equipe deve preparar procedimento interno para:
 detecção;
 classificação;
 contenção;
 investigação;
 preservação de evidências;
 comunicação ao jurídico e ao responsável por privacidade;
 identificação dos titulares e clientes afetados;
 documentação das providências;
 comunicação aos fornecedores envolvidos.
Como regra interna, o jurídico deve ser informado em até 24 horas após a confirmação
de incidente envolvendo dados pessoais, para avaliação das comunicações legais
aplicáveis.
## 13. EXCLUSÃO DA CONTA E DIREITOS DO TITULAR
Implementar ou confirmar a existência de fluxo para:
 solicitação de acesso;
 correção cadastral;
 exclusão da conta;
 revogação de consentimento de marketing;
 alteração de cookies;
 exportação de dados cadastrais;
 oposição ou contestação;
 confirmação da exclusão.
A exclusão da conta deve informar previamente:
 quais dados serão eliminados;
 quais serão mantidos por obrigação legal;
 prazo de conclusão;
 tratamento dos créditos remanescentes;
 impossibilidade de recuperação;
 situação dos documentos ainda disponíveis.
## 14. HASH E VERIFICAÇÃO DE INTEGRIDADE
## Informar:

 em que momento é gerado o hash do ZIP;
 se é calculado antes ou depois da descompactação;
 se o ZIP é alterado ou otimizado antes do hash;
 em que momento é gerado o hash do PDF;
 onde os hashes são armazenados;
 como são vinculados ao usuário e ao documento;
 quem pode alterá-los;
 se há logs de alteração;
 se existe ferramenta pública ou interna para verificação;
 se o usuário consegue comparar posteriormente o arquivo conservado com o
hash registrado.
A apresentação deverá utilizar “resumo criptográfico” ou “hash”, e não “assinatura
digital”.
## 15. FORMATO DA RESPOSTA
Solicitamos que a equipe responda em tabela ou documento contendo:
 item;
 funcionamento atual;
 correção necessária;
 responsável;
 prazo estimado;
 documentação ou evidência técnica;
 eventual impedimento.
## Prioridades:
P0 – correção imediata:
 retirada das expressões juridicamente incorretas;
 retirada de “criptografia Base64”;
 correção das promessas de autenticidade, fé pública e segurança notarial;
 correção das divergências ostensivas de preço e retenção.
P1 – necessária para finalizar os documentos jurídicos:
 inventário de dados;
 lista de fornecedores;
 fluxo de IA;
 retenção real;
 segurança;
 transferências internacionais;
 aceite versionado;
 cookies;
 tratamento de créditos.
P2 – melhoria estrutural:

 ferramenta de verificação de hash;
 relatórios de auditoria;
 fluxo automatizado de direitos dos titulares;
 página pública de suboperadores;
 painel de preferências;
 aperfeiçoamento da assinatura eletrônica interna.
Solicitamos que nenhuma afirmação técnica ou jurídica nova seja publicada sem
validação conjunta das áreas técnica e jurídica.
