import React, { useState, useEffect, useRef } from 'react';
import { Mail, Shield, CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { getDeviceFingerprint } from '../services/fingerprint';
import { apiRequest } from '../services/api';
import { useToast } from './ToastContext';

export default function ResetSignaturePinModal({ onClose, onSuccess }) {
    const toast = useToast();
    const [emailSent, setEmailSent] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [token, setToken] = useState(['', '', '', '', '', '']);
    const [newPin, setNewPin] = useState(['', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('request'); // 'request' | 'verify' | 'done'
    const [showPin, setShowPin] = useState(false);

    const tokenRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];
    const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

    // Lock scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // Automatically request verification token on mount
    useEffect(() => {
        sendResetEmail();
    }, []);

    const sendResetEmail = async () => {
        setSendingEmail(true);
        setError('');
        try {
            const fingerprint = await getDeviceFingerprint();
            const data = await apiRequest('/api/auth/signature-pin/forgot', {
                method: 'POST',
                body: JSON.stringify({ device_fingerprint: fingerprint })
            });
            
            setEmailSent(true);
            setStep('verify');
            toast.success('Código de redefinição enviado para seu e-mail!');
            
            // Focus first token field
            setTimeout(() => {
                tokenRefs[0].current?.focus();
            }, 150);


        } catch (err) {
            setError(err.message || 'Erro ao enviar código de redefinição.');
        } finally {
            setSendingEmail(false);
        }
    };

    const handleTokenChange = (index, value) => {
        const cleanVal = value.replace(/\D/g, '').slice(-1);
        const currentToken = [...token];

        if (cleanVal) {
            currentToken[index] = cleanVal;
            setToken(currentToken);

            if (index < 5) {
                tokenRefs[index + 1].current?.focus();
            }
        }
    };

    const handleTokenKeyDown = (index, e) => {
        const currentToken = [...token];
        if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentToken[index]) {
                currentToken[index] = '';
                setToken(currentToken);
            } else if (index > 0) {
                tokenRefs[index - 1].current?.focus();
                currentToken[index - 1] = '';
                setToken(currentToken);
            }
        }
    };

    const handlePinChange = (index, value) => {
        const cleanVal = value.replace(/\D/g, '').slice(-1);
        const currentPin = [...newPin];

        if (cleanVal) {
            currentPin[index] = cleanVal;
            setNewPin(currentPin);

            if (index < 3) {
                pinRefs[index + 1].current?.focus();
            }
        }
    };

    const handlePinKeyDown = (index, e) => {
        const currentPin = [...newPin];

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentPin[index]) {
                currentPin[index] = '';
                setNewPin(currentPin);
            } else if (index > 0) {
                pinRefs[index - 1].current?.focus();
                currentPin[index - 1] = '';
                setNewPin(currentPin);
            }
        }
    };

    const handlePasteToken = (e) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasteData.length === 6) {
            setToken(pasteData.split(''));
            tokenRefs[5].current?.focus();
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError('');

        const tokenStr = token.join('');
        const pinStr = newPin.join('');

        if (tokenStr.length !== 6) {
            setError('Digite o código de 6 dígitos recebido por e-mail.');
            return;
        }

        if (pinStr.length !== 4) {
            setError('Sua nova senha deve ter 4 dígitos.');
            return;
        }

        setLoading(true);

        try {
            const fingerprint = await getDeviceFingerprint();

            await apiRequest('/api/auth/signature-pin/reset', {
                method: 'POST',
                body: JSON.stringify({
                    token: tokenStr,
                    new_pin: pinStr,
                    device_fingerprint: fingerprint
                }),
            });

            setStep('done');
            toast.success('PIN de confirmação redefinido com sucesso!');
            setTimeout(() => {
                onSuccess();
            }, 1200);

        } catch (err) {
            setError(err.message || 'Código de verificação incorreto ou expirado.');
        } finally {
            setLoading(false);
        }
    };

    const isTokenComplete = token.every(d => d !== '');
    const isPinComplete = newPin.every(d => d !== '');

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }} />

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
                <div style={{ padding: '1.75rem 1.5rem 0.75rem', textAlign: 'center' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03))',
                        border: '1px solid rgba(245,158,11,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 0.75rem',
                        color: 'var(--accent-color, #f59e0b)'
                    }}>
                        {step === 'done'
                            ? <CheckCircle2 size={24} style={{ color: 'var(--success-color, #10b981)' }} />
                            : <Mail size={24} />
                        }
                    </div>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {step === 'done' ? 'Redefinição Concluída!' : 'Recuperar PIN de Confirmação'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {step === 'done' 
                            ? 'Seu novo PIN de confirmação e assinatura eletrônica já está ativo.'
                            : sendingEmail 
                                ? 'Enviando código de segurança para o seu e-mail cadastrado...'
                                : 'Digite o código de 6 dígitos enviado ao seu e-mail e configure sua nova senha de 4 dígitos.'
                        }
                    </p>
                </div>

                <div style={{ padding: '0.75rem 1.5rem 1.75rem' }}>
                    {sendingEmail && (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <div className="sp-wave" style={{ width: 24, height: 24, margin: '0 auto' }} />
                        </div>
                    )}

                    {!sendingEmail && step === 'done' && (
                        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                            <div className="sp-wave" style={{ width: 20, height: 20, margin: '0 auto' }} />
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Atualizando credenciais...
                            </p>
                        </div>
                    )}

                    {!sendingEmail && step !== 'done' && (
                        <form onSubmit={handleSubmit}>
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

                            {/* Token Code Inputs */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    Código de Verificação (E-mail)
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                    {token.map((digit, idx) => (
                                        <input
                                            key={`token-${idx}`}
                                            ref={tokenRefs[idx]}
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleTokenChange(idx, e.target.value)}
                                            onKeyDown={(e) => handleTokenKeyDown(idx, e)}
                                            onPaste={handlePasteToken}
                                            style={{
                                                width: '2.5rem',
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

                            {/* New PIN inputs */}
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    Novo PIN de Confirmação (4 dígitos)
                                </label>
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                    {newPin.map((digit, idx) => (
                                        <input
                                            key={`newpin-${idx}`}
                                            ref={pinRefs[idx]}
                                            type={showPin ? "text" : "password"}
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value)}
                                            onKeyDown={(e) => handlePinKeyDown(idx, e)}
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
                                {/* Eye Toggle */}
                                <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowPin(!showPin)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.75rem',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.375rem',
                                            transition: 'all 0.15s ease',
                                        }}
                                        className="hover:bg-black/5 dark:hover:bg-white/5"
                                        aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                                    >
                                        {showPin ? <EyeOff size={12} /> : <Eye size={12} />}
                                        {showPin ? 'Ocultar' : 'Mostrar'}
                                    </button>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                                background: 'rgba(59,130,246,0.05)',
                                border: '1px solid rgba(59,130,246,0.1)',
                                marginBottom: '1.5rem',
                            }}>
                                <Shield size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Esta ação será registrada nos logs de segurança do LegisVox.
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                <button
                                    type="button"
                                    onClick={sendResetEmail}
                                    className="btn-ghost text-xs"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}
                                    title="Reenviar e-mail de código"
                                >
                                    <RefreshCw size={12} /> Reenviar Código
                                </button>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={loading}
                                        className="btn-secondary"
                                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading || !isTokenComplete || !isPinComplete}
                                        className="btn-gradient"
                                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                                    >
                                        {loading ? 'Redefinindo...' : 'Redefinir Senha'}
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
