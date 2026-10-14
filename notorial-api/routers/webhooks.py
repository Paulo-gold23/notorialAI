from fastapi import APIRouter, Request, HTTPException, Header
import json
import hmac
import logging
from datetime import datetime, timezone

from config import settings
from database import supabase_admin, db_exec
from services.credits import credits_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

@router.post("/asaas")
async def asaas_webhook(request: Request, asaas_access_token: str = Header(None)):
    if not settings.ASAAS_WEBHOOK_TOKEN or not asaas_access_token or not hmac.compare_digest(asaas_access_token, settings.ASAAS_WEBHOOK_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid webhook token or unconfigured system")
        
    try:
        body = await request.json()
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    event = body.get("event")
    payment_data = body.get("payment", {})
    payment_id = payment_data.get("id")
    
    if not payment_id:
        return {"status": "ignored", "reason": "No payment id"}
        
    if event == "PAYMENT_CONFIRMED" or event == "PAYMENT_RECEIVED":
        # 1. Obter registro de pagamento
        pay_resp = await db_exec(
            lambda: supabase_admin.table("payments").select("*").eq("asaas_payment_id", payment_id).execute()
        )
        if not pay_resp.data:
            return {"status": "ignored", "reason": "Payment not found in local DB"}
            
        payment = pay_resp.data[0]
        if payment["status"] in ["confirmed", "received"]:
            return {"status": "ignored", "reason": "Already processed"}
            
        # 2. Atualizar status atomicamente (previne condição de corrida entre PAYMENT_RECEIVED e PAYMENT_CONFIRMED)
        upd_resp = await db_exec(
            lambda: supabase_admin.table("payments").update({
                "status": "confirmed",
                "paid_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", payment["id"]).neq("status", "confirmed").neq("status", "received").execute()
        )
        if not upd_resp.data:
            return {"status": "ignored", "reason": "Already processed"}
        
        # 3. Adicionar créditos usando o UUID interno (payment["id"]) exigido pela RPC add_credits
        pkg_resp = await db_exec(
            lambda: supabase_admin.table("credit_packages").select("*").eq("id", payment["package_id"]).execute()
        )
        if pkg_resp.data:
            package = pkg_resp.data[0]
            # For custom packages (Sob Medida), use purchased_credits from payment record
            credits_amount = payment.get("purchased_credits") or package["credits"]
            added = await db_exec(
                lambda: credits_service.add_credits(
                    advogado_id=payment["advogado_id"],
                    package_id=package["id"],
                    payment_id=payment["id"],
                    amount=credits_amount
                )
            )
            if not added:
                logger.error(f"[WEBHOOK] Falha ao adicionar {credits_amount} créditos para payment_id={payment['id']} (asaas={payment_id})")
                raise HTTPException(status_code=500, detail="Failed to credit account")
            
        return {"status": "success", "message": "Credits added"}
        
    elif event in ["PAYMENT_OVERDUE", "PAYMENT_BANK_SLIP_VIEWED"]:
        await db_exec(
            lambda: supabase_admin.table("payments").update({
                "status": event.lower().replace("payment_", "")
            }).eq("asaas_payment_id", payment_id).execute()
        )
        
    return {"status": "received"}
