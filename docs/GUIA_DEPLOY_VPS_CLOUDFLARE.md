# 📘 Guia Operacional: Deploy do LegisVox na VPS Hostinger & Configuração Cloudflare

Este guia foi elaborado para permitir que você execute de forma simples e segura toda a migração da infraestrutura (API do Render para VPS Hostinger com Docker, Caddy e Cloudflare), conforme as recomendações do Wilton.

---

## 📑 Sumário
1. [Preparação na VPS Hostinger (Ubuntu 24.04)](#1-preparação-na-vps-hostinger)
2. [Configuração de Credenciais (.env)](#2-configuração-de-credenciais-env)
3. [Deploy dos Containers com Docker](#3-deploy-dos-containers-com-docker)
4. [Configuração do Domínio na Cloudflare (Plano Gratuito)](#4-configuração-do-domínio-na-cloudflare)
5. [Blindagem de Segurança & Cloudflare Tunnel (Opcional)](#5-blindagem-de-segurança--cloudflare-tunnel)
6. [Comandos Úteis de Monitoramento e Logs](#6-comandos-úteis-de-monitoramento-e-logs)

---

## 1. Preparação na VPS Hostinger

Acesse seu terminal SSH na Hostinger:
```bash
ssh root@SEU_IP_DA_VPS
```

Clone ou transfira a pasta do projeto `LEGISVOX v2.3`:
```bash
cd /opt
# Se já estiver com o repositório git clonado:
cd "LEGISVOX v2.3"
```

Dê permissão de execução aos scripts e execute o setup:
```bash
chmod +x scripts/*.sh
./scripts/setup_vps.sh
```

> **O que o `setup_vps.sh` faz automaticamente:**
> - Instala o Docker Engine e Docker Compose mais recentes no Ubuntu 24.04.
> - Configura o firewall **UFW** para fechar todas as portas desnecessárias e permitir somente `22 (SSH)`, `80 (HTTP)` e `443 (HTTPS)`.
> - Ativa o **Fail2ban** para proteção contra brute-force em SSH.

---

## 2. Configuração de Credenciais (.env)

No diretório do projeto na VPS, edite o arquivo `notorial-api/.env`:
```bash
nano notorial-api/.env
```

Garanta que as variáveis de produção estejam preenchidas:
```env
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
SUPABASE_URL=https://wnzypjivefdsefrmghzf.supabase.co
SUPABASE_KEY=sua_anon_key
SUPABASE_SERVICE_KEY=sua_service_role_key
ASAAS_API_KEY=sua_chave_asaas
RESEND_API_KEY=sua_chave_resend
```
*(Salve com `Ctrl+O`, Enter e saia com `Ctrl+X`)*.

---

## 3. Deploy dos Containers com Docker

Para compilar as imagens e subir o ambiente completo:

```bash
./scripts/deploy.sh
```

Ou manualmente:
```bash
docker compose up -d --build
```

Verifique se todos os containers estão `Up (healthy)`:
```bash
docker compose ps
```

Teste se a API está respondendo localmente:
```bash
curl http://localhost/health
# Retorno esperado: {"api":"ok","database":"ok"}
```

---

## 4. Configuração do Domínio na Cloudflare (Plano Gratuito)

Colocar o domínio na Cloudflare leva cerca de 5 minutos e garante proteção contra ataques, SSL automático e CDN de alta velocidade:

1. **Criar Conta**: Acesse [cloudflare.com](https://dash.cloudflare.com) e crie uma conta gratuita.
2. **Adicionar Domínio**: Clique em **"Add a Site"** e digite `legisvox.com` (ou seu subdomínio).
3. **Plano**: Selecione o plano **Free ($0)**.
4. **Troca de Nameservers (DNS)**:
   - A Cloudflare mostrará 2 servidores de nomes (ex: `ns1.cloudflare.com` e `ns2.cloudflare.com`).
   - Acesse o painel onde registrou seu domínio (Hostinger / Registro.br / GoDaddy) e troque os Nameservers para os indicados pela Cloudflare.
5. **Configurar Registros DNS na Cloudflare**:
   - Tipo `A` | Nome `@` | Conteúdo `SEU_IP_DA_VPS` | **Proxy: Ativado (Nuvem Laranja 🟠)**
   - Tipo `CNAME` | Nome `www` | Conteúdo `legisvox.com` | **Proxy: Ativado (Nuvem Laranja 🟠)**
6. **Configuração de SSL/TLS na Cloudflare**:
   - Vá no menu lateral **SSL/TLS** -> Selecione o modo **Full (Strict)**.
7. **Ativar Proteções**:
   - Vá em **Security** -> **Bots** -> Ative o **Bot Fight Mode**.
   - Vá em **Speed** -> **Optimization** -> Ative **Early Hints** e **HTTP/3 (QUIC)**.

---

## 5. Blindagem de Segurança & Cloudflare Tunnel (Opcional)

Se desejar atingir a **blindagem máxima sugerida pelo Wilton (Zero Portas Abertas na VPS)**:

1. No painel da Cloudflare, vá em **Zero Trust** -> **Networks** -> **Tunnels**.
2. Clique em **Create Tunnel**, dê o nome `legisvox-vps`.
3. A Cloudflare fornecerá um token (ex: `eyJh...`).
4. Na VPS, inicie o container do túnel:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="seu_token_aqui" docker compose --profile tunnel up -d cloudflared
   ```
5. No painel da Cloudflare, aponte a rota do túnel para `http://caddy:80`.
6. Agora você pode fechar **até as portas 80 e 443** no firewall da VPS (`sudo ufw delete allow 80/tcp` e `sudo ufw delete allow 443/tcp`). O servidor ficará 100% invisível na internet pública!

---

## 6. Comandos Úteis de Monitoramento e Logs

### Ver logs em tempo real:
```bash
# Todos os serviços
docker compose logs -f

# Apenas a API FastAPI
docker compose logs -f api

# Apenas o Caddy Proxy
docker compose logs -f caddy
```

### Reiniciar serviços:
```bash
docker compose restart
```

### Atualizar a aplicação após alterações de código:
```bash
./scripts/deploy.sh
```
