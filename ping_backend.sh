#!/bin/bash
# ==============================================================================
# LegisVox - Health Check Ping
# Verifica se o backend está respondendo corretamente
# Pode ser configurado em CRON: */5 * * * * /opt/notorialAI/ping_backend.sh
# ==============================================================================

# URL de healthcheck da VPS
BACKEND_URL="https://legisvox.com/health"

echo "Efetuando health check em: $BACKEND_URL"

# Requisição simples no endpoint /health (timeout de 10s)
HTTP_CODE=$(curl -m 10 -s -o /dev/null -w "%{http_code}" "$BACKEND_URL")

if [ "$HTTP_CODE" = "200" ]; then
    echo "$(date): Health check OK (HTTP $HTTP_CODE)."
else
    echo "$(date): ALERTA - Health check falhou (HTTP $HTTP_CODE)."
fi
