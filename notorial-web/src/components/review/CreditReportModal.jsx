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
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out',
        }}>
            <div style={{
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '1rem',
                padding: '2rem',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                animation: 'slideUp 0.3s ease-out',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: '0.7rem',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
                            border: '1px solid rgba(59,130,246,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-color)', flexShrink: 0,
                        }}>
                            <Coins size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
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
                        }}
                        onMouseOver={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Stats Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                }}>
                    {/* Créditos Cobrados */}
                    <div style={{
                        padding: '1rem',
                        borderRadius: '0.75rem',
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'rgba(59,130,246,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 0.5rem',
                            color: 'var(--primary-color)',
                        }}>
                            <Coins size={18} />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-color)', lineHeight: 1 }}>
                            {report.estimated}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Créditos Cobrados
                        </div>
                    </div>

                    {/* Páginas Geradas */}
                    <div style={{
                        padding: '1rem',
                        borderRadius: '0.75rem',
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'rgba(16,185,129,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 0.5rem',
                            color: 'var(--success)',
                        }}>
                            <FileText size={18} />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>
                            {report.actual || '?'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Páginas no PDF
                        </div>
                    </div>

                    {/* Reembolso (condicional) */}
                    {report.refunded > 0 && (
                        <div style={{
                            gridColumn: 'span 2',
                            padding: '1rem',
                            borderRadius: '0.75rem',
                            background: 'rgba(250,204,21,0.06)',
                            border: '1px solid rgba(250,204,21,0.2)',
                            textAlign: 'center',
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(250,204,21,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 0.5rem',
                                color: '#eab308',
                            }}>
                                <RefreshCw size={18} />
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308', lineHeight: 1 }}>
                                +{report.refunded}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                Devolvidos
                            </div>
                        </div>
                    )}
                </div>

                <div style={{
                    background: 'var(--surface-color)', padding: '1rem',
                    borderRadius: '0.6rem', border: '1px solid var(--border-color)',
                    marginBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Páginas do PDF:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{report.actual} páginas</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px dashed var(--border-color)', marginBottom: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Custo Exato:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{report.actual} créditos</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Meu Saldo:</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{Math.floor(report.balanceAfter)} créditos</span>
                    </div>
                    {report.pdfHash && (
                        <div style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px dashed var(--border-color)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>SHA-256 do PDF:</span>
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
                                    {report.pdfHash.slice(0, 16)}…{report.pdfHash.slice(-8)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Note about precision adjustment */}
                <div style={{
                    padding: '0.6rem 1rem',
                    borderRadius: '0.6rem',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    fontSize: '0.8rem',
                    color: 'var(--primary-color)',
                    textAlign: 'center',
                    marginBottom: '1.25rem',
                }}>
                    💡 O ajuste matemático já foi realizado na sua reserva. Você pagou exatamente pelas {report.actual} páginas do documento.
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        className="btn-secondary"
                        onClick={onClose}
                        style={{ flex: 1, justifyContent: 'center' }}
                    >
                        Fechar
                    </button>
                    <button
                        className="btn-gradient"
                        onClick={onDownload}
                        autoFocus
                        style={{ flex: 2, justifyContent: 'center' }}
                    >
                        <FileText size={16} /> Baixar PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
