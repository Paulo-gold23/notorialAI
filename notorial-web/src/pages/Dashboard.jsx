import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, LogOut, Trash2, Plus, Settings, Upload, Sparkles, FileCheck, Shield, Edit2, Check, X, User } from 'lucide-react';
import { listAtas, deleteAta, updateAtaTitle } from '../services/api';
import { creditsApi } from '../services/creditsApi';
import { supabase } from '../services/supabase';
import ConfirmModal from '../components/ConfirmModal';
import SettingsModal from '../components/SettingsModal';
import TutorialModal from '../components/TutorialModal';
import { SkeletonList } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import Logo from '../components/Logo';
import CreditBalance from '../components/CreditBalance';
import { HelpCircle } from 'lucide-react';
import LegalFooter from '../components/LegalFooter';

const STATUS_LABELS = {
    uploading: { text: 'Enviando...', className: 'bg-yellow-500/20 text-yellow-500' },
    parsing: { text: 'Extraindo mensagens', className: 'bg-orange-500/20 text-orange-400' },
    transcribing: { text: 'Transcrevendo', className: 'bg-indigo-500/20 text-indigo-400' },
    organizing: { text: 'Organizando documento', className: 'bg-sky-500/20 text-sky-400' },
    ready: { text: 'Pronta', className: 'bg-green-500/20 text-green-400' },
    error: { text: 'Erro', className: 'bg-red-500/20 text-red-400' },
};

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

