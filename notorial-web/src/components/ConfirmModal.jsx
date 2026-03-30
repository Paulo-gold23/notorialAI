import React from 'react';
import Modal from './Modal';

export default function ConfirmModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = 'Confirmar', 
    cancelText = 'Cancelar', 
    variant = 'danger' 
}) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p style={{ marginBottom: '1.5rem', marginTop: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                    onClick={onClose}
                    className="btn-secondary"
                >
                    {cancelText}
                </button>
                <button
                    onClick={onConfirm}
                    className={variant === 'danger' ? 'btn-primary' : 'btn-gradient'}
                    style={variant === 'danger' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}}
                >
                    {confirmText}
                </button>
            </div>
        </Modal>
    );
}
