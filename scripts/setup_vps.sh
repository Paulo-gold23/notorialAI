#!/usr/bin/env bash
# ==============================================================================
# LegisVox - Script de Inicialização e Blindagem para VPS Ubuntu 24.04
# Executa instalação de Docker, Docker Compose, UFW Firewall e Fail2ban
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🚀 Iniciando Setup e Hardening do Servidor LegisVox..."
echo "=========================================================="

# 1. Atualizar pacotes do sistema
echo "📦 1/5 - Atualizando pacotes do Ubuntu 24.04..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban git htop

# 2. Instalar Docker CE Oficial e Docker Compose Plugin
echo "🐳 2/5 - Verificando e instalando Docker Engine..."
if ! command -v docker &> /dev/null; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker $USER || true
    echo "✅ Docker instalado com sucesso!"
else
    echo "ℹ️ Docker já está instalado no sistema."
fi

# 3. Configurar Firewall Blindado (UFW)
echo "🛡️ 3/5 - Configurando Firewall UFW (Zero Trust)..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH (Porta 22 padrão - altere se usar porta customizada)
sudo ufw allow 22/tcp comment 'SSH seguro'

# Permitir HTTP e HTTPS para o Gateway Caddy
sudo ufw allow 80/tcp comment 'Caddy HTTP'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw allow 443/udp comment 'Caddy HTTP3 QUIC'

# Ativar UFW
sudo ufw --force enable
sudo ufw status verbose
echo "✅ Firewall UFW ativo e configurado com portas mínimas necessárias!"

# 4. Hardening SSH — Forçar autenticação por chave (elimina brute-force estruturalmente)
echo "🔐 4/6 - Hardening do SSH Daemon..."
SSHD_CONFIG="/etc/ssh/sshd_config"

# Disable password authentication (key-only access)
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sudo sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"

# Disable root login (use regular user + sudo)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"

# Limit max authentication attempts
sudo sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "$SSHD_CONFIG"

# Restart SSH daemon to apply changes
sudo systemctl restart sshd
echo "✅ SSH hardened: senha desabilitada, apenas chave SSH aceita!"

# 5. Configurar Fail2ban para proteção contra Brute-Force no SSH
echo "🔒 5/6 - Configurando Fail2ban..."

# Create custom jail for aggressive SSH protection
sudo tee /etc/fail2ban/jail.d/legisvox.conf > /dev/null <<'EOF'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 3600
findtime = 600
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
echo "✅ Fail2ban ativo com ban de 1h após 3 tentativas!"

# 5. Criar arquivo de variáveis de ambiente base se não existir
echo "⚙️ 6/6 - Verificando estrutura de arquivos .env..."
if [ ! -f "notorial-api/.env" ]; then
    if [ -f "notorial-api/.env.example" ]; then
        cp notorial-api/.env.example notorial-api/.env
        echo "⚠️ Arquivo 'notorial-api/.env' criado a partir do .env.example. Preencha suas chaves antes do deploy!"
    fi
fi

echo "=========================================================="
echo "🎉 Setup concluído com sucesso!"
echo "Para subir a aplicação, execute: ./scripts/deploy.sh"
echo "=========================================================="
