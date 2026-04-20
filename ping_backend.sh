#!/bin/bash
# ==============================================================================
# Script para ping no backend (Render) para evitar Cold Start
# Pode ser configurado em CRON no Hostinger ou servidor Linux
# ==============================================================================

# Defina a URL do seu backend aqui:
BACKEND_URL="https://legisvox-backend.onrender.com" # Substitua se for outra

echo "Efetuando ping em: $BACKEND_URL"

# Requisição simples na raiz ou /health (timeout de 10s)
curl -m 10 -s "$BACKEND_URL" > /dev/null

if [ $? -eq 0 ]; then
    echo "$(date): Ping realizado com sucesso."
else
    echo "$(date): Falha ao conectar."
fi
