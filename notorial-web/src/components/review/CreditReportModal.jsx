import React, { useEffect } from 'react';
import { Coins, FileText, RefreshCw, X } from 'lucide-react';

export default function CreditReportModal({ report, onClose, onDownload }) {
    // Lock scroll when open
    useEffect(() => {
        if (report) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [report]);

    if (!report) return null;

    return (
        <div 
            className="modal-backdrop-responsive" 
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div 
                className="modal-dialog-responsive"
                style={{ maxWidth: '480px' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (Fixed) */}
                <div className="modal-dialog-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '0.7rem',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
                            border: '1px solid rgba(59,130,246,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-color)', flexShrink: 0,
                        }}>
                            <Coins size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Relatório de Créditos
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                PDF gerado com sucesso
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--text-muted)',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                        }}
                        onMouseOver={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                        aria-label="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body (Scrollable if height exceeds screen) */}
                <div className="modal-dialog-body">
                    {/* Stats Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '1.25rem',
                    }}>
                        {/* Créditos Cobrados */}
                        <div style={{
                            padding: '0.9rem',
                            borderRadius: '0.75rem',
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center',
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(59,130,246,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 0.4rem',
                                color: 'var(--primary-color)',
                            }}>
                                <Coins size={16} />
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-color)', lineHeight: 1 }}>
                                {report.estimated}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                Créditos Cobrados
                            </div>
                        </div>

                        {/* Páginas Geradas */}
                        <div style={{
                            padding: '0.9rem',
                            borderRadius: '0.75rem',
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center',
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(16,185,129,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 0.4rem',
                                color: 'var(--success)',
                            }}>
                                <FileText size={16} />
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>
                                {report.actual || '?'}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                Páginas no PDF
                            </div>
                        </div>

                        {/* Reembolso (condicional) */}
                        {report.refunded > 0 && (
                            <div style={{
                                gridColumn: '1 / -1',
                                padding: '0.9rem',
                                borderRadius: '0.75rem',
                                background: 'rgba(250,204,21,0.06)',
                                border: '1px solid rgba(250,204,21,0.2)',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: 'rgba(250,204,21,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 0.4rem',
                                    color: '#eab308',
                                }}>
                                    <RefreshCw size={16} />
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#eab308', lineHeight: 1 }}>
                                    +{report.refunded}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                    Créditos Devolvidos
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{
                        background: 'var(--surface-color)', padding: '0.9rem 1rem',
                        borderRadius: '0.6rem', border: '1px solid var(--border-color)',
                        marginBottom: '1rem', fontSize: '0.85rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Páginas do PDF:</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{report.actual} páginas</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.6rem', borderBottom: '1px dashed var(--border-color)', marginBottom: '0.6rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Custo Exato:</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{report.actual} créditos</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Meu Saldo:</span>
                            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{Math.floor(report.balanceAfter)} créditos</span>
                        </div>
                        {report.pdfHash && (
                            <div style={{
                                marginTop: '0.6rem',
                                paddingTop: '0.6rem',
                                borderTop: '1px dashed var(--border-color)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>SHA-256 do PDF:</span>
                                    <span
                                        title={report.pdfHash}
                                        style={{
                                            fontFamily: 'monospace',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-muted)',
                                            wordBreak: 'break-all',
                                            textAlign: 'right',
                                            cursor: 'help',
                                        }}
                                    >
                                        {report.pdfHash.slice(0, 14)}…{report.pdfHash.slice(-8)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Note about precision adjustment */}
                    <div style={{
                        padding: '0.6rem 0.85rem',
                        borderRadius: '0.6rem',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        fontSize: '0.78rem',
                        color: 'var(--primary-color)',
                        textAlign: 'center',
                        lineHeight: 1.45,
                    }}>
                        💡 O ajuste matemático já foi realizado na sua reserva. Você pagou exatamente pelas {report.actual} páginas do documento.
                    </div>
                </div>

                {/* Footer (Fixed & Always Accessible) */}
                <div className="modal-dialog-footer">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onClose}
                        style={{ flex: 1, justifyContent: 'center', minHeight: '40px' }}
                    >
                        Fechar
                    </button>
                    {report.pdfUrl ? (
                        <a
                            className="btn-gradient"
                            href={report.pdfUrl}
                            download={`legisvox_documento_${report.id || ''}.pdf`}
                            onClick={onClose}
                            style={{
                                flex: 2,
                                justifyContent: 'center',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                textDecoration: 'none',
                                minHeight: '40px',
                            }}
                        >
                            <FileText size={16} /> Baixar PDF
                        </a>
                    ) : (
                        <button
                            type="button"
                            className="btn-gradient"
                            onClick={onDownload}
                            autoFocus
                            style={{ flex: 2, justifyContent: 'center', minHeight: '40px' }}
                        >
                            <FileText size={16} /> Baixar PDF
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
