const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function mapNetworkError(error) {
    const message = String(error?.message || '');
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return new Error(`Nao foi possivel conectar ao backend (${API_BASE}). Verifique se a API esta rodando na porta 8000.`);
    }
    return error;
}

async function getAuthHeader() {
    try {
        const { supabase } = await import('./supabase');
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    } catch (e) {
        console.warn('Auth header error:', e);
        return {};
    }
}

export async function getAuthHeaderForDownload() {
    return getAuthHeader();
}

export async function apiRequest(endpoint, options = {}) {
    const headers = await getAuthHeader();
    const requestHeaders = new Headers({
        ...headers,
        ...options.headers,
    });
    
    if (!(options.body instanceof FormData) && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: requestHeaders,
        });
    } catch (error) {
        throw mapNetworkError(error);
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro na requisição');
    }

    return response.json();
}

export async function listAtas() {
    return apiRequest('/api/atas');
}

export async function getAtaStatus(ataId) {
    return apiRequest(`/api/atas/${ataId}/status`);
}

export async function uploadZip(file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    if (options.startDate) formData.append('startDate', options.startDate);
    if (options.endDate) formData.append('endDate', options.endDate);
    
    const headers = await getAuthHeader();
    let response;
    try {
        response = await fetch(`${API_BASE}/api/atas/upload`, {
            method: 'POST',
            headers, // sem Content-Type para o browser preencher o boundary automaticamente
            body: formData,
        });
    } catch (error) {
        throw mapNetworkError(error);
    }

    if (!response.ok) {
        let errorMsg = 'Erro no upload';
        const err = await response.json().catch(() => ({}));
        if (err && err.detail) errorMsg = err.detail;
        throw new Error(errorMsg);
    }

    return response.json();
}

export async function estimateUpload(file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    if (options.startDate) formData.append('startDate', options.startDate);
    if (options.endDate) formData.append('endDate', options.endDate);

    const headers = await getAuthHeader();
    let response;
    try {
        response = await fetch(`${API_BASE}/api/atas/upload/estimate`, {
            method: 'POST',
            headers,
            body: formData,
        });
    } catch (error) {
        throw mapNetworkError(error);
    }

    if (!response.ok) {
        let errorMsg = 'Erro na estimativa';
        const err = await response.json().catch(() => ({}));
        if (err && err.detail) errorMsg = err.detail;
        throw new Error(errorMsg);
    }

    return response.json();
}

export async function confirmUpload(ataId) {
    return apiRequest('/api/atas/upload/confirm', {
        method: 'POST',
        body: JSON.stringify({ ata_id: ataId }),
    });
}

export async function deleteAta(ataId) {
    return apiRequest(`/api/atas/${ataId}`, { method: 'DELETE' });
}

export async function updateAtaTitle(ataId, titulo) {
    return apiRequest(`/api/atas/${ataId}/titulo`, {
        method: 'PATCH',
        body: JSON.stringify({ titulo })
    });
}
