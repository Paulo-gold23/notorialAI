# ==============================================================================
# LegisVox Backend - FastAPI Dockerfile
# ==============================================================================

FROM python:3.11-slim

# Evita que o Python escreva arquivos .pyc e força flush imediato nos logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Instalar dependências de sistema necessárias para compilação e suporte a imagens (HEIC/Pillow/nh3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libheif-dev \
    libde265-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar apenas requirements primeiro para aproveitar cache de camadas do Docker
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar o restante do código da API
COPY . .

# Criar usuário não-root para segurança reforçada (Least Privilege)
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Healthcheck interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# Executar Uvicorn em produção
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "172.16.0.0/12,10.0.0.0/8,192.168.0.0/16,127.0.0.1"]
