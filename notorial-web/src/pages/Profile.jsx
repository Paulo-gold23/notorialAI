import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { ArrowLeft, User, Mail, Briefcase, ShieldCheck, CreditCard, Lock, Sparkles, CheckCircle2, TrendingUp, Coins, ChevronRight, RefreshCw } from 'lucide-react';
import { creditsApi } from '../services/creditsApi';
import { apiRequest } from '../services/api';
import { useToast } from '../components/ToastContext';
import { Skeleton } from '../components/Skeleton';
import LegalFooter from '../components/LegalFooter';
import SignaturePinPromptModal from '../components/SignaturePinPromptModal';
import ResetSignaturePinModal from '../components/ResetSignaturePinModal';

export default function Profile() {
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [authEmail, setAuthEmail] = useState('');
    const [sendingReset, setSendingReset] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    // True when user already has a signature PIN — drives isUpdate prop on modal
    const [hasSignaturePin, setHasSignaturePin] = useState(false);
    
    // Credit States
    const [creditStats, setCreditStats] = useState({
        total: 0,
        consumed: 0,
        balance: 0
    });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');
            
            setAuthEmail(user.email);

            const { data, error } = await supabase
                .from('advogados')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            setProfile(data);

            // Fetch credit statistics
            const txs = await creditsApi.getTransactions();
            let consumed = 0;
            
            txs.forEach(tx => {
                const amt = Number(tx.amount) || 0;
                if (tx.type === 'debit') consumed += amt;
                if (tx.type === 'refund') consumed = Math.max(0, consumed - amt);
            });
            
            // In a live system balance might go out of sync with tx history logic if manual changes happen,
            // so we also fetch the exact current balance to be sure:
            const exactBalance = await creditsApi.getBalance();
            
            // O total acumulado que passou pela conta é o saldo disponível atual + o que já foi consumido
            const totalAccumulated = exactBalance + consumed;
            
            setCreditStats({
                total: totalAccumulated,
                consumed: consumed,
                balance: exactBalance
            });

            // Fetch PIN status from secure backend endpoint (hash is never sent to frontend)
            try {
                const pinStatus = await apiRequest('/api/auth/signature-pin/status');
                setHasSignaturePin(pinStatus?.has_pin === true);
            } catch {
                // Non-critical: if this fails, default to false (treats as first-time setup)
                setHasSignaturePin(false);
            }

        } catch (err) {
            console.error('Erro ao carregar perfil:', err);
            toast.error('Erro ao carregar dados do perfil.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="page-enter container-centered pt-8 md:pt-10 pb-12">
                <div className="flex items-center gap-4 mb-8">
                    <Skeleton width="2.5rem" height="2.5rem" style={{ borderRadius: '50%' }} />
                    <div>
                        <Skeleton width="10rem" height="1.75rem" style={{ marginBottom: '0.5rem' }} />
                        <Skeleton width="16rem" height="0.875rem" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    <div className="col-span-1 md:col-span-2 space-y-6">
                        <div className="card" style={{ padding: '2rem' }}>
                            <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <Skeleton width="2.5rem" height="2.5rem" style={{ borderRadius: '0.5rem' }} />
                                <Skeleton width="10rem" height="1.25rem" />
                            </div>
                            <div className="grid grid-cols-2 gap-5">
                                {[1, 2].map(i => (
                                    <div key={i}>
                                        <Skeleton width="6rem" height="0.75rem" style={{ marginBottom: '0.5rem' }} />
                                        <Skeleton height="3rem" style={{ borderRadius: '0.5rem' }} />
                                    </div>
                                ))}
                            </div>
                            <Skeleton width="8rem" height="0.75rem" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }} />
                            <Skeleton height="4rem" style={{ borderRadius: '0.5rem' }} />
                        </div>
                    </div>
                    <div className="col-span-1 space-y-6">
                        <div className="card" style={{ padding: '2rem' }}>
                            <Skeleton width="8rem" height="1.25rem" style={{ marginBottom: '1.5rem' }} />
                            <Skeleton height="0.75rem" style={{ borderRadius: '999px', marginBottom: '1rem' }} />
                            <Skeleton height="2.75rem" style={{ borderRadius: '0.75rem' }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const getDecodedDocument = (encoded) => {
        if (!encoded) return 'Não cadastrado';
        try {
            // Decodifica a string Base64 salva no banco para exibir limpo
            return atob(encoded);
        } catch {
            return encoded; // Fallback se já for texto normal (cadastros antigos)
        }
    };

    const handlePasswordReset = async () => {
        setSendingReset(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
                redirectTo: `${window.location.origin}/login`
            });
            if (error) throw error;
            toast.success('E-mail de redefinição de senha enviado com sucesso!');
        } catch (error) {
            toast.error('Erro ao enviar e-mail de redefinição: ' + error.message);
        } finally {
            setSendingReset(false);
        }
    };

    if (loading) {
        return (
            <div className="page-enter container-centered pt-8 md:pt-10 pb-12 flex justify-center items-center min-h-[60vh]">
                <div className="sp-wave" style={{ width: 32, height: 32 }} />
            </div>
        );
    }

    return (
        <div className="page-enter container-centered pt-8 md:pt-10 pb-12">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/')}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        title="Voltar ao Dashboard"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-serif flex items-center gap-2 mb-1" style={{ color: 'var(--text-main)' }}>
                            Meu Perfil
                        </h1>
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            Gerencie suas informações pessoais e segurança
                        </p>
                    </div>
                </div>
                
                {profile?.status === 'aprovado' && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 font-medium text-sm shadow-[0_0_15px_rgba(34,197,94,0.15)]">
                        <CheckCircle2 size={18} />
                        Conta Aprovada e Ativa
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                
                {/* Left Column: Personal Data */}
                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div className="card relative overflow-hidden" style={{ padding: '2rem' }}>
                        {/* Status glow */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-color)] pb-4">
                            <div className="p-2.5 rounded-lg bg-[var(--primary-glow)] text-[var(--primary-color)]">
                                <User size={22} />
                            </div>
                            <h2 className="text-xl font-semibold m-0" style={{ color: 'var(--text-main)' }}>Dados Pessoais</h2>
                        </div>

                        <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {/* Nome */}
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                        Nome Completo
                                    </label>
                                    <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)]/50">
                                        <User size={18} className="text-gray-400" />
                                        <span className="font-medium" style={{ color: 'var(--text-main)' }}>
                                            {profile?.nome || 'Não informado'}
                                        </span>
                                    </div>
                                </div>

                                {/* OAB */}
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                        Registro OAB
                                    </label>
                                    <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)]/50">
                                        <Briefcase size={18} className="text-gray-400" />
                                        <span className="font-medium" style={{ color: 'var(--text-main)' }}>
                                            {profile?.oab || 'Não informado'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* CPF / CNPJ - Read Only & Highlighted */}
                            <div className="mt-4">
                                <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                    Documento (CPF/CNPJ)
                                </label>
                                <div className="flex items-start gap-0 rounded-lg overflow-hidden border border-[var(--border-color)] group transition-all duration-300 hover:border-blue-500/40">
                                    <div className="bg-blue-500/5 p-4 flex items-center justify-center border-r border-[var(--border-color)] flex-shrink-0">
                                        <CreditCard size={20} className="text-blue-500" />
                                    </div>
                                    <div className="p-4 flex-1 bg-[var(--surface-color)]/30 w-full relative overflow-hidden">
                                        {/* Lock Icon Overlay for Read-Only indicator */}
                                        <div className="absolute top-1/2 -translate-y-1/2 right-4 text-gray-400 opacity-50">
                                            <Lock size={16} />
                                        </div>
                                        <span className="block font-mono text-base font-semibold tracking-wide" style={{ color: 'var(--text-main)' }}>
                                            {getDecodedDocument(profile?.cpf_cnpj)}
                                        </span>
                                        <span className="block text-xs mt-1 text-blue-500/80 font-medium tracking-wide">
                                            Documento validado e vinculado oficialmente
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '2rem' }}>
                        <div className="flex items-center gap-3 mb-6 border-b border-[var(--border-color)] pb-4">
                            <div className="p-2.5 rounded-lg bg-orange-500/10 text-orange-500">
                                <ShieldCheck size={22} />
                            </div>
                            <h2 className="text-xl font-semibold m-0" style={{ color: 'var(--text-main)' }}>Segurança da Conta</h2>
                        </div>

                        <div className="space-y-6">
                            {/* E-mail */}
                            <div>
                                <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                    Endereço de E-mail
                                </label>
                                <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)]/50">
                                    <Mail size={18} className="text-gray-400" />
                                    <span className="font-medium" style={{ color: 'var(--text-main)' }}>
                                        {authEmail}
                                    </span>
                                </div>
                            </div>

                            {/* Password Reset */}
                            <div className="pt-4 border-t border-[var(--border-color)]">
                                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-main)' }}>Redefinir Senha</h3>
                                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    Enviaremos um link seguro para o seu e-mail cadastrado ({authEmail}) para que você possa criar uma nova senha.
                                </p>
                                <button 
                                    onClick={handlePasswordReset}
                                    disabled={sendingReset}
                                    className="btn-secondary px-5 py-2.5 flex items-center gap-2 group border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                                >
                                    {sendingReset ? (
                                        <>
                                            <div className="sp-wave" style={{ width: 16, height: 16 }} />
                                            Enviando...
                                        </>
                                    ) : (
                                        <>
                                            <Lock size={16} className="text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-white transition-colors" />
                                            <span>Enviar link de redefinição</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* PIN de Confirmação */}
                            <div className="pt-4 border-t border-[var(--border-color)]">
                                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-main)' }}>PIN de Confirmação</h3>
                                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    Senha numérica de 4 dígitos exigida no momento da emissão ou alteração de documentos.
                                </p>
                                {profile?.senha_assinatura_bloqueado ? (
                                    <div className="flex flex-col gap-3">
                                        <div style={{
                                            background: 'rgba(239,68,68,0.08)',
                                            border: '1px solid rgba(239,68,68,0.2)',
                                            borderRadius: '0.5rem',
                                            padding: '0.625rem 0.75rem',
                                            color: 'var(--danger, #ef4444)',
                                            fontSize: '0.8rem',
                                            lineHeight: 1.4,
                                        }}>
                                            ⚠️ Seu PIN de confirmação está bloqueado devido a excesso de tentativas incorretas.
                                        </div>
                                        <button
                                            onClick={() => setShowResetModal(true)}
                                            className="btn-primary px-5 py-2.5 flex items-center justify-center gap-2"
                                            style={{ background: 'linear-gradient(to right, var(--gold-from), var(--gold-to))', color: '#111827', width: 'fit-content' }}
                                        >
                                            <Lock size={16} />
                                            <span>Redefinir e Desbloquear por E-mail</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3 items-center">
                                        <button 
                                            onClick={() => setShowPinModal(true)}
                                            className="btn-secondary px-5 py-2.5 flex items-center gap-2 group border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                                        >
                                            <Lock size={16} className="text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-white transition-colors" />
                                            <span>
                                                {profile?.senha_assinatura_hash 
                                                    ? 'Alterar PIN de Confirmação' 
                                                    : 'Cadastrar PIN de Confirmação'
                                                }
                                            </span>
                                        </button>
                                        
                                        {profile?.senha_assinatura_hash && (
                                            <button 
                                                onClick={() => setShowResetModal(true)}
                                                className="btn-secondary px-5 py-2.5 flex items-center gap-2 group border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                                            >
                                                <RefreshCw size={16} className="text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-white transition-colors" />
                                                <span>Redefinir Senha (E-mail)</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Termos Aceitos */}
                            <div className="pt-4 border-t border-[var(--border-color)]">
                                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-main)' }}>Termos e Consentimento</h3>
                                {profile?.terms_accepted_at ? (
                                    <div className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        <p style={{ margin: '0 0 0.25rem 0' }}>
                                            ✅ Termos aceitos em: <strong>{new Date(profile.terms_accepted_at).toLocaleDateString('pt-BR')}</strong>
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dimmed)' }}>
                                            Versão: {profile?.terms_version || 'N/A'}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm" style={{ color: 'var(--text-dimmed)', lineHeight: 1.5 }}>
                                        Nenhum aceite de termos registrado.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Premium Highlights / Gauges */}
                <div className="col-span-1 space-y-6">
                    <div className="card h-fit" style={{ padding: '2rem' }}>
                        <div className="flex items-center justify-between mb-6 border-b border-[var(--border-color)] pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-lg bg-[var(--primary-glow)] text-[var(--gold-main)]">
                                    <TrendingUp size={22} />
                                </div>
                                <h2 className="text-xl font-semibold m-0" style={{ color: 'var(--text-main)' }}>Seus Créditos</h2>
                            </div>
                            <span className="text-sm font-bold bg-[var(--primary-glow)] text-[var(--gold-main)] px-3 py-1 rounded-full">
                                {creditStats.balance} disp.
                            </span>
                        </div>

                        <div className="space-y-6">
                            {/* Usage Bar */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span style={{ color: 'var(--text-muted)' }}>Consumo Total</span>
                                    <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
                                        {creditStats.consumed} de {creditStats.total}
                                    </span>
                                </div>
                                <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-1000 ease-out"
                                        style={{ 
                                            width: `${creditStats.total > 0 ? Math.min(100, (creditStats.consumed / creditStats.total) * 100) : 0}%`,
                                            background: 'linear-gradient(90deg, var(--gold-from), var(--gold-to))'
                                        }}
                                    />
                                </div>
                                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                                    {creditStats.total > 0 && (creditStats.consumed / creditStats.total) > 0.8 
                                        ? 'Seus créditos estão acabando.' 
                                        : 'Você tem saldo suficiente para criar novos documentos.'}
                                </p>
                            </div>

                            <button 
                                onClick={() => navigate('/credits')}
                                className="w-full btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(to right, var(--gold-from), var(--gold-to))', color: '#111827' }}
                            >
                                <Coins size={18} />
                                <span>Adquirir Mais Créditos</span>
                            </button>
                        </div>
                    </div>

                    <div className="card relative overflow-hidden" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(37,99,235,0.05) 100%)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                        
                        <div className="flex flex-col h-full">
                            <div className="p-3 bg-blue-500/10 rounded-xl w-fit text-blue-500 mb-6 shadow-sm">
                                <Sparkles size={28} />
                            </div>
                            
                            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-main)' }}>
                                Informações Sincronizadas
                            </h3>
                            
                            <p className="text-sm mb-6 flex-1" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                Seus documentos e dados fiscais estão protegidos por medidas técnicas e administrativas de segurança, compatíveis com a natureza das informações tratadas.
                            </p>

                            <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 border border-[var(--border-color)]">
                                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Por que não posso alterar o CPF/CNPJ?</p>
                                <p className="text-sm m-0" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    O documento é a principal chave de identidade legal para garantir a emissão correta de notas fiscais nas compras do Asaas. Para alterar seu documento base, é necessário criar uma nova conta.
                                </p>
                            </div>
                            
                            <button 
                                onClick={() => navigate('/credits')}
                                className="mt-4 text-xs font-semibold flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] hover:bg-[var(--primary-glow)] hover:border-blue-500/30 transition-colors group cursor-pointer"
                                style={{ color: 'var(--text-main)' }}
                            >
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-blue-500" />
                                    Vantagens Premium
                                </div>
                                <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showPinModal && (
                <SignaturePinPromptModal 
                    isUpdate={hasSignaturePin}
                    onClose={() => setShowPinModal(false)}
                    onSaved={() => {
                        setShowPinModal(false);
                        loadProfile();
                    }} 
                />
            )}
            {showResetModal && (
                <ResetSignaturePinModal 
                    onClose={() => setShowResetModal(false)}
                    onSuccess={() => {
                        setShowResetModal(false);
                        loadProfile();
                    }}
                />
            )}

            <LegalFooter style={{ marginTop: '3rem' }} />
        </div>
    );
}
