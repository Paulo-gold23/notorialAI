from fastapi import Request
from slowapi import Limiter
import logging

logger = logging.getLogger(__name__)

def get_real_client_ip(request: Request) -> str:
    """
    Extrai o IP real do cliente quando atrás do Cloudflare e Caddy Proxy.
    Evita que o proxy seja considerado o cliente único para rate limiting.
    """
    # 1. Cloudflare Connecting IP
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
    
    # 4. Fallback direto
    if request.client and request.client.host:
        return request.client.host
        
    return "127.0.0.1"

limiter = Limiter(key_func=get_real_client_ip)

