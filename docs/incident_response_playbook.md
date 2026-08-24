# 🛡️ Plano de Resposta a Incidentes de Segurança da Informação (LGPD)

**Plataforma:** LegisVox  
**Controladora:** Legatus Tecnologia e Portais de Conteúdo Ltda.  
**Versão:** 1.0 — Homologada para Convênios Institucionais (OAB)  
**Data:** 24 de Agosto de 2026  
**Canal Oficial de Atendimento:** Plataforma LegisVox  


---

## 1. 🎯 Objetivo e Escopo

Este documento formaliza o **Plano e Procedimentos de Resposta a Incidentes de Segurança da Informação**, em estrito cumprimento ao **Artigo 48 da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD)** e à **Resolução CD/ANPD nº 15/2024**.

Aplica-se a toda a infraestrutura computacional, banco de dados relacional, APIs, sistemas de autenticação e containers locais responsáveis pelo funcionamento da plataforma **LegisVox**.

---

## 2. 🚦 Classificação da Severidade do Incidente

| Nível | Classificação | Critérios Técnicos | Tempo Máximo de Resposta |
|---|---|---|---|
| **SEV-1** | **Crítico** | Acesso indevido confirmado a banco de dados, vazamento de credenciais mestre, sequestro de servidor ou exposição massiva de dados pessoais. | **Imediato (< 1 hora)** |
| **SEV-2** | **Alto** | Indisponibilidade prolongada de serviços de autenticação, falha isolada em rota administrativa sem evidência de extração de dados. | **Até 4 horas** |
| **SEV-3** | **Médio** | Tentativas frustradas de injeção/ataque volumétrico bloqueadas pelo WAF/RLS, anomalias em logs de requisição. | **Até 12 horas** |
| **SEV-4** | **Baixo** | Inconformidades pontuais de interface, falsos positivos ou bugs cosméticos sem impacto em confidencialidade. | **Até 24 horas** |

---

## 3. 👥 Equipe de Resposta a Incidentes (CSIRT)

* **Líder de Segurança / Administrador de Infraestrutura:** Responsável pelo isolamento técnico, análise de logs de auditoria e contenção do perímetro.
* **Encarregado pelo Tratamento de Dados Pessoais (DPO):** Responsável pela avaliação do risco aos titulares, registro no Livro de Incidentes e interlocução oficial com a ANPD.
* **Consultoria Jurídica:** Assessoria na redação das comunicações formais e enquadramento regulatório.

---

## 4. 🔄 Ciclo Operacional de Resposta (6 Fases)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. IDENTIFICAÇÃO│ ──> │  2. CONTENÇÃO   │ ──> │ 3. ERRADICAÇÃO  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              ▼
│ 6. PÓS-INCIDENTE│ <── │ 5. NOTIFICAÇÃO  │ <── ┌─────────────────┐
│ (Lições/Melhoria)│    │   (ANPD / OAB)  │     │ 4. RECUPERAÇÃO  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Fase 1: Identificação e Registro
1. Detecção automática via monitoramento do painel de administração (`/admin` -> aba *Logs & Sistema*) ou denúncia pelo canal de privacidade.
2. Abertura imediata do Registro de Incidente com carimbo temporal.

### Fase 2: Contenção Imediata
1. Revogação emergencial de chaves de API afetadas.
2. Bloqueio de IPs atacantes e isolamento de sessões ativas (`AAL2` / Supabase Auth).
3. Preservação de logs brutos e dumps de memória para fins de auditoria pericial.

### Fase 3: Erradicação
1. Identificação e correção da vulnerabilidade de origem no código ou nas configurações de ambiente.
2. Re-execução da suíte de testes e validação de permissões de banco (PostgreSQL Row Level Security).

### Fase 4: Recuperação Segura
1. Restauração de serviços ou dados a partir de backups íntegros (caso necessário).
2. Validação da integridade dos hashes SHA-256 (`trg_protect_ata_hashes`) para garantir que nenhum relatório foi alterado.

### Fase 5: Notificação e Transparência
* **Prazo ANPD:** Em caso de incidente relevante que possa acarretar risco ou dano relevante aos titulares, o DPO notificará a **Autoridade Nacional de Proteção de Dados (ANPD)** no prazo de **3 (três) dias úteis**, contados a partir da ciência da confirmação do evento (Resolução CD/ANPD nº 15/2024).
* **Comunicação aos Advogados/Titulares:** Notificação direta via e-mail cadastrado contendo:
  - Descrição da natureza dos dados afetados;
  - Medidas de segurança técnicas implementadas;
  - Riscos identificados e recomendações aos usuários;
  - Contato do DPO para suporte.

### Fase 6: Lições Aprendidas e Pós-Incidente
1. Elaboração do Relatório Conclusivo de Incidente em até 10 dias úteis.
2. Atualização das regras de firewall, políticas de senhas e auditorias automatizadas.

---

## 5. 📝 Modelo Oficial de Comunicação à ANPD

```text
AO ENCARREGADO / COORDENAÇÃO-GERAL DE FISCALIZAÇÃO DA ANPD

ASSUNTO: Comunicação Formal de Incidente de Segurança (Art. 48 da Lei 13.709/2018)

1. IDENTIFICAÇÃO DO CONTROLADOR:
   - Razão Social: Legatus Tecnologia e Portais de Conteúdo Ltda.
   - CNPJ: [CNPJ da Legatus]
   - Plataforma: LegisVox (legisvox.com.br)
   - Contato Oficial: [Canal de Suporte / Atendimento LegisVox]

2. DESCRIÇÃO DO EVENTO:
   - Data/Hora da Detecção: [DD/MM/AAAA às HH:mm]
   - Natureza do Incidente: [Acesso indevido / Indisponibilidade / Outro]
   - Categorias de Dados Envolvidos: [Cadastrais / Metadados operacionais]

3. MEDIDAS DE CONTENÇÃO ADOTADAS:
   - [Descrição das chaves revogadas, bloqueio de acessos e correções de segurança]

4. ANÁLISE DE RISCO E MEDIDAS AOS TITULARES:
   - [Avaliação de impacto aos direitos e orientações encaminhadas aos advogados]

Data e Assinatura do DPO / Responsável Legal
```

---

## 6. 🔒 Compromisso de Conformidade

O LegisVox reitera que **não armazena áudios após a transcrição efêmera** e opera sob **Zero Data Retention (ZDR)** em seus pipelines de inteligência artificial, minimizando substancialmente o risco de incidentes com conteúdos íntimos de conversas.
