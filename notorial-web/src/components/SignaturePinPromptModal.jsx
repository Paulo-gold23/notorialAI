import React, { useState, useEffect, useRef } from 'react';
import { Shield, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { getDeviceFingerprint } from '../services/fingerprint';
import { apiRequest } from '../services/api';
import { useToast } from '../components/ToastContext';

export default function SignaturePinPromptModal({ onSaved }) {
    const toast = useToast();
    const [pin, setPin] = useState(['', '', '', '']);
    const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
    const [isConfirming, setIsConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('input'); // 'input' | 'saving' | 'done'

    const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
    const confirmRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

    // Lock scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // Focus first input on mount or step change
    useEffect(() => {
        if (step === 'input') {
            setTimeout(() => {
                if (isConfirming) {
                    confirmRefs[0].current?.focus();
                } else {
                    pinRefs[0].current?.focus();
                }
            }, 100);
        }
    }, [isConfirming, step]);

    const handlePinChange = (index, value, isConfirmMode) => {
        const cleanVal = value.replace(/\D/g, '').slice(-1);
        const currentPin = isConfirmMode ? [...confirmPin] : [...pin];
        const currentRefs = isConfirmMode ? confirmRefs : pinRefs;

        if (cleanVal) {
            currentPin[index] = cleanVal;
            if (isConfirmMode) {
                setConfirmPin(currentPin);
            } else {
                setPin(currentPin);
            }

            // Move to next input
            if (index < 3) {
                currentRefs[index + 1].current?.focus();
            }
        }
    };

    const handleKeyDown = (index, e, isConfirmMode) => {
        const currentPin = isConfirmMode ? [...confirmPin] : [...pin];
        const currentRefs = isConfirmMode ? confirmRefs : pinRefs;

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentPin[index]) {
                currentPin[index] = '';
                if (isConfirmMode) {
                    setConfirmPin(currentPin);
                } else {
                    setPin(currentPin);
                }
            } else if (index > 0) {
                // Focus previous and clear
                currentRefs[index - 1].current?.focus();
                currentPin[index - 1] = '';
                if (isConfirmMode) {
                    setConfirmPin(currentPin);
                } else {
                    setPin(currentPin);
                }
            }
        }
    };

    const handlePaste = (e, isConfirmMode) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (pasteData.length === 4) {
            const pinArray = pasteData.split('');
            if (isConfirmMode) {
                setConfirmPin(pinArray);
                confirmRefs[3].current?.focus();
            } else {
                setPin(pinArray);
                pinRefs[3].current?.focus();
            }
        }
    };

    const handleContinue = () => {
        const enteredPin = pin.join('');
        if (enteredPin.length !== 4) {
            setError('Por favor, preencha todos os 4 dígitos.');
            return;
        }
        setError('');
        setIsConfirming(true);
    };

    const handleBack = () => {
        setIsConfirming(false);
        setConfirmPin(['', '', '', '']);
        setError('');
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError('');

        const pinStr = pin.join('');
        const confirmPinStr = confirmPin.join('');

        if (pinStr !== confirmPinStr) {
            setError('As senhas não coincidem. Tente novamente.');
            setConfirmPin(['', '', '', '']);
            confirmRefs[0].current?.focus();
            return;
        }

        setLoading(true);
        setStep('saving');

        try {
            const fingerprint = await getDeviceFingerprint();

            await apiRequest('/api/auth/signature-pin/set', {
                method: 'POST',
                body: JSON.stringify({
                    pin: pinStr,
                    device_fingerprint: fingerprint,
                }),
            });

            setStep('done');
            toast.success('Senha de assinatura cadastrada com sucesso!');
            setTimeout(() => {
                onSaved();
            }, 1200);

        } catch (err) {
            setError(err.message || 'Erro ao salvar senha de assinatura.');
            setStep('input');
            setIsConfirming(false);
            setPin(['', '', '', '']);
            setConfirmPin(['', '', '', '']);
        } finally {
            setLoading(false);
        }
    };

    const isPinComplete = pin.every(d => d !== '');
    const isConfirmComplete = confirmPin.every(d => d !== '');

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            {/* Backdrop */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }} />

            {/* Modal Card */}
            <div style={{
                position: 'relative',
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.875rem',
                boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
                width: '100%',
                maxWidth: '26rem',
                overflow: 'hidden',
                animation: 'scaleIn 0.3s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.75rem 1.5rem 0.75rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))',
                        border: '1px solid rgba(59,130,246,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 0.75rem',
                    }}>
                        {step === 'done'
                            ? <CheckCircle2 size={24} style={{ color: 'var(--success-color, #10b981)' }} />
                            : <Lock size={24} style={{ color: 'var(--primary-color)' }} />
                        }
                    </div>
                    <h3 style={{
                        margin: '0 0 0.25rem', fontSize: '1.2rem',
                        fontWeight: 700, color: 'var(--text-main)',
                    }}>
                        {step === 'done' 
                            ? 'Senha Cadastrada!' 
                            : isConfirming 
                                ? 'Confirme sua Senha de Assinatura' 
                                : 'Nova Senha de Assinatura'
                        }
                    </h3>
                    <p style={{
                        margin: 0, fontSize: '0.82rem',
                        color: 'var(--text-muted)', lineHeight: 1.5,
                    }}>
                        {step === 'done' ? (
                            'Sua senha de assinatura eletrônica de 4 dígitos foi configurada.'
                        ) : isConfirming ? (
                            'Digite novamente a senha numérica de 4 dígitos para confirmar.'
                        ) : (
                            'Crie uma senha numérica de 4 dígitos. Esta senha será exigida sempre que você salvar ou emitir documentos finalizados.'
                        )}
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '0.75rem 1.5rem 1.75rem' }}>
                    {step === 'done' ? (
                        <div style={{
                            textAlign: 'center', padding: '0.5rem 0',
                            animation: 'scaleIn 0.3s ease-out',
                        }}>
                            <div className="sp-wave" style={{ width: 20, height: 20, margin: '0 auto' }} />
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Inicializando plataforma...
                            </p>
                        </div>
                    ) : (
                        <div>
                            {/* Error */}
                            {error && (
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
                                    animation: 'slideUp 0.2s ease-out',
                                }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    {error}
                                </div>
                            )}

                            {/* Inputs Container */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                gap: '1rem',
                                margin: '1.25rem 0 1.75rem',
                            }}>
                                {!isConfirming ? (
                                    pin.map((digit, idx) => (
                                        <input
                                            key={`pin-${idx}`}
                                            ref={pinRefs[idx]}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value, false)}
                                            onKeyDown={(e) => handleKeyDown(idx, e, false)}
                                            onPaste={(e) => handlePaste(e, false)}
                                            aria-label={`Dígito ${idx + 1} da senha de assinatura`}
                                            style={{
                                                width: '3.5rem',
                                                height: '3.5rem',
                                                textAlign: 'center',
                                                fontSize: '1.75rem',
                                                fontWeight: 'bold',
                                                background: 'var(--surface-color, #1e293b)',
                                                border: '2px solid var(--border-color)',
                                                borderRadius: '0.6rem',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                transition: 'all 0.15s ease-out',
                                            }}
                                            onFocus={(e) => { e.target.style.borderColor = 'var(--primary-color)'; e.target.style.boxShadow = '0 0 0 2px var(--primary-glow)'; }}
                                            onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                                        />
                                    ))
                                ) : (
                                    confirmPin.map((digit, idx) => (
                                        <input
                                            key={`confirm-${idx}`}
                                            ref={confirmRefs[idx]}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value, true)}
                                            onKeyDown={(e) => handleKeyDown(idx, e, true)}
                                            onPaste={(e) => handlePaste(e, true)}
                                            aria-label={`Dígito ${idx + 1} da confirmação da senha de assinatura`}
                                            style={{
                                                width: '3.5rem',
                                                height: '3.5rem',
                                                textAlign: 'center',
                                                fontSize: '1.75rem',
                                                fontWeight: 'bold',
                                                background: 'var(--surface-color, #1e293b)',
                                                border: '2px solid var(--border-color)',
                                                borderRadius: '0.6rem',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                transition: 'all 0.15s ease-out',
                                            }}
                                            onFocus={(e) => { e.target.style.borderColor = 'var(--primary-color)'; e.target.style.boxShadow = '0 0 0 2px var(--primary-glow)'; }}
                                            onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                                        />
                                    ))
                                )}
                            </div>

                            {/* Security Badge */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                                background: 'rgba(59,130,246,0.05)',
                                border: '1px solid rgba(59,130,246,0.1)',
                                marginBottom: '1.5rem',
                            }}>
                                <Shield size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Camada probatória criptografada e vinculada à trilha de auditoria.
                                </span>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {isConfirming ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleBack}
                                            disabled={loading}
                                            className="btn-secondary"
                                            style={{ flex: 1, padding: '0.8rem', fontSize: '0.88rem' }}
                                        >
                                            Voltar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={loading || !isConfirmComplete}
                                            className="btn-gradient"
                                            style={{ flex: 2, padding: '0.8rem', fontSize: '0.88rem' }}
                                        >
                                            {loading ? (
                                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                    <div className="sp-wave" style={{ width: 14, height: 14 }} /> Cadastrando...
                                                </span>
                                            ) : (
                                                'Confirmar e Cadastrar'
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleContinue}
                                        disabled={!isPinComplete}
                                        className="btn-gradient"
                                        style={{ width: '100%', padding: '0.8rem', fontSize: '0.88rem' }}
                                    >
                                        Avançar para Confirmação
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