export default function Dashboard({ isAdmin = false }) {
    const [atas, setAtas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');

    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        loadData();
        // Check tutorial status on first load
        if (!localStorage.getItem('legisvox_tutorial_seen')) {
            setIsTutorialOpen(true);
            localStorage.setItem('legisvox_tutorial_seen', 'true');
        }
    }, []);

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setUserName(user?.user_metadata?.nome || user?.email || '');
            
            // Auto-claim welcome credits logic
            try {
                const trialStatus = await creditsApi.getTrialStatus();
                if (trialStatus.trial_eligible) {
                    await creditsApi.claimWelcomeCredits();
                    window.dispatchEvent(new Event('creditsUpdated'));
                    toast.success('Você recebeu 50 créditos gratuitos de boas-vindas!', { duration: 5000 });
                }
            } catch(e) {
                console.error("Falha ao checar/resgatar créditos de boas-vindas:", e);
            }
            const data = await listAtas();
            setAtas(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Erro ao carregar atas:', err);
            toast.error(err.message || 'Erro ao carregar documentos.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        window.location.reload();
    };

    const handleDeleteClick = (e, id) => {
        e.stopPropagation();
        setConfirmModal({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        const id = confirmModal.id;
        setConfirmModal({ isOpen: false, id: null });
        if (!id) return;

        try {
            await deleteAta(id);
            setAtas(prev => prev.filter(a => a.id !== id));
            toast.success('Documento excluído com sucesso.');
        } catch (err) {
            toast.error('Erro ao excluir: ' + err.message);
        }
    };

    const handleEditClick = (e, ata) => {
        e.stopPropagation();
        setEditingId(ata.id);
        setEditTitle(ata.titulo || 'Documento sem título');
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const saveEdit = async (e, id) => {
        e.stopPropagation();
        if (!editTitle.trim()) return;
        
        try {
            await updateAtaTitle(id, editTitle);
            setAtas(prev => prev.map(a => a.id === id ? { ...a, titulo: editTitle } : a));
            setEditingId(null);
            toast.success('Título atualizado com sucesso.');
        } catch (err) {
            toast.error('Erro ao atualizar título: ' + err.message);
        }
    };

    const filteredAtas = atas.filter(ata =>
        (ata.titulo || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="page-enter container-centered pt-8 md:pt-10 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div className="mb-2 md:mb-0">
                    <h1 className="text-3xl font-serif flex items-center gap-3 mb-2" style={{ color: 'var(--text-main)' }}>
                        <Logo size={40} /> Minhas Conversas
                    </h1>
                    <p className="text-base m-0 ml-1" style={{ color: 'var(--text-muted)' }}>
                        {getGreeting()}, {userName}
                    </p>
                </div>
                <div className="flex gap-3 w-full md:w-auto items-center flex-wrap">
                    <CreditBalance />
                    
                    <button 
                        onClick={() => setIsTutorialOpen(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 p-2.5 rounded-md transition-colors cursor-pointer"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        title="Como Funciona?"
                    >
                        <HelpCircle size={20} />
                        <span className="md:hidden">Tutorial</span>
                    </button>

                    <button className="btn-primary flex-1 md:flex-none flex items-center justify-center gap-2 py-2.5 px-5" onClick={() => navigate('/upload')}>
                        <Plus size={18} /> Nova Conversa
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="flex-1 md:flex-none flex items-center justify-center p-2.5 rounded-md transition-colors cursor-pointer"
                            style={{
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: 'var(--gold-to)',
                                background: 'rgba(245, 158, 11, 0.08)',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'; e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.08)'; e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)'; }}
                            title="Painel Admin"
                        >
                            <Shield size={20} />
                        </button>
                    )}
                    <button
                        onClick={() => navigate('/profile')}
                        className="flex-1 md:flex-none flex items-center justify-center p-2.5 rounded-md transition-colors cursor-pointer"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        title="Meu Perfil"
                    >
                        <User size={20} />
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex-1 md:flex-none flex items-center justify-center p-2.5 rounded-md transition-colors cursor-pointer"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        title="Temas (Configurações)"
                    >
                        <Settings size={20} />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-md transition-colors cursor-pointer"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'transparent' }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <SkeletonList count={3} />
            ) : atas.length === 0 ? (
                /* Enhanced Empty State */
                <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'var(--primary-glow)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                        }}>
                            <Sparkles size={36} style={{ color: 'var(--primary-color)' }} />
                        </div>
                        <h3 className="text-xl font-serif mb-2" style={{ color: 'var(--text-main)' }}>
                            Comece a criar seus documentos
                        </h3>
                        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 2rem', lineHeight: 1.6 }}>
                            Transforme conversas do WhatsApp em material preparatório profissional.
                        </p>
                    </div>

                    {/* How it works steps */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '2rem',
                        marginBottom: '2rem',
                        flexWrap: 'wrap',
                    }}>
                        {[
                            { icon: Upload, label: 'Upload do ZIP', desc: 'Exporte do WhatsApp' },
                            { icon: Sparkles, label: 'IA Processa', desc: 'Transcrição e organização' },
                            { icon: FileCheck, label: 'PDF Pronto', desc: 'Documento profissional pronto' },
                        ].map((step, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.5rem',
                                position: 'relative',
                                flex: '1 1 100px',
                                minWidth: '80px',
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '0.75rem',
                                    background: 'var(--surface-color)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--primary-color)',
                                }}>
                                    <step.icon size={22} />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{step.label}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{step.desc}</span>
                            </div>
                        ))}
                    </div>

                    <button className="btn-gradient" onClick={() => navigate('/upload')} style={{ padding: '0.75rem 2rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={18} /> Criar Primeira Conversa
                        </span>
                    </button>
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="mb-6 relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar documentos pelo título..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-login"
                            style={{
                                paddingLeft: '3rem',
                                paddingRight: '1rem',
                                width: '100%',
                            }}
                        />
                    </div>

                    {filteredAtas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                            Nenhum documento encontrado para "{searchQuery}"
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {filteredAtas.map((ata, index) => {
                                const status = STATUS_LABELS[ata.status] || STATUS_LABELS.error;
                                const isReady = ata.status === 'ready';
                                const isProcessing = ['uploading', 'parsing', 'transcribing', 'organizing'].includes(ata.status);

                                return (
                                    <div
                                        className={`card ${isReady ? 'card-interactive' : ''}`}
                                        key={ata.id}
                                        onClick={() => isReady && navigate(`/review/${ata.id}`)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            flexWrap: 'wrap',
                                            animationDelay: `${index * 50}ms`,
                                            animation: `slideUp 0.4s ease-out ${index * 50}ms both`,
                                        }}
                                    >
                                        <div>
                                            {editingId === ata.id ? (
                                                <div className="flex items-center gap-2 mb-1" onClick={e => e.stopPropagation()}>
                                                    <input 
                                                        autoFocus
                                                        type="text" 
                                                        value={editTitle}
                                                        onChange={(e) => setEditTitle(e.target.value)}
                                                        className="input-login py-1 px-2 text-sm"
                                                        style={{ width: '100%', minWidth: '200px' }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveEdit(e, ata.id);
                                                            if (e.key === 'Escape') cancelEdit(e);
                                                        }}
                                                    />
                                                    <button onClick={(e) => saveEdit(e, ata.id)} className="text-green-500 hover:text-green-600 transition-colors"><Check size={18}/></button>
                                                    <button onClick={cancelEdit} className="text-red-500 hover:text-red-600 transition-colors"><X size={18}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 mb-1 group">
                                                    <h3 className="font-serif text-lg font-semibold cursor-text" style={{ color: 'var(--text-main)' }}>
                                                        {ata.titulo || 'Documento sem título'}
                                                    </h3>
                                                    <button 
                                                        onClick={(e) => handleEditClick(e, ata)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-amber-500"
                                                        title="Editar título"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {ata.total_mensagens && <span>{ata.total_mensagens} msgs</span>}
                                                {ata.total_audios > 0 && <span>{ata.total_audios} áudios</span>}
                                                <span>{new Date(ata.created_at).toLocaleDateString('pt-BR')}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span
                                                className={`px-3 py-1 rounded-full text-xs font-semibold ${status.className}`}
                                                style={isProcessing ? { animation: 'breathe 1.5s ease-in-out infinite' } : {}}
                                            >
                                                {status.text}
                                            </span>
                                            {isReady && (
                                                <button
                                                    className="btn-primary text-xs px-3 py-1.5"
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/review/${ata.id}`); }}
                                                >
                                                    Revisar
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteClick(e, ata.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: '0.375rem',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-muted)',
                                                    transition: 'color 0.2s',
                                                    borderRadius: '0.25rem',
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger)'}
                                                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                                title="Excluir"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, id: null })}
                onConfirm={confirmDelete}
                title="Excluir Documento"
                message="Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita."
                confirmText="Excluir"
                variant="danger"
            />

            <TutorialModal 
                isOpen={isTutorialOpen} 
                onClose={() => setIsTutorialOpen(false)} 
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <LegalFooter />
        </div>
    );
}
