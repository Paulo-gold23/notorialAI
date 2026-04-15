import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="page-enter container-centered" style={{ paddingTop: '6rem', paddingBottom: '4rem', textAlign: 'center' }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}>
                        <AlertTriangle size={28} style={{ color: '#ef4444' }} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Algo deu errado
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
                        Ocorreu um erro inesperado na aplicação. Tente recarregar a página.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                        <button className="btn-gradient" onClick={this.handleRetry}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <RefreshCw size={16} /> Tentar Novamente
                        </button>
                        <button className="btn-secondary" onClick={() => window.location.href = '/'}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Home size={16} /> Voltar ao Início
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
