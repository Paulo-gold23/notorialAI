# 🔄 Manual de Continuidade de Negócios e Recuperação de Desastres (DRP)

**Plataforma:** LegisVox  
**Controladora:** Legatus Tecnologia e Portais de Conteúdo Ltda.  
**Versão:** 1.0 — Homologação de Infraestrutura & DevSecOps  
**Data:** 24 de Agosto de 2026  

---

## 1. 🎯 Objetivo

Este documento estabelece o procedimento operacional padrão (SOP) para **backup, verificação de integridade e restauração de dados** do banco de dados PostgreSQL do LegisVox em caso de corrupção, falha de infraestrutura ou incidente de segurança.

---

## 2. ⏱️ Metas de Recuperação (RPO & RTO)

* **RPO (Recovery Point Objective):** Máximo de **24 horas** (Backups diários automatizados às 03:00 da manhã + logs de transação em tempo real do Supabase WAL).
* **RTO (Recovery Time Objective):** Restauração completa do ambiente em até **2 horas**.

---

## 3. 💾 Estratégia de Backup Automatizado

1. **Backups Diários Locais na VPS:**
   * Script automatizado: `/opt/notorialAI/scripts/backup_database.sh`
   * Compressão com `gzip -9` e retenção automática de **30 dias**.
   * Localização: `/opt/notorialAI/backups/legisvox_db_YYYYMMDD_HHMMSS.sql.gz`
2. **Backups Automáticos na Nuvem (Supabase Point-in-Time Recovery):**
   * Snapshots diários automáticos gerenciados pela infraestrutura de nuvem com redundância geográfica (AWS).

---

## 4. 🛠️ Procedimento de Restauração Passo a Passo

### Passo 1: Identificar o Backup Mais Recente Íntegro
Na VPS, liste os backups disponíveis:
```bash
ls -lh /opt/notorialAI/backups/
```

### Passo 2: Testar a Descompressão do Arquivo
```bash
gzip -t /opt/notorialAI/backups/legisvox_db_YYYYMMDD_HHMMSS.sql.gz
```
*(Se o comando não retornar erros, o arquivo está matematicamente íntegro).*

### Passo 3: Executar a Restauração no PostgreSQL
Descompacte e execute a restauração via `psql`:
```bash
gunzip -c /opt/notorialAI/backups/legisvox_db_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
```

### Passo 4: Validar a Integridade das Tabelas Principais
Execute as seguintes checagens de integridade no banco:
```sql
-- 1. Contagem de advogados e status
SELECT count(*) FROM public.advogados;

-- 2. Integridade dos relatórios e hashes
SELECT count(*) FROM public.atas WHERE pdf_hash IS NOT NULL;

-- 3. Validação do trigger de proteção de hashes
SELECT proname FROM pg_proc WHERE proname = 'protect_ata_hashes';
```

### Passo 5: Reiniciar os Serviços da Aplicação
```bash
cd /opt/notorialAI
docker compose down
docker compose up -d --build
```

---

## 5. 🛡️ Segurança dos Backups

* Os arquivos de dump `.sql.gz` gerados na pasta `/opt/notorialAI/backups` herdam permissões restritas do sistema Linux (`chmod 600`), acessíveis exclusivamente pelo usuário root da VPS.
* Nenhum arquivo de backup é exposto via HTTP/Web ou incluído no versionamento Git (`.gitignore` cobre `*.sql`, `*.sql.gz` e pastas de backup).
