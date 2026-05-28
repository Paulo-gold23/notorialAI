import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CheckCircle2, AlertCircle, Fingerprint } from 'lucide-react';
import { hashCpfCnpj, getDeviceFingerprint } from '../services/fingerprint';
import { apiRequest } from '../services/api';

export default function CPFPromptModal({ onSaved, userEmail }) {
    const navigate = useNavigate();
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('input'); // 'input' | 'saving' | 'done'

    // Lock scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    // ── CPF/CNPJ formatting ─────────────────────────────────────────────
    const formatCpfCnpj = (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 14);
        if (digits.length <= 11) {
            return digits
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        } else {
            return digits
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
        }
    };

    const handleChange = (e) => setCpfCnpj(formatCpfCnpj(e.target.value));
    const getRawDigits = () => cpfCnpj.replace(/\D/g, '');

    // ── Local validation (same algorithm as Login.jsx) ──────────────────
    const isValidCpf = (cpf) => {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        for (let t = 9; t < 11; t++) {
            let d = 0;
            for (let c = 0; c < t; c++) d += parseInt(cpf[c]) * ((t + 1) - c);
            d = ((10 * d) % 11) % 10;
            if (parseInt(cpf[t]) !== d) return false;
        }
        return true;
    };

    const isValidCnpj = (cnpj) => {
        cnpj = cnpj.replace(/\D/g, '');
        if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
        let tamanho = 12, numeros = cnpj.substring(0, tamanho);
        const digitos = cnpj.substring(tamanho);
        let soma = 0, pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
        let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(0)) return false;
        tamanho = 13; numeros = cnpj.substring(0, tamanho); soma = 0; pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
        resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        return resultado == digitos.charAt(1);
    };

    // ── Submit handler ──────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const raw = getRawDigits();

        // Local validation first
        if (raw.length === 11 && !isValidCpf(raw)) {
            setError('CPF inválido. Verifique os dígitos.'); return;
        }
        if (raw.length === 14 && !isValidCnpj(raw)) {
            setError('CNPJ inválido. Verifique os dígitos.'); return;
        }
        if (raw.length !== 11 && raw.length !== 14) {
            setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'); return;
        }

        setLoading(true);
        setStep('saving');

        try {
            // 1. Check availability via backend
            const checkResult = await apiRequest('/api/auth/check-cpf', {
                method: 'POST',
                body: JSON.stringify({ cpf_cnpj: raw }),
            });

            if (!checkResult.valid) {
                setError(checkResult.reason || 'CPF/CNPJ inválido.');
                setStep('input');
                return;
            }
            if (!checkResult.available) {
                setError(checkResult.reason || 'Este CPF/CNPJ já está em uso.');
                setStep('input');
                return;
            }

            // 2. Get device fingerprint
            const fingerprint = await getDeviceFingerprint();

            // 3. Save CPF (backend hashes it again with SHA-256)
            await apiRequest('/api/auth/save-cpf', {
                method: 'POST',
                body: JSON.stringify({
                    cpf_cnpj: raw,
                    device_fingerprint: fingerprint,
                }),
            });

            setStep('done');
            // Brief success animation, then dismiss and redirect
            setTimeout(() => {
                onSaved();
                navigate('/dashboard');
            }, 1200);

        } catch (err) {
            setError(err.message || 'Erro ao salvar CPF/CNPJ.');
            setStep('input');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            {/* Backdrop — NOT clickable (modal is mandatory) */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }} />

            {/* Modal card */}
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
                    padding: '1.5rem 1.5rem 0.75rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
                        border: '1px solid rgba(59,130,246,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 0.75rem',
                    }}>
                        {step === 'done'
                            ? <CheckCircle2 size={24} style={{ color: 'var(--success-color)' }} />
                            : <Fingerprint size={24} style={{ color: 'var(--primary-color)' }} />
                        }
                    </div>
                    <h3 style={{
                        margin: '0 0 0.25rem', fontSize: '1.15rem',
                        fontWeight: 700, color: 'var(--text-main)',
                    }}>
                        {step === 'done' ? 'CPF Verificado!' : 'Verificação de Identidade'}
                    </h3>
                    <p style={{
                        margin: 0, fontSize: '0.82rem',
                        color: 'var(--text-muted)', lineHeight: 1.5,
                    }}>
                        {step === 'done' ? (
                            'Seu documento foi vinculado com sucesso.'
                        ) : (
                            <>
                                {userEmail && (
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '0.25rem 0.625rem',
                                        borderRadius: '1rem',
                                        background: 'rgba(59,130,246,0.08)',
                                        border: '1px solid rgba(59,130,246,0.15)',
                                        color: 'var(--primary-color)',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        marginBottom: '0.75rem',
                                    }}>
                                        {userEmail}
                                    </div>
                                )}
                                <div style={{ color: 'var(--text-muted)' }}>
                                    Para sua segurança, informe seu CPF ou CNPJ para continuar usando a plataforma.
                                </div>
                            </>
                        )}
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
                    {step === 'done' ? (
                        <div style={{
                            textAlign: 'center', padding: '0.5rem 0',
                            animation: 'scaleIn 0.3s ease-out',
                        }}>
                            <div className="sp-wave" style={{ width: 20, height: 20, margin: '0 auto' }} />
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Redirecionando...
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {/* Error */}
                            {error && (
                                <div style={{
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    borderRadius: '0.5rem',
                                    padding: '0.625rem 0.75rem',
                                    marginBottom: '0.875rem',
                                    color: 'var(--danger)',
                                    fontSize: '0.8rem',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    lineHeight: 1.4,
                                    animation: 'slideUp 0.2s ease-out',
                                }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    {error}
                                </div>
                            )}

                            {/* Input */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{
                                    display: 'block', marginBottom: '0.35rem',
                                    fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500,
                                }}>
                                    CPF ou CNPJ <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={cpfCnpj}
                                    onChange={handleChange}
                                    placeholder="000.000.000-00"
                                    maxLength={18}
                                    required
                                    autoFocus
                                    disabled={loading}
                                    className="input-login"
                                    style={{ width: '100%' }}
                                />
                                <p style={{
                                    fontSize: '0.7rem', color: 'var(--text-dimmed)',
                                    marginTop: '0.3rem', lineHeight: 1.4,
                                }}>
                                    Seu documento será armazenado de forma criptografada (SHA-256).
                                </p>
                            </div>

                            {/* Security badge */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                                background: 'rgba(59,130,246,0.06)',
                                border: '1px solid rgba(59,130,246,0.12)',
                                marginBottom: '1.125rem',
                            }}>
                                <Shield size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Dados protegidos por criptografia. Registro INPI BR512026002376-9.
                                </span>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="btn-gradient"
                                disabled={loading || getRawDigits().length < 11}
                                style={{ width: '100%', padding: '0.8rem', fontSize: '0.88rem' }}
                            >
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <div className="sp-wave" style={{ width: 15, height: 15 }} /> Verificando...
                                    </span>
                                ) : (
                                    'Verificar e Continuar'
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
