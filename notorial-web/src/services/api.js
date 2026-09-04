const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.DEV ? 'http://localhost:8000' : '');

function mapNetworkError(error) {
    const message = String(error?.message || '');
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return new Error(`Não foi possível conectar ao servidor (${API_BASE || 'mesma origem'}). Verifique se a API está online.`);
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

export async function uploadInChunks(file, onProgress = null) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB por fatia (otimizado para redes lentas <= 1Mbps e seguro contra timeout de 100s do Cloudflare)
    const uploadId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const headers = await getAuthHeader();

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        let attempt = 0;
        let success = false;
        let lastError = null;

        while (attempt < 3 && !success) {
            attempt++;
            try {
                const chunkData = new FormData();
                chunkData.append('chunk', chunkBlob, file.name);
                chunkData.append('upload_id', uploadId);
                chunkData.append('chunk_index', String(i));
                chunkData.append('total_chunks', String(totalChunks));
                chunkData.append('filename', file.name);

                const response = await fetch(`${API_BASE}/api/atas/upload/chunk`, {
                    method: 'POST',
                    headers,
                    body: chunkData,
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.detail || `Erro na transmissão da fatia ${i + 1}/${totalChunks}`);
                }

                success = true;
                if (onProgress) {
                    const percent = Math.round(((i + 1) / totalChunks) * 100);
                    onProgress(percent, i + 1, totalChunks);
                }
            } catch (err) {
                lastError = err;
                if (attempt < 3) {
                    // Espera exponencial breve (1s, 2s) antes de retentar a mesma fatia
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }

        if (!success) {
            throw new Error(lastError?.message || `Falha na conexão ao enviar a parte ${i + 1} de ${totalChunks}.`);
        }
    }

    return uploadId;
}

export async function estimateUpload(file, options = {}, onProgress = null) {
    const CHUNK_THRESHOLD = 25 * 1024 * 1024; // Arquivos > 25MB usam upload fracionado
    const headers = await getAuthHeader();
    let response;

    try {
        if (file && file.size > CHUNK_THRESHOLD) {
            // Upload em fatias para contornar com segurança o limite de 100MB do Cloudflare
            const uploadId = await uploadInChunks(file, (percent, current, total) => {
                if (onProgress) onProgress('uploading_chunks', percent, current, total);
            });

            if (onProgress) onProgress('estimating', 100);

            const formData = new FormData();
            formData.append('upload_id', uploadId);
            formData.append('filename', file.name);
            if (options.startDate) formData.append('startDate', options.startDate);
            if (options.endDate) formData.append('endDate', options.endDate);

            response = await fetch(`${API_BASE}/api/atas/upload/estimate`, {
                method: 'POST',
                headers,
                body: formData,
            });
        } else {
            // Upload direto para arquivos pequenos (fluxo original)
            if (onProgress) onProgress('estimating', 50);

            const formData = new FormData();
            formData.append('file', file);
            if (options.startDate) formData.append('startDate', options.startDate);
            if (options.endDate) formData.append('endDate', options.endDate);

            response = await fetch(`${API_BASE}/api/atas/upload/estimate`, {
                method: 'POST',
                headers,
                body: formData,
            });
        }
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
