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
                setPinError('O PIN deve ter 4 dígitos.');
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
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                animation: 'slideUp 0.25s ease-out',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '0.6rem',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))',
                        border: '1px solid rgba(59,130,246,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--primary-color)', flexShrink: 0,
                    }}>
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Assinatura Eletrônica
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Confirme sua identidade com seu PIN
                        </p>
                    </div>
                </div>

                {isPinBlocked ? (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '0.5rem',
                            padding: '0.75rem 1rem',
                            color: 'var(--danger, #ef4444)',
                            fontSize: '0.82rem',
                            lineHeight: 1.4,
                            marginBottom: '1rem',
                        }}>
                            ⚠️ Sua senha de assinatura está bloqueada por excesso de tentativas incorretas. Por favor, redefina-a por e-mail para continuar.
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                className="btn-secondary"
                                onClick={onClose}
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-gradient"
                                onClick={onForgotPin}
                                style={{ flex: 2 }}
                            >
                                Redefinir PIN por E-mail
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
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
                                PIN de 4 dígitos
                            </label>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
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
                                            width: '3rem',
                                            height: '3rem',
                                            textAlign: 'center',
                                            fontSize: '1.5rem',
                                            fontWeight: 'bold',
                                            background: 'var(--surface-color, #1e293b)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '0.4rem',
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

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={onForgotPin}
                                className="btn-ghost text-xs"
                                style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
                            >
                                Esqueci meu PIN
                            </button>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="btn-secondary"
                                    disabled={verifyingPin}
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn-gradient"
                                    disabled={verifyingPin || pinInput.some(d => d === '')}
                                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                                >
                                    {verifyingPin ? 'Verificando...' : 'Assinar Documento'}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
