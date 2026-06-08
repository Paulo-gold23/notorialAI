def mask_email(email: str) -> str:
    if not email or '@' not in email:
        return '***'
    try:
        user, domain = email.split('@', 1)
        if len(user) <= 2:
            return f"{user}***@{domain}"
        return f"{user[:2]}***@{domain}"
    except Exception:
        return '***'

def mask_cpf(cpf: str) -> str:
    if not cpf:
        return '***'
    clean = "".join(c for c in cpf if c.isdigit())
    if len(clean) < 6:
        return '***'
    return f"***{clean[-4:]}"
