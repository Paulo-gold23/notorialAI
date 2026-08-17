#!/usr/bin/env bash
# ==============================================================================
# LegisVox - Script de Deploy Contínuo e Zero-Downtime na VPS
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🚀 Iniciando Deploy do LegisVox na VPS..."
echo "=========================================================="

# 1. Validar existência do .env da API
if [ ! -f "notorial-api/.env" ]; then
    echo "❌ Erro: Arquivo 'notorial-api/.env' não encontrado!"
    echo "Crie o arquivo com as credenciais antes de prosseguir."
    exit 1
fi

# 2. Build dos containers Docker
echo "🔨 Construindo imagens Docker (FastAPI, Nginx Frontend, Caddy)..."
docker compose build --pull

# 3. Inicialização dos serviços
echo "🚀 Subindo serviços..."
docker compose up -d --remove-orphans

# 4. Aguardar inicialização e verificar status de saúde
echo "⏳ Aguardando healthcheck da API..."
sleep 5

# Tentar até 6 vezes (30s)
MAX_RETRIES=6
COUNTER=0
SUCCESS=0

until [ $COUNTER -ge $MAX_RETRIES ]; do
    if curl -sf http://localhost/health > /dev/null 2>&1 || curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        SUCCESS=1
        break
    fi
    COUNTER=$((COUNTER+1))
    echo "Aguardando API responder... ($COUNTER/$MAX_RETRIES)"
    sleep 5
done

if [ $SUCCESS -eq 1 ]; then
    echo "=========================================================="
    echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
    echo "Status dos containers:"
    docker compose ps
    echo "=========================================================="
else
    echo "=========================================================="
    echo "⚠️ AVISO: A API não respondeu ao healthcheck dentro do tempo esperado."
    echo "Verifique os logs com: docker compose logs api"
    echo "=========================================================="
    exit 1
fi
