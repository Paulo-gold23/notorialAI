# Guia e Organização: Registro de Software no INPI 🇧🇷

Este diretório centraliza e padroniza os artefatos obrigatórios e complementares que devem ser enviados e arquivados referentes ao **Registro do Notorial.ai** no Instituto Nacional da Propriedade Industrial (INPI).

O INPI modernizou o processo utilizando o sistema **e-Software**. Todo o procedimento agora é 100% eletrônico. Abaixo detalhamos a função de cada pasta para o avanço da solicitação de proteção legal do seu sistema.

---

## 📂 Estrutura de Pastas

* **`1_Codigo_Fonte/`**: Essência técnica do projeto (Core).
  - O INPI exige o upload de um arquivo PDF gerado a partir do seu código-fonte, englobando elementos representativos (por exemplo, os arquivos em `services/`, estrutura de dados `routers/` ou interface central).
  - **Importante:** Retire do código exportado qualquer chave real de API (`.env`, `GROQ_API_KEY`, etc.), senhas, portas DB em hardcode ou token sensível. 
  - Você efetuará o **Resumo de Hash** (gerenciador de integridade) sobre este arquivo `.pdf` (ou uma versão compactada `.zip` sem chaves) durante o requerimento no sistema do INPI. O arquivo final submetido deve ser assinado digitalmente antes de subir.

* **`2_Documentacao/`**: Guias e manuais de funcionamento.
  - Diagramas do sistema, arquivo `ARCHITECTURE.md` (que construímos baseando-se no modelo FastAPI + Vite), manuais de onboarding, escopo técnico de funcionalidades do fluxo de "ata notarial" ou especificação de software.
  - (O INPI nem sempre cobra a documentação técnica junto à via original de código, mas estruturá-la serve de arcabouço contra possíveis disputas futuras de plágio da interface ou da arquitetura).

* **`3_Telas_e_Interfaces/`**: Propriedade de design (Dica de Proteção Cruzada).
  - Use este local para salvar prints da sua interface (Editor de Documentos, Dashboard Inicial, painel TipTap, Modal de Upload de Zip). 
  - Isso serve como evidência de *Trade Dress* e materialidade. Às vezes o front-end possui uma "cara" própria que vale ser protegida e protocolada também.

* **`4_Certificados_e_Protocolos/`**: Documentação oficial governamental.
  - PDF das Guias de Recolhimento da União (GRU) pagas (código de serviço de software, ex: "730 - Registro de Programa de Computador").
  - O protocolo PDF de submissão do formulário no e-Software.
  - A *Declaração de Veracidade*, assinada por certificado digital padrão ICP-Brasil.
  - O **Certificado Final de Registro** após aprovação do pedido pelo Instituto.

---

## 📝 Check-list prático para Início do Requerimento

1. [ ] **Consolidar Arquivos Chave em PDF**: Gerar o `.pdf` representativo da aplicação que será o comprovante autoral.
2. [ ] **Gerar Número de Autenticação (Hash Code)**: O portal do INPI utilizará o resumo hash gerado (geralmente via algoritmo tipo SHA-256 ou SHA-512) provindo do PDF contendo o código de vocês, confirmando não haver nenhuma quebra ou corrupção no arquivo submetido.
3. [ ] **Cadastrar usuário no INPI e Emitir GRU**: Entrar no site `inpi.gov.br`, gerar uma nova Guia GRU para Registro de Software com o custo de prestação exigido.
4. [ ] **Pagar GRU e Aguardar Compensação**: Compensação usual de GRU é entre 2 a 3 dias úteis.
5. [ ] **Acessar o Módulo e-Software e Emitir Formulário**: Você fará o upload das procurações/declaração de titularidade da empresa + a inserção do Hash do seu próprio código-fonte.
6. [ ] **Assinatura Eletrônica (Gov.br / ICP-Brasil)**: Necessário que os diretores e responsáveis técnicos assinem o andamento pelo componente nativo de assinatura.
7. [ ] **Download do Protocolo**: Imediatamente após o aceite você já detém um número de petição e sigilo garantido.

Bom trabalho na submissão legal de proteção da suíte **Notorial.ai**! Pode arquivar tudo sistematicamente nas pastas aqui para acompanhar o progresso com mais segurança. 🛡️
