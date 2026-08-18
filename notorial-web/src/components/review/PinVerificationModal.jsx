import React, { useState, useEffect } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { getDeviceFingerprint } from '../../services/fingerprint';
import { apiRequest } from '../../services/api';

export default function PinVerificationModal({ 
    isOpen, 
    onClose, 
    onSuccess, 
    onForgotPin, 
    isPinBlocked, 
    setIsPinBlocked 
}) {
    const [pinInput, setPinInput] = useState(['', '', '', '']);
    const [pinError, setPinError] = useState('');
    const [verifyingPin, setVerifyingPin] = useState(false);

    // Lock and unlock body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPinInput(['', '', '', '']);
            setPinError('');
            setVerifyingPin(false);
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePinVerifySubmit = async (e) => {
        if (e) e.preventDefault();
        setVerifyingPin(true);
        setPinError('');
        try {
            const fingerprint = await getDeviceFingerprint();
            const rawPin = pinInput.join('');
            
            if (rawPin.length !== 4) {
                setPinError('A senha de assinatura deve ter 4 dígitos.');
                setVerifyingPin(false);
                return;
            }

            await apiRequest('/api/auth/signature-pin/verify', {
                method: 'POST',
                body: JSON.stringify({
                    pin: rawPin,
                    device_fingerprint: fingerprint
                })
            });

            // If success, call onSuccess callback
            onSuccess();
        } catch (err) {
            setPinError(err.message || 'Senha de assinatura incorreta.');
            setPinInput(['', '', '', '']);
            if (err.message && err.message.includes('bloqueada')) {
                setIsPinBlocked(true);
            }
        } finally {
            setVerifyingPin(false);
        }
    };

    return (
        <div 
            className="modal-backdrop-responsive"
            onClick={(e) => {
                if (e.target === e.currentTarget && !verifyingPin) onClose();
            }}
        >
            <div 
                className="modal-dialog-responsive"
                style={{ maxWidth: '420px' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-dialog-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: '0.6rem',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))',
                            border: '1px solid rgba(59,130,246,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-color)', flexShrink: 0,
                        }}>
                            <Lock size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Assinatura Eletrônica
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Confirme com sua senha de 4 dígitos
                            </p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="modal-dialog-body">
                    {isPinBlocked ? (
                        <div>
                            <div style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: '0.5rem',
                                padding: '0.75rem 1rem',
                                color: 'var(--danger, #ef4444)',
                                fontSize: '0.82rem',
                                lineHeight: 1.45,
                                marginBottom: '1.25rem',
                            }}>
                                ⚠️ Sua senha de assinatura está bloqueada por excesso de tentativas incorretas. Por favor, redefina-a por e-mail para continuar.
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={onClose}
                                    style={{ flex: 1, minHeight: '40px', justifyContent: 'center' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className="btn-gradient"
                                    onClick={onForgotPin}
                                    style={{ flex: 2, minHeight: '40px', justifyContent: 'center' }}
                                >
                                    Redefinir por E-mail
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handlePinVerifySubmit}>
                            {pinError && (
                                <div style={{
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: '0.5rem',
                                    padding: '0.625rem 0.75rem',
                                    marginBottom: '1rem',
                                    color: 'var(--danger, #ef4444)',
                                    fontSize: '0.8rem',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    lineHeight: 1.4,
                                }}>
                                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                    {pinError}
                                </div>
                            )}

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)', textAlign: 'center' }}>
                                    Digite os 4 dígitos da sua senha
                                </label>
                                <div style={{ display: 'flex', gap: 'clamp(0.4rem, 2vw, 0.75rem)', justifyContent: 'center' }}>
                                    {pinInput.map((digit, idx) => (
                                        <input
                                            key={`verify-pin-${idx}`}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            disabled={verifyingPin}
                                            onChange={(e) => {
                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(-1);
                                                const newPin = [...pinInput];
                                                if (cleanVal) {
                                                    newPin[idx] = cleanVal;
                                                    setPinInput(newPin);
                                                    // Auto focus next input
                                                    if (idx < 3) {
                                                        const nextInput = e.target.nextElementSibling;
                                                        if (nextInput) nextInput.focus();
                                                    }
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace') {
                                                    e.preventDefault();
                                                    const newPin = [...pinInput];
                                                    if (newPin[idx]) {
                                                        newPin[idx] = '';
                                                        setPinInput(newPin);
                                                    } else if (idx > 0) {
                                                        const prevInput = e.target.previousElementSibling;
                                                        if (prevInput) {
                                                            prevInput.focus();
                                                            newPin[idx - 1] = '';
                                                            setPinInput(newPin);
                                                        }
                                                    }
                                                }
                                            }}
                                            style={{
                                                width: 'clamp(2.5rem, 11vw, 3.25rem)',
                                                height: 'clamp(2.5rem, 11vw, 3.25rem)',
                                                textAlign: 'center',
                                                fontSize: '1.4rem',
                                                fontWeight: 'bold',
                                                background: 'var(--surface-color, #1e293b)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '0.45rem',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                transition: 'all 0.15s ease-out',
                                            }}
                                            onFocus={(e) => { e.target.style.borderColor = 'var(--primary-color)'; e.target.style.boxShadow = '0 0 0 2px var(--primary-glow)'; }}
                                            onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={onForgotPin}
                                    className="btn-ghost text-xs"
                                    style={{ color: 'var(--text-muted)', textDecoration: 'underline', padding: '0.4rem 0' }}
                                >
                                    Esqueci minha senha
                                </button>
                                <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="btn-secondary"
                                        disabled={verifyingPin}
                                        style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', minHeight: '38px' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn-gradient"
                                        disabled={verifyingPin || pinInput.some(d => d === '')}
                                        style={{ padding: '0.5rem 1.1rem', fontSize: '0.82rem', minHeight: '38px' }}
                                    >
                                        {verifyingPin ? 'Verificando...' : 'Assinar Documento'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
