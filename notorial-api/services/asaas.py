import httpx
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from config import settings
from database import supabase, supabase_admin

_db = supabase_admin or supabase  # use service role to bypass RLS


logger = logging.getLogger(__name__)


class AsaasService:
    def __init__(self):
        self.api_key = settings.ASAAS_API_KEY
        if settings.ASAAS_ENVIRONMENT == "sandbox":
            self.base_url = "https://sandbox.asaas.com/api/v3"
        else:
            self.base_url = "https://api.asaas.com/v3"

        self.headers = {
            "access_token": self.api_key,
            "Content-Type": "application/json"
        }

    async def get_or_create_customer(
        self, advogado_id: str, nome: str, email: str, cpf_cnpj: str
    ) -> Optional[str]:
        if not _db:
            return None

        # 1. Check local DB first
        customer_record = (
            _db.table("asaas_customers")
            .select("asaas_customer_id")
            .eq("advogado_id", advogado_id)
            .execute()
        )
        if customer_record.data:
            return customer_record.data[0]["asaas_customer_id"]

        async with httpx.AsyncClient(timeout=20.0) as client:
            # 2. Attempt to create customer in Asaas
            payload = {"name": nome, "email": email, "cpfCnpj": cpf_cnpj}
            response = await client.post(
                f"{self.base_url}/customers",
                json=payload,
                headers=self.headers,
            )

            if response.status_code in (200, 201):
                data = response.json()
                customer_id = data.get("id")
                if customer_id:
                    self._save_customer_locally(advogado_id, customer_id)
                    return customer_id

            # 3. Creation failed — log full Asaas response
            logger.error(
                f"[ASAAS] Customer creation failed | status={response.status_code} | "
                f"advogado={advogado_id} | cpf={cpf_cnpj} | body={response.text}"
            )

            # 4. If CPF/CNPJ already exists in Asaas, retrieve existing customer
            error_text = response.text
            if response.status_code == 400 and (
                "cpfCnpj" in error_text or "duplicate" in error_text.lower()
            ):
                existing = await self._find_customer_by_cpf(client, cpf_cnpj)
                if existing:
                    self._save_customer_locally(advogado_id, existing)
                    return existing

            # 5. Raise with readable message so the router can surface it
            asaas_errors = self._extract_asaas_errors(response)
            raise ValueError(f"Asaas: {asaas_errors}")

    # ── helpers ──────────────────────────────────────────────────────────────

    def _save_customer_locally(self, advogado_id: str, customer_id: str):
        _db.table("asaas_customers").insert({
            "advogado_id": advogado_id,
            "asaas_customer_id": customer_id,
        }).execute()

    async def _find_customer_by_cpf(
        self, client: httpx.AsyncClient, cpf_cnpj: str
    ) -> Optional[str]:
        try:
            resp = await client.get(
                f"{self.base_url}/customers?cpfCnpj={cpf_cnpj}",
                headers=self.headers,
            )
            if resp.status_code == 200:
                users = resp.json().get("data", [])
                if users:
                    return users[0].get("id")
        except Exception as e:
            logger.warning(f"[ASAAS] CPF lookup failed: {e}")
        return None

    def _extract_asaas_errors(self, response: httpx.Response) -> str:
        """Parse Asaas error body into a human-readable Portuguese string."""
        try:
            body = response.json()
            errors = body.get("errors", [])
            if errors:
                msgs = []
                for err in errors:
                    code = err.get("code", "")
                    desc = err.get("description", "")
                    # Translate the most common Asaas codes to Portuguese
                    translated = _ASAAS_CODE_PT.get(code, desc or code)
                    msgs.append(translated)
                return " | ".join(msgs)
        except Exception:
            pass
        return response.text[:300]

    # ── payment methods ───────────────────────────────────────────────────────

    async def create_pix_payment(
        self, asaas_customer_id: str, amount_cents: int, desc: str
    ) -> Dict[str, Any]:
        amount = amount_cents / 100.0
        due_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        payload = {
            "customer": asaas_customer_id,
            "billingType": "PIX",
            "dueDate": due_date,
            "value": amount,
            "description": desc,
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self.base_url}/payments",
                json=payload,
                headers=self.headers,
            )

            if response.status_code == 200:
                payment_data = response.json()
                payment_id = payment_data.get("id")

                # Fetch QR Code
                qr_response = await client.get(
                    f"{self.base_url}/payments/{payment_id}/pixQrCode",
                    headers=self.headers,
                )
                qr_data = qr_response.json() if qr_response.status_code == 200 else {}

                return {
                    "success": True,
                    "payment_id": payment_id,
                    "invoice_url": payment_data.get("invoiceUrl"),
                    "encoded_image": qr_data.get("encodedImage"),
                    "payload": qr_data.get("payload"),
                }

            logger.error(
                f"[ASAAS] Payment creation failed | status={response.status_code} | "
                f"customer={asaas_customer_id} | body={response.text}"
            )
            return {"success": False, "error": self._extract_asaas_errors(response)}

    async def get_payment_status(self, payment_id: str) -> str:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self.base_url}/payments/{payment_id}",
                headers=self.headers,
            )
            if response.status_code == 200:
                return response.json().get("status", "UNKNOWN")
        return "ERROR"


# ── Asaas error code → Portuguese translations ────────────────────────────────
_ASAAS_CODE_PT: Dict[str, str] = {
    "invalid_cpfCnpj": "O CPF ou CNPJ informado é inválido. Verifique os dígitos.",
    "cpfCnpj_already_in_use": "Este CPF/CNPJ já está cadastrado. Contacte o suporte.",
    "invalid_name": "O nome informado é inválido.",
    "invalid_email": "O e-mail informado é inválido.",
    "customer_not_found": "Cliente não encontrado no Asaas.",
    "invalid_value": "Valor do pagamento inválido.",
    "insufficient_balance": "Saldo insuficiente na conta Asaas.",
}

asaas_service = AsaasService()
