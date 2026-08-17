import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? 'http://localhost:8000' : '');

export const creditsApi = {
  // Get auth headers
  async getAuthHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || '';
    return {
      'Authorization': `Bearer ${token}`
    };
  },

  // Busca saldo atual
  async getBalance() {
    try {
      const authHeaders = await this.getAuthHeaders();
      const res = await fetch(`${API_URL}/api/credits/balance`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error('Failed to fetch balance');
      const data = await res.json();
      return data.balance || 0;
    } catch (e) {
      console.error('Balance error:', e);
      return 0;
    }
  },

  // Busca pacotes disponíveis
  async getPackages() {
    try {
      const res = await fetch(`${API_URL}/api/credits/packages`);
      if (!res.ok) throw new Error('Failed to fetch packages');
      const data = await res.json();
      return data.packages || [];
    } catch (e) {
      console.error('Packages error:', e);
      return [];
    }
  },

  // Iniciar compra (gera PIX)
  async purchasePackage(packageId, paymentMethod = 'PIX', customAmount = null, cpf = '') {
    const authHeaders = await this.getAuthHeaders();
    const payload = {
      package_id: packageId,
      payment_method: paymentMethod,
      cpf: cpf
    };
    if (customAmount) {
      payload.custom_credits = parseInt(customAmount, 10);
    }
    
    let res;
    try {
      res = await fetch(`${API_URL}/api/credits/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(payload)
      });
    } catch (networkErr) {
      throw new Error(
        `Servidor offline ou inacessível (${API_URL}). Verifique se o backend está rodando.`
      );
    }
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Falha ao gerar pagamento');
    }
    
    return await res.json();
  },


  // Histórico de transações
  async getTransactions() {
    const authHeaders = await this.getAuthHeaders();
    const res = await fetch(`${API_URL}/api/credits/transactions`, {
      headers: authHeaders
    });
    if (!res.ok) throw new Error('Failed to fetch txs');
    const data = await res.json();
    return data.transactions || [];
  },

  // Solicitar créditos de boas-vindas (50 grátis)
  async claimWelcomeCredits() {
    const authHeaders = await this.getAuthHeaders();
    const res = await fetch(`${API_URL}/api/credits/welcome`, {
      method: 'POST',
      headers: authHeaders
    });
    if (!res.ok) throw new Error('Falha ao solicitar créditos de boas-vindas');
    return await res.json();
  },

  // Verificar status do trial
  async getTrialStatus() {
    const authHeaders = await this.getAuthHeaders();
    const res = await fetch(`${API_URL}/api/credits/trial-status`, {
      headers: authHeaders
    });
    if (!res.ok) return { trial_eligible: false, balance: 0 };
    return await res.json();
  }
};
