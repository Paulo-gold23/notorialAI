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
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out',
        }}>
            <div style={{
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '1rem',
                padding: '2rem',
                maxWidth: '500px',
                width: '100%',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                animation: 'slideUp 0.25s ease-out',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '0.6rem',
                        background: 'var(--primary-glow)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--primary-color)', flexShrink: 0,
                    }}>
                        <Phone size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            Preencher Números Faltantes
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Insira os dados dos participantes pendentes
                        </p>
                    </div>
                </div>

                <div style={{ 
                    maxHeight: '350px', overflowY: 'auto', 
                    paddingRight: '0.5rem', marginBottom: '1.5rem',
                    display: 'flex', flexDirection: 'column', gap: '1rem'
                }}>
                    {matches.map((match, index) => (
                        <div key={index} style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.6rem',
                            padding: '1rem',
                        }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
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
                                    padding: '0.6rem 0.8rem',
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.4rem',
                                    color: 'var(--text-main)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                            />
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                        className="btn-secondary"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="btn-gradient"
                        onClick={onConfirm}
                    >
                        <Check size={16} /> Confirmar Substituição
                    </button>
                </div>
            </div>
        </div>
    );
}
