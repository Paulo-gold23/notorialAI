import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { Eye, EyeOff, Gift, Shield, FileText, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function Login() {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [nome, setNome] = useState('');
    const [oab, setOab] = useState('');
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    const handleCpfCnpjChange = (e) => setCpfCnpj(formatCpfCnpj(e.target.value));
    const getRawCpfCnpj = () => cpfCnpj.replace(/\D/g, '');

    const isValidCpf = (cpf) => {
        if (typeof cpf !== 'string') return false;
        cpf = cpf.replace(/[^\d]+/g, '');
        if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
        const cpfChars = cpf.split('');
        const validator = cpfChars.filter((digit, index, array) => index >= array.length - 2 && digit).map(el => +el);
        const toValidate = pop => cpfChars.filter((digit, index, array) => index < array.length - pop && digit).map(el => +el);
        const rest = (count, pop) => (toValidate(pop).reduce((soma, el, i) => soma + el * (count - i), 0) * 10) % 11 % 10;
        return !(rest(10, 2) !== validator[0] || rest(11, 1) !== validator[1]);
    };

    const isValidCnpj = (cnpj) => {
        if (!cnpj || typeof cnpj !== 'string') return false;
        cnpj = cnpj.replace(/[^\d]+/g, '');
        if (cnpj.length !== 14 || !!cnpj.match(/(\d)\1{13}/)) return false;
        let tamanho = cnpj.length - 2;
        let numeros = cnpj.substring(0, tamanho);
        const digitos = cnpj.substring(tamanho);
        let soma = 0, pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
        let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(0)) return false;
        tamanho += 1; numeros = cnpj.substring(0, tamanho); soma = 0; pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
        resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        return resultado == digitos.charAt(1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMsg('');
        try {
            if (isRegister) {
                if (password !== confirmPassword) {
                    throw new Error('As senhas não coincidem. Por favor, verifique.');
                }
                const rawCpf = getRawCpfCnpj();
                if (rawCpf.length === 11 && !isValidCpf(rawCpf)) throw new Error('CPF inválido. Por favor, verifique os dígitos.');
                else if (rawCpf.length === 14 && !isValidCnpj(rawCpf)) throw new Error('CNPJ inválido. Por favor, verifique os dígitos.');
                else if (rawCpf.length !== 11 && rawCpf.length !== 14) throw new Error('O documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).');
                const encodedCpfCnpj = btoa(rawCpf);
                const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { nome, oab } } });
                if (signUpError) throw signUpError;
                if (data.user) {
                    await supabase.from('advogados').insert({ id: data.user.id, nome, oab, email, cpf_cnpj: encodedCpfCnpj, status: 'aprovado' });
                    setIsRegister(false);
                    setSuccessMsg('Conta criada com sucesso! Seus 50 créditos gratuitos já estão disponíveis. Redirecionando...');
                    setLoading(false);
                    setTimeout(() => window.location.reload(), 1500);
                    return;
                }
            } else {
                const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;
                const { data: profile } = await supabase.from('advogados').select('status').eq('id', data.user.id).single();
                if (profile?.status === 'pendente') { await supabase.auth.signOut(); throw new Error('Sua conta ainda não foi aprovada pelo administrador.'); }
            }
        } catch (err) {
            setError(err.message || 'Erro ao autenticar');
        } finally {
            setLoading(false);
        }
    };

    const benefits = [
        { icon: Gift, title: '50 Créditos Gratuitos', desc: 'Comece sem custos. Ganhe 50 páginas de crédito ao criar sua conta.', highlight: true },
        { icon: FileText, title: 'Documentos em Padrão Profissional', desc: 'Material preparatório formatado e pronto para uso jurídico imediato.' },
        { icon: Sparkles, title: 'IA Jurídica Avançada', desc: 'Transcrição inteligente com organização cronológica automática.' },
        { icon: Shield, title: 'Segurança e Conformidade', desc: 'Dados protegidos com criptografia. Registro INPI BR512026002376-9.' },
    ];

    return (
        /* ── Outer shell: full viewport height, flex row ── */
        <div className="page-enter" style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            overflow: 'hidden',
        }}>

            {/* ══ LEFT COLUMN — Benefits panel ══ */}
            <div
                className="auth-benefits-panel"
                style={{
                    width: isRegister ? '420px' : '0px',
                    minWidth: 0,
                    flexShrink: 0,
                    overflow: 'hidden',
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease',
                    opacity: isRegister ? 1 : 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: isRegister ? '3rem 2.5rem' : '0',
                    position: 'relative',
                    background: 'linear-gradient(160deg, rgba(59,130,246,0.05) 0%, rgba(245,158,11,0.03) 100%)',
                    borderRight: isRegister ? '1px solid var(--border-color)' : 'none',
                }}
            >
                {/* Decorative glow */}
                <div style={{
                    position: 'absolute', top: '20%', left: '40%',
                    width: '280px', height: '280px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Launch badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.875rem', borderRadius: '9999px',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
                        border: '1px solid rgba(245,158,11,0.2)', marginBottom: '1.25rem',
                    }}>
                        <Gift size={14} style={{ color: 'var(--gold-to)' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gold-to)' }}>Oferta de Lançamento</span>
                    </div>

                    <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', lineHeight: 1.3 }}>
                        Comece com{' '}
                        <span className="gradient-text" style={{ fontWeight: 800 }}>50 créditos grátis</span>
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: '340px' }}>
                        Cadastre-se agora e transforme conversas do WhatsApp em documentos jurídicos profissionais sem nenhum custo inicial.
                    </p>

                    {/* Benefits list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {benefits.map((b, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                padding: b.highlight ? '0.875rem' : '0.375rem 0',
                                borderRadius: b.highlight ? '0.75rem' : '0',
                                background: b.highlight ? 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))' : 'transparent',
                                border: b.highlight ? '1px solid rgba(245,158,11,0.15)' : 'none',
                                animation: `slideUp 0.4s ease-out ${i * 70}ms both`,
                            }}>
                                <div style={{
                                    flexShrink: 0, width: '34px', height: '34px', borderRadius: '0.5rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: b.highlight ? 'linear-gradient(135deg, var(--gold-from), var(--gold-to))' : 'var(--primary-glow)',
                                    color: b.highlight ? '#000' : 'var(--primary-color)',
                                }}>
                                    <b.icon size={17} />
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>{b.title}</h4>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{b.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ══ RIGHT COLUMN — Form + footer (full height flex column) ══ */}
            <div style={{
                flex: '1 1 auto',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Background glows (decorative, won't cause scroll) */}
                <div style={{
                    position: 'absolute', top: '25%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '380px', height: '380px', borderRadius: '50%',
                    background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
                    pointerEvents: 'none', opacity: 0.45, zIndex: 0,
                }} />
                <div style={{
                    position: 'absolute', top: '10%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '220px', height: '220px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
                    pointerEvents: 'none', zIndex: 0,
                }} />

                {/* ── Scrollable center area ── */}
                <div style={{
                    flex: '1 1 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem 1.5rem',
                    position: 'relative',
                    zIndex: 1,
                    overflowY: 'auto',
                }}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '420px',
                        padding: '2.25rem 2rem',
                        animation: 'scaleIn 0.5s ease-out',
                    }}>
                        {/* ── Card header ── */}
                        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                <div className="animate-breathe" style={{ animationDuration: '4s' }}>
                                    <Logo size={100} />
                                </div>
                            </div>
                            <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.35rem' }}>
                                LegisVox
                            </h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500, margin: 0 }}>
                                {isRegister ? 'Crie sua conta profissional' : 'Acesse sua conta'}
                            </p>

                            {/* Credits badge — register only */}
                            {isRegister && (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                                    marginTop: '0.625rem', padding: '0.35rem 0.75rem',
                                    borderRadius: '9999px',
                                    background: 'linear-gradient(135deg, rgba(74,222,128,0.1), rgba(74,222,128,0.04))',
                                    border: '1px solid rgba(74,222,128,0.2)',
                                    animation: 'slideUp 0.4s ease-out',
                                }}>
                                    <CheckCircle2 size={13} style={{ color: 'var(--success-color)' }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--success-color)' }}>
                                        Ganhe 50 créditos grátis ao se cadastrar
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* ── Alerts ── */}
                        {error && (
                            <div className="animate-shake" style={{
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: '0.5rem', padding: '0.625rem 0.875rem', marginBottom: '0.875rem',
                                color: 'var(--danger)', fontSize: '0.82rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem', lineHeight: 1.5,
                            }}>
                                <Shield size={15} style={{ marginTop: '2px', flexShrink: 0 }} />
                                {error}
                            </div>
                        )}
                        {successMsg && (
                            <div style={{
                                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                                borderRadius: '0.5rem', padding: '0.625rem 0.875rem', marginBottom: '0.875rem',
                                color: '#10b981', fontSize: '0.82rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem', lineHeight: 1.5,
                                animation: 'slideUp 0.3s ease-out',
                            }}>
                                <CheckCircle2 size={15} style={{ marginTop: '2px', flexShrink: 0 }} />
                                {successMsg}
                            </div>
                        )}

                        {/* ── Form ── */}
                        <form onSubmit={handleSubmit}>
                            {isRegister && (
                                <>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={labelStyle}>Nome Completo <Required /></label>
                                        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)}
                                            required placeholder="Dr. João Silva" className="input-login" />
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={labelStyle}>
                                            OAB <span style={{ color: 'var(--text-dimmed)', fontWeight: 400, fontSize: '0.72rem' }}>(opcional)</span>
                                        </label>
                                        <input type="text" value={oab} onChange={(e) => setOab(e.target.value)}
                                            placeholder="ES 12345" className="input-login" />
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={labelStyle}>CPF ou CNPJ <Required /></label>
                                        <input type="text" value={cpfCnpj} onChange={handleCpfCnpjChange}
                                            required placeholder="000.000.000-00" className="input-login" maxLength={18} />
                                        <p style={{ fontSize: '0.68rem', color: 'var(--text-dimmed)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                                            Necessário para emissão de NF. Dados protegidos por criptografia.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={labelStyle}>E-mail <Required /></label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    required placeholder="seu@email.com" className="input-login" />
                            </div>

                            <div style={{ marginBottom: isRegister ? '0.75rem' : '1.25rem' }}>
                                <label style={labelStyle}>Senha <Required /></label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password} onChange={(e) => setPassword(e.target.value)}
                                        required placeholder="Mínimo 6 caracteres"
                                        className="input-login" style={{ paddingRight: '3rem' }} minLength={6}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', padding: '0.2rem',
                                            display: 'flex', alignItems: 'center', transition: 'color 0.2s',
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password — register only */}
                            {isRegister && (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={labelStyle}>Confirmar Senha <Required /></label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                            required placeholder="Repita a senha"
                                            className="input-login"
                                            style={{
                                                paddingRight: '3rem',
                                                borderColor: confirmPassword && password !== confirmPassword
                                                    ? 'rgba(239,68,68,0.6)' : undefined,
                                            }}
                                            minLength={6}
                                        />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            style={{
                                                position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--text-muted)', padding: '0.2rem',
                                                display: 'flex', alignItems: 'center', transition: 'color 0.2s',
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                                            onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                            tabIndex={-1}
                                        >
                                            {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                        </button>
                                    </div>
                                    {confirmPassword && password !== confirmPassword && (
                                        <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Shield size={11} /> As senhas não coincidem.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Forgot password link */}
                            {!isRegister && (
                                <div style={{ textAlign: 'right', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
                                    <span
                                        onClick={async () => {
                                            if (!email) { setError('Informe seu e-mail para redefinir a senha.'); return; }
                                            setLoading(true); setError('');
                                            try {
                                                const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
                                                    redirectTo: `${window.location.origin}/#/login`
                                                });
                                                if (resetErr) throw resetErr;
                                                setSuccessMsg('E-mail de redefinição de senha enviado! Verifique sua caixa de entrada.');
                                            } catch (err) {
                                                setError(err.message || 'Erro ao enviar e-mail de redefinição.');
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        style={{
                                            fontSize: '0.78rem',
                                            color: 'var(--primary-color)',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                            transition: 'opacity 0.2s',
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.7'}
                                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                                    >
                                        Esqueci minha senha
                                    </span>
                                </div>
                            )}

                            <button type="submit" className="btn-gradient" disabled={loading}
                                style={{ width: '100%', padding: '0.875rem', fontSize: '0.92rem' }}>
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <div className="sp-wave" style={{ width: 15, height: 15 }} /> Aguarde...
                                    </span>
                                ) : isRegister ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        Criar Conta e Ganhar 50 Créditos <ArrowRight size={15} />
                                    </span>
                                ) : 'Entrar'}
                            </button>
                        </form>

                        {/* ── Toggle login / register ── */}
                        <div style={{
                            textAlign: 'center', marginTop: '1.25rem',
                            paddingTop: '1.125rem', borderTop: '1px solid var(--border-color)',
                        }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                {isRegister ? 'Já tem conta? ' : 'Ainda não tem conta? '}
                                <span
                                    onClick={() => { setIsRegister(!isRegister); setError(''); setSuccessMsg(''); }}
                                    style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 700, transition: 'opacity 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.opacity = '0.75'}
                                    onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                                >
                                    {isRegister ? 'Entrar' : 'Cadastre-se grátis'}
                                </span>
                            </p>
                            {!isRegister && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-dimmed)', marginTop: '0.375rem' }}>
                                    Novos membros ganham <strong style={{ color: 'var(--gold-to)' }}>50 créditos gratuitos</strong>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Footer — always at the very bottom of the right column ── */}
                <div style={{
                    flexShrink: 0,
                    borderTop: '1px solid var(--border-color)',
                    padding: '0.75rem 1.5rem',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    <LegalFooter />
                </div>
            </div>
        </div>
    );
}

/* ── Helpers ── */
const Required = () => <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span>;

const labelStyle = {
    display: 'block',
    marginBottom: '0.3rem',
    fontSize: '0.82rem',
    color: 'var(--text-muted)',
    fontWeight: 500,
};
