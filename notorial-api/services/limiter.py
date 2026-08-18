from fastapi import Request
from slowapi import Limiter
import ipaddress
import logging

logger = logging.getLogger(__name__)

# ── Cloudflare IPv4 and IPv6 CIDR ranges ────────────────────────────────────
# Source: https://www.cloudflare.com/ips/
# These are the ONLY networks allowed to set CF-Connecting-IP / X-Forwarded-For.
# Last updated: 2026-08-18
CLOUDFLARE_CIDRS = [
    # IPv4
    ipaddress.ip_network("173.245.48.0/20"),
    ipaddress.ip_network("103.21.244.0/22"),
    ipaddress.ip_network("103.22.200.0/22"),
    ipaddress.ip_network("103.31.4.0/22"),
    ipaddress.ip_network("141.101.64.0/18"),
    ipaddress.ip_network("108.162.192.0/18"),
    ipaddress.ip_network("190.93.240.0/20"),
    ipaddress.ip_network("188.114.96.0/20"),
    ipaddress.ip_network("197.234.240.0/22"),
    ipaddress.ip_network("198.41.128.0/17"),
    ipaddress.ip_network("162.158.0.0/15"),
    ipaddress.ip_network("104.16.0.0/13"),
    ipaddress.ip_network("104.24.0.0/14"),
    ipaddress.ip_network("172.64.0.0/13"),
    ipaddress.ip_network("131.0.72.0/22"),
    # IPv6
    ipaddress.ip_network("2400:cb00::/32"),
    ipaddress.ip_network("2606:4700::/32"),
    ipaddress.ip_network("2803:f800::/32"),
    ipaddress.ip_network("2405:b500::/32"),
    ipaddress.ip_network("2405:8100::/32"),
    ipaddress.ip_network("2a06:98c0::/29"),
    ipaddress.ip_network("2c0f:f248::/32"),
]

# Docker internal networks (Caddy → API communication)
TRUSTED_INTERNAL_CIDRS = [
    ipaddress.ip_network("172.16.0.0/12"),   # Docker bridge networks
    ipaddress.ip_network("10.0.0.0/8"),       # Docker overlay networks
    ipaddress.ip_network("192.168.0.0/16"),   # Docker host networks
    ipaddress.ip_network("127.0.0.0/8"),      # Localhost
]


def _is_trusted_proxy(ip_str: str) -> bool:
    """Check if the direct connecting IP belongs to Cloudflare or internal Docker network."""
    try:
        ip = ipaddress.ip_address(ip_str)
        for cidr in CLOUDFLARE_CIDRS:
            if ip in cidr:
                return True
        for cidr in TRUSTED_INTERNAL_CIDRS:
            if ip in cidr:
                return True
    except (ValueError, TypeError):
        pass
    return False


def get_real_client_ip(request: Request) -> str:
    """
    Extrai o IP real do cliente de forma segura.
    
    Só confia nos headers de proxy (CF-Connecting-IP, X-Real-IP, X-Forwarded-For)
    se o request.client.host (IP direto que conectou) pertence a um proxy confiável
    (Cloudflare CIDRs ou rede interna Docker/Caddy).
    
    Isso previne IP spoofing: um atacante que conecta diretamente ao backend
    NÃO consegue forjar o CF-Connecting-IP para bypassar rate limits.
    """
    direct_ip = request.client.host if request.client else None

    # Se o IP direto é de um proxy confiável, podemos confiar nos headers
    if direct_ip and _is_trusted_proxy(direct_ip):
        # 1. Cloudflare Connecting IP (mais confiável)
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        
        # 2. X-Real-IP (passado pelo Caddy)
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        # 3. X-Forwarded-For (primeiro IP da cadeia)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

    # IP direto não é proxy confiável — usar o IP de conexão real
    # (ignora headers que poderiam ser forjados pelo atacante)
    if direct_ip:
        return direct_ip
        
    return "127.0.0.1"

limiter = Limiter(key_func=get_real_client_ip)
