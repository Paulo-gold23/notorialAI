import React, { useState, useEffect, useRef } from 'react';
import { Shield, CheckCircle2, AlertCircle, Lock, X } from 'lucide-react';
import { getDeviceFingerprint } from '../services/fingerprint';
import { apiRequest } from '../services/api';
import { useToast } from '../components/ToastContext';

export default function SignaturePinPromptModal({ onSaved, isUpdate = false, onClose = null }) {
    const toast = useToast();
    const [currentPin, setCurrentPin] = useState(['', '', '', '']);
    const [pin, setPin] = useState(['', '', '', '']);
    const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // step: 'info' | 'current_pin' | 'new_pin' | 'confirm_pin' | 'saving' | 'done'
    const [step, setStep] = useState(isUpdate ? 'current_pin' : 'info');

    const currentRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
    const pinRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
    const confirmRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

    // Lock scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // Focus first input on mount or step change
    useEffect(() => {
        setTimeout(() => {
            if (step === 'current_pin') {
                currentRefs[0].current?.focus();
            } else if (step === 'new_pin') {
                pinRefs[0].current?.focus();
            } else if (step === 'confirm_pin') {
                confirmRefs[0].current?.focus();
            }
        }, 100);
    }, [step]);

    const handlePinChange = (index, value, targetMode) => {
        const cleanVal = value.replace(/\D/g, '').slice(-1);
        
        let currentArr, setArr, refs;
        if (targetMode === 'current') {
            currentArr = [...currentPin];
            setArr = setCurrentPin;
            refs = currentRefs;
        } else if (targetMode === 'new') {
            currentArr = [...pin];
            setArr = setPin;
            refs = pinRefs;
        } else {
            currentArr = [...confirmPin];
            setArr = setConfirmPin;
            refs = confirmRefs;
        }

        if (cleanVal) {
            currentArr[index] = cleanVal;
            setArr(currentArr);

            // Move to next input
            if (index < 3) {
                refs[index + 1].current?.focus();
            }
        }
    };

    const handleKeyDown = (index, e, targetMode) => {
        let currentArr, setArr, refs;
        if (targetMode === 'current') {
            currentArr = [...currentPin];
            setArr = setCurrentPin;
            refs = currentRefs;
        } else if (targetMode === 'new') {
            currentArr = [...pin];
            setArr = setPin;
            refs = pinRefs;
        } else {
            currentArr = [...confirmPin];
            setArr = setConfirmPin;
            refs = confirmRefs;
        }

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentArr[index]) {
                currentArr[index] = '';
                setArr(currentArr);
            } else if (index > 0) {
                // Focus previous and clear
                refs[index - 1].current?.focus();
                currentArr[index - 1] = '';
                setArr(currentArr);
            }
        }
    };

    const handlePaste = (e, targetMode) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (pasteData.length === 4) {
            const pinArray = pasteData.split('');
            if (targetMode === 'current') {
                setCurrentPin(pinArray);
                currentRefs[3].current?.focus();
            } else if (targetMode === 'new') {
                setPin(pinArray);
                pinRefs[3].current?.focus();
            } else {
                setConfirmPin(pinArray);
                confirmRefs[3].current?.focus();
            }
        }
    };

    // Validates current PIN against the backend BEFORE advancing to new_pin step.
    // This gives immediate feedback — wrong PIN = error right here, no UI advance.
    const handleContinueFromCurrent = async () => {
        if (currentPin.join('').length !== 4) {
            setError('Por favor, digite todos os 4 dígitos da senha atual.');
            return;
        }
        setError('');
        setLoading(true);

        try {
            const fingerprint = await getDeviceFingerprint();
            await apiRequest('/api/auth/signature-pin/verify', {
                method: 'POST',
                body: JSON.stringify({
                    pin: currentPin.join(''),
                    device_fingerprint: fingerprint,
                }),
            });
            // Verified ✓ — safe to advance
            setStep('new_pin');
        } catch (err) {
            setCurrentPin(['', '', '', '']);
            currentRefs[0].current?.focus();
            setError(err.message || 'PIN de confirmação atual incorreto.');
        } finally {
            setLoading(false);
        }
    };

    const handleContinueFromNew = () => {
        if (pin.join('').length !== 4) {
            setError('Por favor, preencha todos os 4 dígitos da nova senha.');
            return;
        }
        setError('');
        setStep('confirm_pin');
    };

    const handleBack = () => {
        setError('');
        if (step === 'confirm_pin') {
            setStep('new_pin');
            setConfirmPin(['', '', '', '']);
        } else if (step === 'new_pin' && isUpdate) {
            setStep('current_pin');
            setPin(['', '', '', '']);
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError('');

        const currentPinStr = currentPin.join('');
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

            const payload = {
                pin: pinStr,
                device_fingerprint: fingerprint,
            };
            if (isUpdate) {
                // current_pin already verified in handleContinueFromCurrent,
                // but sent again for the backend's double-check on save.
                payload.current_pin = currentPinStr;
            }

            await apiRequest('/api/auth/signature-pin/set', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            setStep('done');
            toast.success(
                isUpdate 
                    ? 'PIN de confirmação alterado com sucesso!' 
                    : 'PIN de confirmação cadastrado com sucesso!'
            );
            setTimeout(() => {
                onSaved();
            }, 1200);

        } catch (err) {
            setError(err.message || 'Erro ao salvar PIN de confirmação.');
            setStep(isUpdate ? 'current_pin' : 'new_pin');
            setPin(['', '', '', '']);
            setConfirmPin(['', '', '', '']);
            if (isUpdate) {
                setCurrentPin(['', '', '', '']);
            }
        } finally {
            setLoading(false);
        }
    };

    const isCurrentComplete = currentPin.every(d => d !== '');
    const isPinComplete = pin.every(d => d !== '');
    const isConfirmComplete = confirmPin.every(d => d !== '');

    const inputStyle = {
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
    };

    const handleInputFocus = (e) => {
        e.target.style.borderColor = 'var(--primary-color)';
        e.target.style.boxShadow = '0 0 0 2px var(--primary-glow)';
    };

    const handleInputBlur = (e) => {
        e.target.style.borderColor = 'var(--border-color)';
        e.target.style.boxShadow = 'none';
    };

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
                {/* Close Button (X) */}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                        }}
                        className="hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--text-main)]"
                        aria-label="Fechar modal"
                    >
                        <X size={18} />
                    </button>
                )}

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
                        {step === 'info'
                            ? 'O que é o PIN de Confirmação?'
                            : step === 'done' 
                                ? (isUpdate ? 'Senha Alterada!' : 'Senha Cadastrada!')
                                : step === 'current_pin'
                                    ? 'PIN de Confirmação Atual'
                                    : step === 'confirm_pin' 
                                        ? 'Confirme seu PIN de Confirmação' 
                                        : 'Novo PIN de Confirmação'
                        }
                    </h3>
                    <p style={{
                        margin: 0, fontSize: '0.82rem',
                        color: 'var(--text-muted)', lineHeight: 1.5,
                    }}>
                        {step === 'info' ? (
                            'Entenda como funciona esta medida de segurança para a sua atuação profissional.'
                        ) : step === 'done' ? (
                            isUpdate 
                                ? 'Seu novo PIN de confirmação e assinatura eletrônica foi configurado com sucesso.'
                                : 'Seu PIN de confirmação e assinatura eletrônica de 4 dígitos foi configurado.'
                        ) : step === 'current_pin' ? (
                            'Para prosseguir, digite seu PIN de confirmação de 4 dígitos atual.'
                        ) : step === 'confirm_pin' ? (
                            'Digite novamente a senha numérica de 4 dígitos para confirmar.'
                        ) : (
                            isUpdate 
                                ? 'Crie uma nova senha numérica de 4 dígitos para sua assinatura.'
                                : 'Crie uma senha numérica de 4 dígitos. Esta senha será exigida sempre que você salvar ou emitir documentos finalizados.'
                        )}
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '0.75rem 1.5rem 1.75rem' }}>
                    {step === 'info' ? (
                        <div style={{ animation: 'scaleIn 0.25s ease-out' }}>
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: '1rem',
                                color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.45,
                                marginBottom: '1.5rem', textAlign: 'left'
                            }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <div style={{
                                        background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)',
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, fontWeight: 'bold', fontSize: '0.75rem', marginTop: '2px'
                                    }}>1</div>
                                    <div>
                                        <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '1px' }}>Exclusiva do LegisVox</strong>
                                        <span>Esta é uma senha criada por você <strong>apenas para este aplicativo</strong>. Não é o PIN do chip do seu celular nem a senha de bloqueio do aparelho.</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <div style={{
                                        background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)',
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, fontWeight: 'bold', fontSize: '0.75rem', marginTop: '2px'
                                    }}>2</div>
                                    <div>
                                        <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '1px' }}>Confirmação & Emissão</strong>
                                        <span>Ela será exigida sempre que você salvar alterações, emitir relatórios ou gerar PDFs. Representa a sua conferência eletrônica sobre o documento.</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <div style={{
                                        background: 'rgba(59,130,246,0.1)', color: 'var(--primary-color)',
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, fontWeight: 'bold', fontSize: '0.75rem', marginTop: '2px'
                                    }}>3</div>
                                    <div>
                                        <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '1px' }}>Proteção contra Abuso</strong>
                                        <span>Errar a senha 5 vezes consecutivas bloqueia a assinatura por segurança, exigindo redefinição segura por e-mail.</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('new_pin')}
                                className="btn-gradient"
                                style={{ width: '100%', padding: '0.8rem', fontSize: '0.88rem', fontWeight: 600 }}
                            >
                                Entendi, Prosseguir para o Cadastro
                            </button>
                        </div>
                    ) : step === 'saving' || step === 'done' ? (
                        <div style={{
                            textAlign: 'center', padding: '0.5rem 0',
                            animation: 'scaleIn 0.3s ease-out',
                        }}>
                            <div className="sp-wave" style={{ width: 20, height: 20, margin: '0 auto' }} />
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                {step === 'saving' ? 'Salvando credenciais...' : 'Atualizando plataforma...'}
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
                                {step === 'current_pin' && (
                                    currentPin.map((digit, idx) => (
                                        <input
                                            key={`current-${idx}`}
                                            ref={currentRefs[idx]}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value, 'current')}
                                            onKeyDown={(e) => handleKeyDown(idx, e, 'current')}
                                            onPaste={(e) => handlePaste(e, 'current')}
                                            aria-label={`Dígito ${idx + 1} da senha atual`}
                                            style={inputStyle}
                                            onFocus={handleInputFocus}
                                            onBlur={handleInputBlur}
                                        />
                                    ))
                                )}
                                {step === 'new_pin' && (
                                    pin.map((digit, idx) => (
                                        <input
                                            key={`pin-${idx}`}
                                            ref={pinRefs[idx]}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value, 'new')}
                                            onKeyDown={(e) => handleKeyDown(idx, e, 'new')}
                                            onPaste={(e) => handlePaste(e, 'new')}
                                            aria-label={`Dígito ${idx + 1} da nova senha`}
                                            style={inputStyle}
                                            onFocus={handleInputFocus}
                                            onBlur={handleInputBlur}
                                        />
                                    ))
                                )}
                                {step === 'confirm_pin' && (
                                    confirmPin.map((digit, idx) => (
                                        <input
                                            key={`confirm-${idx}`}
                                            ref={confirmRefs[idx]}
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(idx, e.target.value, 'confirm')}
                                            onKeyDown={(e) => handleKeyDown(idx, e, 'confirm')}
                                            onPaste={(e) => handlePaste(e, 'confirm')}
                                            aria-label={`Dígito ${idx + 1} da confirmação da nova senha`}
                                            style={inputStyle}
                                            onFocus={handleInputFocus}
                                            onBlur={handleInputBlur}
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
                                    {step === 'current_pin' 
                                        ? 'Verifique sua identidade antes de criar novas credenciais de assinatura.'
                                        : 'Camada probatória criptografada e vinculada à trilha de auditoria.'
                                    }
                                </span>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {step === 'current_pin' && (
                                    <button
                                        type="button"
                                        onClick={handleContinueFromCurrent}
                                        disabled={!isCurrentComplete || loading}
                                        className="btn-gradient"
                                        style={{ width: '100%', padding: '0.8rem', fontSize: '0.88rem' }}
                                    >
                                        {loading ? (
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                <div className="sp-wave" style={{ width: 14, height: 14 }} /> Verificando...
                                            </span>
                                        ) : (
                                            'Confirmar Senha Atual'
                                        )}
                                    </button>
                                )}
                                {step === 'new_pin' && (
                                    <>
                                        {isUpdate && (
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="btn-secondary"
                                                style={{ flex: 1, padding: '0.8rem', fontSize: '0.88rem' }}
                                            >
                                                Voltar
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleContinueFromNew}
                                            disabled={!isPinComplete}
                                            className="btn-gradient"
                                            style={{ flex: isUpdate ? 2 : 1, width: isUpdate ? 'auto' : '100%', padding: '0.8rem', fontSize: '0.88rem' }}
                                        >
                                            Confirmar Nova Senha
                                        </button>
                                    </>
                                )}
                                {step === 'confirm_pin' && (
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
                                                    <div className="sp-wave" style={{ width: 14, height: 14 }} /> Alterando...
                                                </span>
                                            ) : (
                                                isUpdate ? 'Alterar PIN de Confirmação' : 'Confirmar e Cadastrar'
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
