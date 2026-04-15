import httpx
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

async def run():
    url = 'https://sandbox.asaas.com/api/v3/customers'
    req = {
        'name':'Advogado de Teste', 
        'email':'teste@legisvox.com', 
        'cpfCnpj':'16266107708'
    }
    api_key = os.getenv('ASAAS_API_KEY')
    headers = {
        'access_token': api_key or "", 
        'Content-Type': 'application/json'
    }
    async with httpx.AsyncClient() as c:
        resp = await c.post(url, json=req, headers=headers)
        print(resp.status_code)
        print(resp.text)

if __name__ == '__main__':
    asyncio.run(run())
