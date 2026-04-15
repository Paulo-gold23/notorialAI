import React from 'react';

export default function LegalFooter({ style }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.375rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            width: '100%',
            padding: '0.625rem 0',
            ...style
        }}>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <a href="#/terms" className="hover:text-amber-500 transition-colors">Termos de Uso</a>
                <span>&bull;</span>
                <a href="#/privacy" className="hover:text-amber-500 transition-colors">Políticas de Privacidade</a>
            </div>
            <div style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                Software registrado no INPI sob o nº BR512026002376-9
            </div>
            <div style={{ opacity: 0.6, fontSize: '0.7rem' }}>
                &copy; {new Date().getFullYear()} LegisVox. Todos os direitos reservados.
            </div>
        </div>
    );
}
