from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import base64

from database import supabase, supabase_admin
from services.credits import credits_service
from services.asaas import asaas_service
from middleware.auth import get_current_user_id

router = APIRouter(prefix="/api/credits", tags=["Credits"])

class PurchaseRequest(BaseModel):
    package_id: str
    payment_method: str # PIX, BOLETO, CREDIT_CARD
    custom_credits: Optional[int] = None  # For 'Sob Medida' custom packages

@router.get("/balance")
def get_balance(user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(status_code=401, detail="Unauthorized")
    balance = credits_service.get_balance(user_id)
    return {"balance": balance}

@router.get("/packages")
def get_packages():
    packages = credits_service.get_packages()
    return {"packages": packages}

@router.post("/purchase")
async def purchase_package(req: PurchaseRequest, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 1. Pegar infos do advogado no banco (obrigatório)
    user_resp = supabase_admin.table("advogados").select("*").eq("id", user_id).execute()
    if not user_resp.data:
        print("\n\033[91m[ERRO CRÍTICO] Usuário não encontrado no banco.\033[0m")
        print("\033[93mSE VOCÊ JÁ PREENCHEU O CPF, O PROBLEMA É A FALTA DA 'SUPABASE_SERVICE_KEY' NO .env\033[0m")
        raise HTTPException(
            status_code=404, 
            detail="Perfil não encontrado. Complete seu cadastro com CPF/CNPJ ou verifique se a SUPABASE_SERVICE_KEY está configurada no backend."
        )
    
    user_data = user_resp.data[0]
    
    # Validar que CPF/CNPJ está preenchido (obrigatório para Asaas)
    encoded_cpf = user_data.get("cpf_cnpj")
    if not encoded_cpf:
        raise HTTPException(
            status_code=400,
            detail="CPF ou CNPJ é obrigatório para realizar compras. Atualize seu perfil."
        )

    # Tentar decodificar Base64 (fallback para texto limpo em cadastros antigos)
    try:
        raw_cpf = base64.b64decode(encoded_cpf).decode('utf-8')
    except Exception:
        raw_cpf = encoded_cpf
    
    # 2. Pegar pacote
    pkg_resp = supabase_admin.table("credit_packages").select("*").eq("id", req.package_id).execute()
    if not pkg_resp.data:
        raise HTTPException(status_code=404, detail="Package not found")
        
    package = pkg_resp.data[0]
    
    # Handle custom credits (Sob Medida)
    is_custom = package.get("slug") == "sob-medida"
    if is_custom:
        if not req.custom_credits or req.custom_credits < 50:
            raise HTTPException(status_code=400, detail="Mínimo de 50 créditos para compras personalizadas.")
        if req.custom_credits > 2000:
            raise HTTPException(status_code=400, detail="Máximo de 2.000 créditos por compra.")
        credits_amount = req.custom_credits
        price_per_page = package["price_per_page_cents"]
        total_price_cents = credits_amount * price_per_page
    else:
        credits_amount = package["credits"]
        total_price_cents = package["price_cents"]
    
    # 3. Criar Asaas Customer
    try:
        customer_id = await asaas_service.get_or_create_customer(
            user_id, 
            user_data.get("nome", "Advogado Sem Nome"),
            user_data.get("email", ""),
            raw_cpf # Exige CPF válido no Asaas, enviamos decodificado
        )
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail=str(e)
        )
    
    if not customer_id:
        raise HTTPException(status_code=400, detail="Falha ao registrar cliente no Asaas. Verifique seus dados.")
        
    # 4. Criar pagamento
    if is_custom:
        desc = f"LegisVox: Sob Medida ({credits_amount} créditos)"
    else:
        desc = f"LegisVox: {package['name']} ({credits_amount} créditos)"
    
    if req.payment_method == "PIX":
        pay_res = await asaas_service.create_pix_payment(customer_id, total_price_cents, desc)
        
        if not pay_res["success"]:
            raise HTTPException(status_code=400, detail=pay_res["error"])
            
        # 5. Registrar no banco local
        payment_data = {
            "advogado_id": user_id,
            "asaas_payment_id": pay_res["payment_id"],
            "package_id": req.package_id,
            "amount_cents": total_price_cents,
            "status": "pending",
            "payment_method": "PIX",
            "pix_qr_code": pay_res["encoded_image"],
            "pix_copy_paste": pay_res["payload"],
            "invoice_url": pay_res["invoice_url"]
        }
        if is_custom:
            payment_data["purchased_credits"] = credits_amount
        
        supabase_admin.table("payments").insert(payment_data).execute()
        
        return {
            "status": "success",
            "payment": {
                "payment_id": pay_res["payment_id"],
                "pix_payload": pay_res["payload"],
                "qr_code": pay_res["encoded_image"],
                "invoice_url": pay_res["invoice_url"],
                "price": total_price_cents / 100,
                "credits": credits_amount
            }
        }
        
    raise HTTPException(status_code=501, detail="Payment method not implemented yet")

@router.get("/transactions")
def get_transactions(user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(status_code=401, detail="Unauthorized")
    
    resp = supabase_admin.table("credit_transactions").select("*, credit_packages(name), atas(id)").eq("advogado_id", user_id).order("created_at", desc=True).limit(50).execute()
    return {"transactions": resp.data or []}

@router.post("/welcome")
def grant_welcome_credits(request: Request, user_id: str = Depends(get_current_user_id)):
    """Concede 50 créditos de boas-vindas (uma única vez por CPF).
    Admins podem passar header 'advogado_id' para conceder a outro usuário.
    """
    if not user_id: raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Admin pode conceder a outro usuário via header
    target_id = request.headers.get("advogado_id", user_id)
    
    granted = credits_service.grant_welcome_credits(target_id)
    if granted:
        return {
            "status": "success",
            "message": f"🎁 Parabéns! {credits_service.WELCOME_CREDITS} créditos de teste gratuitos concedidos.",
            "credits_granted": credits_service.WELCOME_CREDITS,
            "balance": credits_service.get_balance(target_id)
        }
    else:
        return {
            "status": "already_granted",
            "message": "Créditos de boas-vindas já foram concedidos anteriormente.",
            "balance": credits_service.get_balance(target_id)
        }

@router.get("/trial-status")
def get_trial_status(user_id: str = Depends(get_current_user_id)):
    """Verifica se o usuário já recebeu créditos de boas-vindas."""
    if not user_id: raise HTTPException(status_code=401, detail="Unauthorized")
    
    eligible = credits_service.check_trial_eligible(user_id)
    balance = credits_service.get_balance(user_id)
    return {
        "trial_eligible": eligible,
        "trial_credits": credits_service.WELCOME_CREDITS,
        "balance": balance
    }
