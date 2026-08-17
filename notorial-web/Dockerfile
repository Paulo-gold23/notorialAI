# ==============================================================================
# LegisVox Frontend - React/Vite Multi-stage Dockerfile
# ==============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependência primeiro
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copiar código fonte
COPY . .

# Argumentos de build para o Vite (injetados no build se fornecidos)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

# Executar build de produção do Vite
RUN npm run build

# ── Stage 2: Production Server (Nginx Alpine) ─────────────────────────────────
FROM nginx:alpine-slim

# Copiar configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar bundle compilado da etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
