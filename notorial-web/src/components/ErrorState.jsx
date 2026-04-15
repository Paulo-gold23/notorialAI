import React from 'react';
import {
    AlertTriangle, FileX, WifiOff, Clock, Cpu,
    RefreshCw, ArrowLeft, FileWarning, ShieldAlert
} from 'lucide-react';

const ERROR_CONFIG = {
    ZIP_INVALID: {
        icon: FileX,
        title: 'Arquivo Inválido',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.2)',
        canRetry: true,
    },
    ZIP_NO_CHAT: {
        icon: FileWarning,
        title: 'Conversa Não Encontrada',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.08)',
        border: 'rgba(245, 158, 11, 0.2)',
        canRetry: true,
    },
    DATE_FILTER_EMPTY: {
        icon: Clock,
        title: 'Período Sem Mensagens',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.08)',
        border: 'rgba(245, 158, 11, 0.2)',
        canRetry: true,
    },
    API_TIMEOUT: {
        icon: Clock,
        title: 'Tempo Esgotado',
        color: '#f97316',
        bg: 'rgba(249, 115, 22, 0.08)',
        border: 'rgba(249, 115, 22, 0.2)',
        canRetry: true,
    },
    API_RATE_LIMIT: {
        icon: ShieldAlert,
        title: 'Serviço Sobrecarregado',
        color: '#f97316',
        bg: 'rgba(249, 115, 22, 0.08)',
        border: 'rgba(249, 115, 22, 0.2)',
        canRetry: true,
    },
    AI_ERROR: {
        icon: Cpu,
        title: 'Falha na IA',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.2)',
        canRetry: true,
    },
    PDF_ERROR: {
        icon: FileX,
        title: 'Erro na Geração do PDF',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.2)',
        canRetry: false,
    },
    NETWORK: {
        icon: WifiOff,
        title: 'Sem Conexão',
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.08)',
        border: 'rgba(99, 102, 241, 0.2)',
        canRetry: true,
    },
    INTERNAL: {
        icon: AlertTriangle,
        title: 'Erro Interno',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.2)',
        canRetry: true,
    },
};

export default function ErrorState({
    category = 'INTERNAL',
    message,
    onRetry,
    onBack,
    compact = false,
}) {
    const config = ERROR_CONFIG[category] || ERROR_CONFIG.INTERNAL;
    const Icon = config.icon;

    if (compact) {
        return (
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '1rem 1.25rem',
                background: config.bg,
                border: `1px solid ${config.border}`,
                borderRadius: '0.75rem',
                animation: 'slideUp 0.3s ease-out',
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '0.5rem',
                    background: config.bg, border: `1px solid ${config.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Icon size={18} style={{ color: config.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: config.color, marginBottom: '0.25rem' }}>
                        {config.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {message}
                    </div>
                    {(onRetry && config.canRetry) && (
                        <button onClick={onRetry} className="btn-secondary" style={{
                            marginTop: '0.75rem', fontSize: '0.78rem', padding: '0.4rem 0.75rem',
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        }}>
                            <RefreshCw size={13} /> Tentar Novamente
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            textAlign: 'center',
            padding: '3rem 2rem',
            animation: 'slideUp 0.35s ease-out',
        }}>
            <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: config.bg, border: `1px solid ${config.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.5rem',
            }}>
                <Icon size={28} style={{ color: config.color }} />
            </div>
            <h3 style={{
                fontSize: '1.15rem', fontWeight: 700,
                color: 'var(--text-main)', marginBottom: '0.5rem',
            }}>
                {config.title}
            </h3>
            <p style={{
                color: 'var(--text-muted)', fontSize: '0.88rem',
                maxWidth: '420px', margin: '0 auto 1.75rem',
                lineHeight: 1.65,
            }}>
                {message}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(onRetry && config.canRetry) && (
                    <button onClick={onRetry} className="btn-gradient"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={16} /> Tentar Novamente
                    </button>
                )}
                {onBack && (
                    <button onClick={onBack} className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ArrowLeft size={16} /> Voltar
                    </button>
                )}
            </div>
        </div>
    );
}
