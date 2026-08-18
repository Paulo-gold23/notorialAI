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
        <div 
            className="modal-backdrop-responsive"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div 
                className="modal-dialog-responsive"
                style={{ maxWidth: '30rem' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-dialog-header">
                    <h3 style={{
                        margin: 0,
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        color: 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.35rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            background: 'var(--surface-color)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                        aria-label="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>
                {/* Body */}
                <div className="modal-dialog-body">
                    {children}
                </div>
            </div>
        </div>
    );
}
