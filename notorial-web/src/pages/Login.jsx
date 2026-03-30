import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';

export default function Login() {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nome, setNome] = useState('');
    const [oab, setOab] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isRegister) {
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { nome, oab } }
                });
                if (signUpError) throw signUpError;

                if (data.user) {
                    await supabase.from('advogados').insert({
                        id: data.user.id,
                        nome,
                        oab,
                        email,
                    });
                }
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (signInError) throw signInError;
            }
        } catch (err) {
            setError(err.message || 'Erro ao autenticar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-enter" style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Background glow effect */}
            <div style={{
                position: 'absolute',
                top: '30%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
                pointerEvents: 'none',
                opacity: 0.6,
            }} />

            {/* Gold accent glow */}
            <div style={{
                position: 'absolute',
                top: '20%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '250px',
                height: '250px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div className="card" style={{
                width: '100%',
                maxWidth: '420px',
                padding: '2.5rem',
                position: 'relative',
                animation: 'scaleIn 0.5s ease-out',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        marginBottom: '1.5rem',
                        display: 'flex',
                        justifyContent: 'center',
                    }}>
                        <div className="animate-breathe" style={{ animationDuration: '4s' }}>
                            <Logo size={140} />
                        </div>
                    </div>
                    <h1 className="gradient-text" style={{
                        fontSize: '2.2rem',
                        fontWeight: 800,
                        margin: '0 0 0.5rem',
                    }}>
                        Notorial.ai
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 500, margin: 0 }}>
                        {isRegister ? 'Crie sua conta de advogado' : 'Acesse sua conta'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="animate-shake" style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '0.5rem',
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        color: 'var(--danger)',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '1rem' }}>⚠</span>
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    Nome Completo
                                </label>
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    required
                                    placeholder="Dr. João Silva"
                                    className="input-login"
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    OAB (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={oab}
                                    onChange={(e) => setOab(e.target.value)}
                                    placeholder="ES 12345"
                                    className="input-login"
                                />
                            </div>
                        </>
                    )}

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            E-mail
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="seu@email.com"
                            className="input-login"
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            Senha
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="input-login"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-gradient"
                        disabled={loading}
                        style={{ width: '100%', marginBottom: '0.75rem' }}
                    >
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <div className="sp-wave" style={{ width: 16, height: 16 }} />
                                Aguarde...
                            </span>
                        ) : (
                            isRegister ? 'Criar Conta' : 'Entrar'
                        )}
                    </button>

                    {!isRegister && (
                        <button
                            type="button"
                            onClick={() => {
                                localStorage.setItem('notorial_test_admin', 'true');
                                window.location.href = '/';
                            }}
                            className="btn-secondary"
                            style={{
                                width: '100%',
                                justifyContent: 'center',
                                padding: '0.75rem',
                                fontSize: '0.875rem',
                            }}
                        >
                            <ShieldCheck size={18} /> Entrar como Admin (Modo Teste)
                        </button>
                    )}
                </form>

                <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {isRegister ? 'Já tem conta? ' : 'Não tem conta? '}
                    <span
                        onClick={() => { setIsRegister(!isRegister); setError(''); }}
                        style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s' }}
                    >
                        {isRegister ? 'Entrar' : 'Registrar'}
                    </span>
                </p>
            </div>
        </div>
    );
}
