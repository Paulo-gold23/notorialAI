import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, ShieldAlert, FileSearch, UploadCloud,
  Copy, Check, ArrowLeft, RefreshCw, FileText, Lock,
  ExternalLink, Calendar, UserCheck, Hash, Info, AlertTriangle
} from 'lucide-react';
import { supabase } from '../services/supabase';
import LegalFooter from '../components/LegalFooter';
import Logo from '../components/Logo';

export default function PublicHashVerifier() {
  const [searchParams] = useSearchParams();
  const initialHash = searchParams.get('hash') || '';

  const [inputHash, setInputHash] = useState(initialHash);
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const navigate = useNavigate();

  // Auto-verify if query param ?hash=... is passed
  React.useEffect(() => {
    if (initialHash && initialHash.length >= 32) {
      handleVerifyHash(initialHash);
    }
  }, [initialHash]);

  // Compute SHA-256 locally in browser
  const computeFileSha256 = async (file) => {
    setCalculatingHash(true);
    setSelectedFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setInputHash(hashHex);
      await handleVerifyHash(hashHex);
    } catch (err) {
      alert('Erro ao calcular hash do arquivo: ' + err.message);
    } finally {
      setCalculatingHash(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      computeFileSha256(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      computeFileSha256(e.target.files[0]);
    }
  };

  const handleVerifyHash = async (hashToVerify) => {
    const targetHash = (hashToVerify || inputHash).trim();
    if (!targetHash || targetHash.length < 32) {
      alert('Por favor, informe um código Hash SHA-256 válido com pelo menos 32 caracteres.');
      return;
    }

    setVerifying(true);
    setResult(null);

    try {
      const { data, error } = await supabase.rpc('verify_document_hash', {
        p_hash: targetHash
      });

      if (error) throw error;
      setResult(data);
    } catch (err) {
      setResult({
        found: false,
        error: 'Erro de comunicação ao consultar validador: ' + err.message
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyHash = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-enter" style={{ minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navbar */}
      <header style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--panel-bg)',
        padding: '0.85rem 1.5rem',
        position: 'sticky', top: 0, zIndex: 40,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <Logo size={32} />
            <div>
              <span className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                LegisVox
              </span>
              <span style={{
                marginLeft: '0.5rem',
                fontSize: '0.65rem',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '0.1rem 0.4rem',
                borderRadius: '0.25rem',
                fontWeight: 700
              }}>
                VALIDADOR PÚBLICO
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} /> Início
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.25rem', flex: 1, width: '100%' }}>
        
        {/* Title & Introduction */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--primary-glow)', color: 'var(--gold-main)',
            padding: '0.35rem 0.9rem', borderRadius: '9999px',
            fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem',
            border: '1px solid rgba(212, 160, 23, 0.3)'
          }}>
            <Lock size={14} /> INTEGRIDADE CRIPTOGRÁFICA PERICIAL
          </div>
          <h1 className="font-serif" style={{ fontSize: '2.2rem', color: 'var(--text-main)', margin: '0 0 0.75rem', lineHeight: 1.2 }}>
            Verificador de Autenticidade de Hashes
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>
            Consulte a integridade temporal de relatórios técnicos e arquivos probatórios gerados pelo LegisVox. 
            Esta ferramenta pública permite que <strong>magistrados, promotores, peritos e partes</strong> confirmem a autenticidade e a não-adulteração de documentos.
          </p>
        </div>

        {/* Input Methods Card */}
        <div className="card" style={{ padding: '2rem', marginBottom: '2rem', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
          
          {/* Method 1: Drag & Drop File */}
          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              Opção 1: Selecione ou arraste o arquivo PDF/ZIP para conferência automática
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--primary-color)' : 'var(--border-color)'}`,
                background: isDragOver ? 'rgba(59, 130, 246, 0.05)' : 'var(--panel-bg)',
                borderRadius: '0.75rem',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onClick={() => document.getElementById('file-verifier-input').click()}
            >
              <input
                id="file-verifier-input"
                type="file"
                accept=".pdf,.zip"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <UploadCloud size={38} style={{ color: 'var(--primary-color)', margin: '0 auto 0.75rem' }} />
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                {calculatingHash ? 'Calculando Hash SHA-256 no seu navegador...' : (selectedFileName ? `Arquivo: ${selectedFileName}` : 'Clique para selecionar ou arraste o PDF/ZIP aqui')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)' }}>
                🔒 <strong>Privacidade Total:</strong> O cálculo matemático do hash é executado 100% no seu navegador (WebCrypto). Seu documento não é transmitido a servidores para o cálculo.
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OU</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          </div>

          {/* Method 2: Paste SHA-256 directly */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              Opção 2: Cole o código Hash SHA-256 informado no rodapé do documento
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                <Hash size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Ex: a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
                  value={inputHash}
                  onChange={(e) => setInputHash(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', fontSize: '0.825rem', width: '100%', height: '44px' }}
                />
              </div>
              <button
                onClick={() => handleVerifyHash()}
                disabled={verifying || calculatingHash || !inputHash.trim()}
                className="btn-primary"
                style={{ height: '44px', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}
              >
                {verifying ? <RefreshCw size={16} className="animate-spin" /> : <FileSearch size={16} />}
                Verificar Integridade
              </button>
            </div>
          </div>
        </div>

        {/* Verification Result Section */}
        {result && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out', marginBottom: '2.5rem' }}>
            {result.found ? (
              /* SUCCESS / AUTHENTIC CARD */
              <div className="card" style={{
                padding: '2rem',
                border: '2px solid rgba(74, 222, 128, 0.4)',
                background: 'linear-gradient(180deg, rgba(74, 222, 128, 0.04) 0%, var(--panel-bg) 100%)',
                boxShadow: '0 12px 35px rgba(74, 222, 128, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(74, 222, 128, 0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <ShieldCheck size={28} color="#4ade80" />
                  </div>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80',
                      border: '1px solid rgba(74, 222, 128, 0.3)',
                      padding: '0.2rem 0.6rem', borderRadius: '9999px',
                      fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.04em',
                      marginBottom: '0.4rem'
                    }}>
                      ✓ DOCUMENTO AUTÊNTICO & REGISTRADO
                    </div>
                    <h2 className="font-serif" style={{ fontSize: '1.35rem', margin: 0, color: 'var(--text-main)' }}>
                      Integridade Criptográfica Confirmada
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                      O hash pesquisado coincide perfeitamente com os registros imutáveis da plataforma.
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem', background: 'var(--bg-color)', padding: '1.25rem',
                  borderRadius: '0.6rem', border: '1px solid var(--border-color)',
                  marginBottom: '1.5rem'
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                      Tipo de Registro
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {result.hash_type}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                      Data / Hora de Geração
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Calendar size={14} color="var(--primary-color)" />
                      {new Date(result.issued_at).toLocaleString('pt-BR')} (BRT)
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                      Responsável Técnico / Emissor
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <UserCheck size={14} color="var(--gold-main)" />
                      {result.advogado_identificador}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                      Extensão / Páginas
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {result.pages_count ? `${result.pages_count} páginas` : 'Relatório Técnico'}
                    </div>
                  </div>
                </div>

                {/* Hash Details Box */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)', padding: '1rem',
                  borderRadius: '0.5rem', border: '1px solid var(--border-color)',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      Hash SHA-256 Registrado:
                    </span>
                    <button
                      onClick={() => handleCopyHash(result.matched_hash)}
                      className="btn-ghost"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                      {copied ? 'Copiado' : 'Copiar Hash'}
                    </button>
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: '0.8rem', color: '#4ade80',
                    wordBreak: 'break-all', background: 'rgba(0,0,0,0.4)', padding: '0.6rem',
                    borderRadius: '0.35rem'
                  }}>
                    {result.matched_hash}
                  </div>
                </div>

                {/* Legal & Forensic Note */}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', lineHeight: 1.6 }}>
                  ⚖️ <strong>Certificação Técnica:</strong> O algoritmo SHA-256 assegura que o arquivo submetido é idêntico byte a byte ao emitido pela ferramenta. 
                  Conforme os Arts. 369 e 411, II do Código de Processo Civil (CPC), a correspondência criptográfica comprova a ausência de adulteração ou modificação posterior à data registrada.
                </div>
              </div>
            ) : (
              /* FAILURE / NOT FOUND CARD */
              <div className="card" style={{
                padding: '2rem',
                border: '2px solid rgba(239, 68, 68, 0.4)',
                background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.04) 0%, var(--panel-bg) 100%)',
                boxShadow: '0 12px 35px rgba(239, 68, 68, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <ShieldAlert size={28} color="#ef4444" />
                  </div>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      padding: '0.2rem 0.6rem', borderRadius: '9999px',
                      fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.04em',
                      marginBottom: '0.4rem'
                    }}>
                      ✕ HASH NÃO ENCONTRADO
                    </div>
                    <h2 className="font-serif" style={{ fontSize: '1.35rem', margin: 0, color: 'var(--text-main)' }}>
                      Incompatibilidade ou Registro Inexistente
                    </h2>
                    <p style={{ margin: '0.4rem 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      O código hash pesquisado não coincide com nenhum documento válido emitido pela plataforma LegisVox.
                    </p>

                    <div style={{
                      background: 'rgba(0,0,0,0.3)', padding: '1rem',
                      borderRadius: '0.5rem', border: '1px solid var(--border-color)',
                      marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)'
                    }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                        Possíveis causas:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                        <li><strong>Adulteração Pós-Emissão:</strong> O arquivo PDF foi re-salvo, compactado ou teve páginas editadas após ser gerado.</li>
                        <li><strong>Divergência de Arquivo:</strong> O arquivo selecionado não é o relatório final original exportado pelo sistema.</li>
                        <li><strong>Código Incorreto:</strong> Houve erro de digitação ou truncamento no código SHA-256 colado.</li>
                      </ul>
                    </div>

                    <div style={{
                      fontFamily: 'monospace', fontSize: '0.75rem', color: '#f87171',
                      wordBreak: 'break-all', background: 'rgba(0,0,0,0.4)', padding: '0.5rem 0.75rem',
                      borderRadius: '0.35rem'
                    }}>
                      Hash testado: {result.searched_hash || inputHash}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Informative Educational Cards for Lawyers & Judiciary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Lock size={18} color="var(--gold-main)" />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                O que é o Hash SHA-256?
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              É uma "impressão digital matemática" de 256 bits única para cada arquivo. Se apenas uma única letra, espaço ou vírgula for alterada no documento, o hash gerado se torna completamente diferente.
            </p>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <FileText size={18} color="var(--primary-color)" />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Cadeia de Custódia Probatória
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              O LegisVox registra tanto o Hash do arquivo ZIP original quanto o Hash do PDF compilado, garantindo o rastreamento da integridade da origem ao relatório final (ISO 27037).
            </p>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={18} color="#4ade80" />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Uso em Juízo (CPC)
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              A validação por hash permite demonstrar a integridade técnica da prova perante o juízo, subsidiando a livre convicção motivada do magistrado (Art. 371, CPC).
            </p>
          </div>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
