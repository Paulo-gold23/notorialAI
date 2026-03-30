-- Perfil do advogado (vinculado ao auth.users)
CREATE TABLE advogados (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    nome VARCHAR(255) NOT NULL,
    oab VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    escritorio VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscas por email
CREATE INDEX idx_advogados_email ON advogados(email);

-- Atas geradas (metadados e controle)
CREATE TABLE atas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advogado_id UUID NOT NULL REFERENCES advogados(id),
    
    -- Identificação
    titulo VARCHAR(255),
    
    -- Dados do upload
    zip_url TEXT,
    zip_filename VARCHAR(255),
    
    -- Metadados parseados
    participantes JSONB,
    periodo_inicio DATE,
    periodo_fim DATE,
    total_mensagens INTEGER,
    total_audios INTEGER,
    
    -- Controle de processamento
    status VARCHAR(30) DEFAULT 'uploading',
    -- Status: uploading → parsing → transcribing → organizing → ready → error
    error_message TEXT,  -- mensagem legível em caso de erro
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frequentes
CREATE INDEX idx_atas_advogado ON atas(advogado_id);
CREATE INDEX idx_atas_status ON atas(status);
CREATE INDEX idx_atas_created ON atas(created_at DESC);

-- Conteúdo pesado (separado para performance nas listagens)
CREATE TABLE atas_conteudo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_id UUID NOT NULL REFERENCES atas(id) ON DELETE CASCADE,
    
    chat_parseado JSONB,        -- JSON estruturado do parser
    conteudo_formal JSONB,      -- Saída da IA: ata formal
    conteudo_preparatorio JSONB, -- Saída da IA: material preparatório
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conteudo_ata ON atas_conteudo(ata_id);

-- PDFs gerados (pode ter múltiplas versões)
CREATE TABLE atas_pdfs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ata_id UUID NOT NULL REFERENCES atas(id) ON DELETE CASCADE,
    
    tipo VARCHAR(20) NOT NULL, -- 'formal' ou 'preparatorio'
    pdf_url TEXT NOT NULL,
    versao INTEGER DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pdfs_ata ON atas_pdfs(ata_id);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON atas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security)
-- Advogados só veem seus próprios dados
ALTER TABLE atas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_atas" ON atas
    FOR ALL USING (advogado_id = auth.uid());

ALTER TABLE atas_conteudo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_conteudo" ON atas_conteudo
    FOR ALL USING (
        ata_id IN (SELECT id FROM atas WHERE advogado_id = auth.uid())
    );

ALTER TABLE atas_pdfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advogados_own_pdfs" ON atas_pdfs
    FOR ALL USING (
        ata_id IN (SELECT id FROM atas WHERE advogado_id = auth.uid())
    );
