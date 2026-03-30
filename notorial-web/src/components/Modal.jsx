import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
        }}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--backdrop-color, rgba(0,0,0,0.5))',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                }}
            />
            {/* Modal card */}
            <div style={{
                position: 'relative',
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.75rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                width: '100%',
                maxWidth: '28rem',
                overflow: 'hidden',
                animation: 'scaleIn 0.2s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        color: 'var(--text-main)',
                    }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.25rem',
                            border: 'none',
                            borderRadius: '0.375rem',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'color 0.15s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                        <X size={20} />
                    </button>
                </div>
                {/* Body */}
                <div style={{
                    padding: '1.5rem',
                    color: 'var(--text-main)',
                }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
