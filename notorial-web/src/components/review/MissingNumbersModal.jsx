import React, { useEffect } from 'react';
import { Phone, Check } from 'lucide-react';

const formatPhone = (val) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length <= 10) {
        return clean.replace(/^(\d{2})(\d{4})(\d{0,4})$/, (_, g1, g2, g3) => {
            return `(${g1}) ${g2}` + (g3 ? `-${g3}` : '');
        });
    }
    return clean.replace(/^(\d{2})(\d{5})(\d{0,4})$/, (_, g1, g2, g3) => {
        return `(${g1}) ${g2}` + (g3 ? `-${g3}` : '');
    });
};

export default function MissingNumbersModal({ isOpen, matches, onMatchesChange, onClose, onConfirm }) {
    // Lock scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div 
            className="modal-backdrop-responsive"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div 
                className="modal-dialog-responsive"
                style={{ maxWidth: '520px' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-dialog-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: '0.6rem',
                            background: 'var(--primary-glow)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-color)', flexShrink: 0,
                        }}>
                            <Phone size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Preencher Números Faltantes
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Insira os dados dos participantes pendentes
                            </p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="modal-dialog-body">
                    <div style={{ 
                        display: 'flex', flexDirection: 'column', gap: '0.85rem'
                    }}>
                        {matches.map((match, index) => (
                            <div key={index} style={{
                                background: 'var(--surface-color)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.6rem',
                                padding: '0.85rem 1rem',
                            }}>
                                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)' }}>
                                    {match.name}
                                </label>
                                <input
                                    type="text"
                                    placeholder="(00) 00000-0000"
                                    maxLength="15"
                                    value={match.value}
                                    onChange={(e) => {
                                        const newMatches = [...matches];
                                        newMatches[index].value = formatPhone(e.target.value);
                                        onMatchesChange(newMatches);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 0.75rem',
                                        background: 'var(--panel-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.4rem',
                                        color: 'var(--text-main)',
                                        fontSize: '0.88rem',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-dialog-footer">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onClose}
                        style={{ minHeight: '40px' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="btn-gradient"
                        onClick={onConfirm}
                        style={{ minHeight: '40px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Check size={16} /> Confirmar Substituição
                    </button>
                </div>
            </div>
        </div>
    );
}
