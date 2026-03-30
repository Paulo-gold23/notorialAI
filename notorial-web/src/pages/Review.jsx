import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link'
import Heading from '@tiptap/extension-heading'
import Placeholder from '@tiptap/extension-placeholder'
import { apiRequest } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import BackButton from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import {
    FileText, FileCheck, Plus, Save, Check, Bold, Italic, Strikethrough,
    Heading1, Heading2, List, ListOrdered, Undo, Redo, ArrowDown, ArrowUp,
    Copy, Lightbulb, Users, MessageSquare, Mic, CalendarRange,
} from 'lucide-react';
import Logo from '../components/Logo';

function normalizeEditorContent(value) {
    if (!value) return '<p>Conteúdo não disponível</p>';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof value.conteudo === 'string') return value.conteudo;
    return '<p>Conteúdo recebido em formato não suportado para edição.</p>';
}

export default function Review() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [ata, setAta] = useState(null);
    const [conteudo, setConteudo] = useState(null);
    const [activeTab, setActiveTab] = useState('preparatorio');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatingFormal, setGeneratingFormal] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [isAtBottom, setIsAtBottom] = useState(false);
    const [hasScroll, setHasScroll] = useState(false);

    const tabsRef = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            const scrollable = document.documentElement.scrollHeight > window.innerHeight + 100;
            setHasScroll(scrollable);
            const bottom = Math.ceil(window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 100;
            setIsAtBottom(bottom);
        };
        window.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleScroll);
        // Re-check after content loads
        const timer = setTimeout(handleScroll, 500);
        handleScroll();
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
            clearTimeout(timer);
        };
    }, [loading, conteudo]);

    const toggleScroll = () => {
        if (isAtBottom) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
    };

    const hasFormal = conteudo?.conteudo_formal && conteudo.conteudo_formal !== null;

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: false }),
            Heading.extend({
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        id: {
                            default: null,
                            parseHTML: element => element.getAttribute('id'),
                            renderHTML: attributes => {
                                if (!attributes.id) return {}
                                return { id: attributes.id }
                            },
                        },
                    }
                },
            }),
            Link.configure({
                openOnClick: true,
                autolink: true,
                defaultProtocol: 'https',
                HTMLAttributes: {
                    class: 'text-blue-600 hover:underline cursor-pointer',
                },
            }),
            Placeholder.configure({
                placeholder: 'O conteúdo organizado aparecerá aqui...',
            }),
        ],
        content: '<p>Carregando conteúdo...</p>',
    });

    const loadAta = useCallback(async () => {
        try {
            const ataData = await apiRequest(`/api/atas/${id}/preview`);
            setAta(ataData.ata);
            setConteudo(ataData.conteudo);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao carregar os dados da ata.');
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => {
        loadAta();
    }, [loadAta]);

    useEffect(() => {
        if (!conteudo || !editor) return;
        const raw = activeTab === 'formal' ? conteudo.conteudo_formal : conteudo.conteudo_preparatorio;
        editor.commands.setContent(normalizeEditorContent(raw));
    }, [activeTab, conteudo, editor]);

    const handleSave = async () => {
        if (!editor) return;
        setSaving(true);
        setSaved(false);
        try {
            const html = editor.getHTML();
            await apiRequest(`/api/atas/${id}/content`, {
                method: 'PUT',
                body: JSON.stringify({ tipo: activeTab, conteudo: html }),
            });
            setSaved(true);
            toast.success('Edições salvas com sucesso!');
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            toast.error('Erro ao salvar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCopyAll = async () => {
        if (!editor) return;
        try {
            const text = editor.getText();
            await navigator.clipboard.writeText(text);
            toast.success('Conteúdo copiado para a área de transferência!');
        } catch (err) {
            toast.error('Erro ao copiar: ' + err.message);
        }
    };

    const handleGenerateFormalClick = () => {
        setConfirmModal({ isOpen: true });
    };

    const confirmGenerateFormal = async () => {
        setConfirmModal({ isOpen: false });
        setGeneratingFormal(true);
        try {
            const result = await apiRequest(`/api/atas/${id}/generate-formal`, { method: 'POST' });
            if (result.conteudo_formal) {
                setConteudo(prev => ({ ...prev, conteudo_formal: result.conteudo_formal }));
                setActiveTab('formal');
                toast.success('Versão cartorária gerada com sucesso!');
            }
        } catch (err) {
            toast.error('Erro ao gerar versão formal: ' + err.message);
        } finally {
            setGeneratingFormal(false);
        }
    };

    const handleGeneratePdf = async (tipo) => {
        setGenerating(true);
        try {
            const data = await apiRequest(`/api/atas/${id}/generate-pdf`, {
                method: 'POST',
                body: JSON.stringify({ tipo, conteudo: editor.getHTML() }),
            });
            if (data.pdf_url) {
                window.open(data.pdf_url, '_blank');
                toast.success('PDF gerado! Abrindo em nova aba...');
            }
        } catch (err) {
            toast.error('Erro ao gerar PDF: ' + err.message);
        } finally {
            setGenerating(false);
        }
    };

    // Loading skeleton
    if (loading) {
        return (
            <div className="page-enter container-centered" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
                <BackButton />
                <Skeleton width="200px" height="1.75rem" style={{ marginBottom: '1.5rem' }} />
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        {[1,2,3,4].map(i => <Skeleton key={i} height="2.5rem" />)}
                    </div>
                </div>
                <Skeleton height="2rem" width="280px" style={{ marginBottom: '1.5rem' }} />
                <div className="card" style={{ padding: 0 }}>
                    <Skeleton height="40px" style={{ borderRadius: '0.75rem 0.75rem 0 0' }} />
                    <div style={{ padding: '1.5rem' }}>
                        <Skeleton height="0.75rem" style={{ marginBottom: '0.75rem' }} />
                        <Skeleton height="0.75rem" width="80%" style={{ marginBottom: '0.75rem' }} />
                        <Skeleton height="0.75rem" width="90%" style={{ marginBottom: '0.75rem' }} />
                        <Skeleton height="0.75rem" width="60%" />
                    </div>
                </div>
            </div>
        );
    }

    const metaItems = ata ? [
        { icon: Users, label: 'Participantes', value: ata.participantes?.join(', ') || '—' },
        { icon: MessageSquare, label: 'Mensagens', value: ata.total_mensagens || 0 },
        { icon: Mic, label: 'Áudios', value: ata.total_audios || 0 },
        { icon: CalendarRange, label: 'Período', value: `${ata.periodo_inicio || '—'} — ${ata.periodo_fim || '—'}` },
    ] : [];

    return (
        <div className="page-enter container-centered" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
            <BackButton />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 className="font-serif" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Logo size={32} /> {ata?.titulo || 'Revisão da Ata'}
                </h1>
            </div>

            {/* Meta info - Grid layout with icons */}
            {ata && (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '1rem',
                    }}>
                        {metaItems.map((item, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    animation: `slideUp 0.3s ease-out ${i * 60}ms both`,
                                }}
                            >
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '0.5rem',
                                    background: 'var(--surface-color)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--primary-color)',
                                    flexShrink: 0,
                                }}>
                                    <item.icon size={16} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                        {item.label}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                        {item.value}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div ref={tabsRef} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveTab('preparatorio')}
                    className="btn-secondary"
                    style={{
                        borderColor: activeTab === 'preparatorio' ? 'var(--primary-color)' : undefined,
                        background: activeTab === 'preparatorio' ? 'var(--primary-glow)' : undefined,
                        color: activeTab === 'preparatorio' ? 'var(--primary-color)' : undefined,
                        boxShadow: activeTab === 'preparatorio' ? '0 0 0 1px var(--primary-color)' : undefined,
                    }}
                >
                    <FileText className="w-4 h-4" />
                    Material Preparatório
                </button>

                {hasFormal ? (
                    <button
                        onClick={() => setActiveTab('formal')}
                        className="btn-secondary"
                        style={{
                            borderColor: activeTab === 'formal' ? 'var(--success)' : undefined,
                            background: activeTab === 'formal' ? 'rgba(74, 222, 128, 0.1)' : undefined,
                            color: activeTab === 'formal' ? 'var(--success)' : undefined,
                            boxShadow: activeTab === 'formal' ? '0 0 0 1px var(--success)' : undefined,
                        }}
                    >
                        <FileCheck className="w-4 h-4" />
                        Ata Cartorária
                    </button>
                ) : (
                    <button
                        onClick={handleGenerateFormalClick}
                        disabled={generatingFormal}
                        className="btn-secondary"
                        style={{
                            borderStyle: 'dashed',
                            color: generatingFormal ? 'var(--accent-color)' : 'var(--text-muted)',
                            background: generatingFormal ? 'rgba(167, 139, 250, 0.1)' : undefined,
                            cursor: generatingFormal ? 'wait' : 'pointer',
                        }}
                    >
                        {generatingFormal ? (
                            <><div className="sp-wave" style={{ width: 14, height: 14 }} /> Gerando versão cartorária...</>
                        ) : (
                            <><Plus className="w-4 h-4" /> Gerar Versão Cartorária</>
                        )}
                    </button>
                )}
            </div>

            {/* Editor */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Toolbar */}
                <div className="sticky-toolbar" style={{
                    display: 'flex', gap: '0.25rem', padding: '0.5rem', flexWrap: 'wrap',
                    alignItems: 'center',
                }}>
                    <ToolBtn icon={<Bold className="w-4 h-4" />} active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)" />
                    <ToolBtn icon={<Italic className="w-4 h-4" />} active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)" />
                    <ToolBtn icon={<Strikethrough className="w-4 h-4" />} active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Tachado" />

                    <div className="divider-v"></div>

                    <ToolBtn icon={<Heading1 className="w-4 h-4" />} active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1" />
                    <ToolBtn icon={<Heading2 className="w-4 h-4" />} active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2" />

                    <div className="divider-v"></div>

                    <ToolBtn icon={<List className="w-4 h-4" />} active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista com Marcadores" />
                    <ToolBtn icon={<ListOrdered className="w-4 h-4" />} active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista Numerada" />

                    <div className="divider-v"></div>

                    <ToolBtn icon={<Undo className="w-4 h-4" />} onClick={() => editor?.chain().focus().undo().run()} title="Desfazer (Ctrl+Z)" />
                    <ToolBtn icon={<Redo className="w-4 h-4" />} onClick={() => editor?.chain().focus().redo().run()} title="Refazer (Ctrl+Shift+Z)" />

                    <div className="divider-v"></div>

                    <ToolBtn icon={<Copy className="w-4 h-4" />} onClick={handleCopyAll} title="Copiar Tudo" />
                </div>

                {/* Editor Content */}
                <div style={{ padding: '1.5rem', minHeight: '400px', fontSize: '0.95rem', lineHeight: 1.6 }} className="ProseMirror-wrapper">
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* Actions */}
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '1.5rem',
                flexWrap: 'wrap',
                padding: '1rem',
                background: 'var(--panel-bg)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border-color)',
            }}>
                <button
                    className={saved ? 'btn-primary' : 'btn-gradient'}
                    onClick={handleSave}
                    disabled={saving}
                    style={saved ? { background: 'var(--success)', cursor: 'default' } : {}}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {saving ? (
                            <><div className="sp-wave" style={{ width: 14, height: 14 }} /> Salvando...</>
                        ) : saved ? (
                            <><Check className="w-4 h-4" /> Salvo!</>
                        ) : (
                            <><Save className="w-4 h-4" /> Salvar Edições</>
                        )}
                    </span>
                </button>
                <button className="btn-secondary" onClick={() => handleGeneratePdf('preparatorio')} disabled={generating}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {generating ? (
                            <><div className="sp-wave" style={{ width: 14, height: 14 }} /> Gerando...</>
                        ) : (
                            <><FileText className="w-4 h-4" /> PDF Preparatório</>
                        )}
                    </span>
                </button>
                {hasFormal && (
                    <button className="btn-secondary" onClick={() => handleGeneratePdf('formal')} disabled={generating}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {generating ? (
                                <><div className="sp-wave" style={{ width: 14, height: 14 }} /> Gerando...</>
                            ) : (
                                <><FileCheck className="w-4 h-4" /> PDF Cartorário</>
                            )}
                        </span>
                    </button>
                )}
                <button className="btn-secondary" onClick={handleCopyAll}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Copy className="w-4 h-4" /> Copiar
                    </span>
                </button>
            </div>

            {/* Info box */}
            {!hasFormal && activeTab === 'preparatorio' && (
                <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem 1.25rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(59,130,246,0.2)',
                    background: 'var(--primary-glow)',
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                }}>
                    <Lightbulb className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--primary-color)' }} />
                    <div>
                        <strong style={{ color: 'var(--primary-color)' }}>Dica:</strong> Revise e aprove o material preparatório primeiro.
                        Quando estiver satisfeito, clique em <strong>Gerar Versão Cartorária</strong> acima para criar
                        a versão formal da ata notarial com linguagem apropriada de cartório.
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false })}
                onConfirm={confirmGenerateFormal}
                title="Gerar Versão Cartorária"
                message="Deseja gerar a versão cartorária (formal) da ata? Este processo utiliza IA avançada e pode levar alguns minutos."
                confirmText="Gerar Versão"
                variant="primary"
            />

            {/* Scroll button — only visible when page has scrollable content */}
            {hasScroll && (
                <button
                    onClick={toggleScroll}
                    style={{
                        position: 'fixed',
                        bottom: '2rem',
                        right: '2rem',
                        width: '2.75rem',
                        height: '2.75rem',
                        borderRadius: '50%',
                        background: 'var(--primary-color)',
                        color: '#fff',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px var(--primary-glow)',
                        transition: 'all 0.25s',
                        zIndex: 1000,
                        animation: 'fadeIn 0.3s ease-out',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px var(--primary-glow)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px var(--primary-glow)'; }}
                    title={isAtBottom ? "Voltar ao topo" : "Ir para o final"}
                >
                    {isAtBottom ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                </button>
            )}
        </div>
    );
}

function ToolBtn({ icon, active, onClick, title }) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                border: 'none',
                borderRadius: '0.375rem',
                background: active ? 'var(--primary-glow)' : 'transparent',
                color: active ? 'var(--primary-color)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                border: active ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
            }}
            onMouseOver={(e) => {
                if (!active) {
                    e.currentTarget.style.background = 'var(--surface-color)';
                    e.currentTarget.style.color = 'var(--text-main)';
                }
            }}
            onMouseOut={(e) => {
                if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                }
            }}
        >
            {icon}
        </button>
    );
}
