const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const MOCK_ATAS = [
    {
        id: 'mock-1',
        titulo: 'Reunião de Condomínio - Edifício Europa',
        total_mensagens: 145,
        total_audios: 3,
        created_at: new Date().toISOString(),
        status: 'ready'
    },
    {
        id: 'mock-2',
        titulo: 'Negociação de Contrato de Aluguel',
        total_mensagens: 82,
        total_audios: 0,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        status: 'ready'
    },
    {
        id: 'mock-3',
        titulo: 'Discussão Demissão Por Justa Causa',
        total_mensagens: 312,
        total_audios: 12,
        created_at: new Date(Date.now() - 172800000).toISOString(),
        status: 'ready'
    }
];

const MOCK_CONTENT = {
    conteudo_preparatorio: `<h2>Material Preparatório (Demo)</h2><p>Este é um exemplo de como a inteligência artificial analisa e organiza as conversas extraídas do WhatsApp.</p><ul><li><strong>Participante A:</strong> Boa tarde, vamos iniciar a reunião sobre as vagas de garagem.</li><li><strong>Participante B:</strong> Certo, eu gostaria de sugerir que a vaga 12 fique para o apartamento 101.</li></ul>`,
    conteudo_formal: `<h2>Ata Notarial (Demo)</h2><p>AOS [DIA] DIAS DO MÊS DE [MÊS] DO ANO DE DOIS MIL E VINTE E QUATRO (2024), nesta cidade, compareceu o solicitante, o qual me apresentou um arquivo de conversas pelo aplicativo WhatsApp...</p><p>As partes debateram e concordaram com a destinação da vaga 12 para a unidade 101.</p>`
};

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

export async function apiRequest(endpoint, options = {}) {
    const isTest = sessionStorage.getItem('notorial_test_admin') === 'true';

    if (isTest) {
        console.log(`[DEMO MODE] Intercepted apiRequest to: ${endpoint}`);
        return new Promise((resolve) => {
            setTimeout(() => {
                if (endpoint === '/api/atas' && options.method !== 'DELETE') {
                    resolve(MOCK_ATAS);
                } else if (endpoint.match(/^\/api\/atas\/([^\/]+)\/preview$/)) {
                    const match = endpoint.match(/\/api\/atas\/([^\/]+)\/preview/);
                    const id = match ? match[1] : 'mock-1';
                    const ata = MOCK_ATAS.find(a => a.id === id) || MOCK_ATAS[0];
                    resolve({ ata, conteudo: MOCK_CONTENT });
                } else if (endpoint.match(/^\/api\/atas\/([^\/]+)/) && options.method === 'DELETE') {
                    resolve({ detail: 'Ata excluída com sucesso (demo)' });
                } else if (endpoint.includes('generate-formal')) {
                    resolve({ conteudo_formal: MOCK_CONTENT.conteudo_formal });
                } else if (endpoint.includes('generate-pdf')) {
                    // Generate a fake blob PDF just to test download functionality without breaking
                    resolve({ pdf_url: 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nDPQM1Qo5ypUMFAwALJMLU31jBQsTAz1LBSKikpzUvNScxSKkjPzEnNTwTxgLkggN7EoWcEIyCjNyWEoAgB1fBALCmVuZHN0cmVhbQplbmRvYmoKCjMgMCBvYmoKNDkKZW5kb2JqCgo0IDAgb2JqCjw8L1R5cGUvUGFnZS9NZWRpYUJveFswIDAgNTk1IDg0Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDEgMCBSPj4+Pi9Db250ZW50cyAyIDAgUi9QYXJlbnQgNSAwIFI+PgplbmRvYmoKCjEgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzQgMCBSXT4+CmVuZG9iagoKNiAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgNSAwIFI+PgplbmRvYmoKCjcgMCBvYmoKPDwvUHJvZHVjZXIoZ2hvc3RzY3JpcHQpL0NyZWF0aW9uRGF0ZShEOjIwMjQwMzMxMTIyMjI3Wik+PgplbmRvYmoKCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDI1OCAwMDAwMCBuIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMzMgMDAwMDAgbiAKMDAwMDAwMDE1MiAwMDAwMCBuIAowMDAwMDAwMzQ2IDAwMDAwIG4gCjAwMDAwMDA0MDUgMDAwMDAgbiAKMDAwMDAwMDQ1NCAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgOC9Sb290IDYgMCBSL0luZm8gNyAwIFI+PgpzdGFydHhyZWYKNTE5CiUlRU9GCg==' });
                } else if (endpoint.includes('content') && (options.method === 'PUT' || options.method === 'POST')) {
                    resolve({ detail: 'Salvo com sucesso (demo)' });
                } else if (endpoint.includes('status')) {
                    const elapsed = Date.now() - (window.demoStart || Date.now());
                    let status = 'ready';
                    let progress = 100;
                    if (elapsed < 2000) { status = 'parsing'; progress = 35; }
                    else if (elapsed < 4500) { status = 'transcribing'; progress = 65; }
                    else if (elapsed < 7500) { status = 'organizing'; progress = 85; }
                    
                    resolve({ status, progress, status_message: 'Processamento em andamento pela IA Demo...' });
                } else {
                    resolve({});
                }
            }, 600); // 600ms network delay simulation
        });
    }

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
    const isTest = sessionStorage.getItem('notorial_test_admin') === 'true';

    if (isTest) {
        console.log(`[DEMO MODE] Intercepted uploadZip`);
        return new Promise((resolve) => {
            setTimeout(() => {
                window.demoStart = Date.now();
                resolve({ ata_id: 'mock-new-1', detail: 'Upload simulado com sucesso (demo)' });
            }, 1800); // simulate upload
        });
    }

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
        try {
            const err = await response.json();
            if (err && err.detail) errorMsg = err.detail;
        } catch (e) {}
        throw new Error(errorMsg);
    }

    return response.json();
}

export async function deleteAta(ataId) {
    return apiRequest(`/api/atas/${ataId}`, { method: 'DELETE' });
}
