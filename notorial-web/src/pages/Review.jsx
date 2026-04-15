import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link'
import Heading from '@tiptap/extension-heading'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { apiRequest } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import BackButton from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import ErrorState from '../components/ErrorState';
import LegalFooter from '../components/LegalFooter';
import {
    FileText, FileCheck, Plus, Save, Check, Bold, Italic, Strikethrough,
    Heading1, Heading2, List, ListOrdered, Undo, Redo, ArrowDown, ArrowUp,
    Copy, Lightbulb, Users, MessageSquare, Mic, CalendarRange,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Coins, RefreshCw, Wallet, X,
} from 'lucide-react';
import Logo from '../components/Logo';
import { supabase } from '../services/supabase';

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
    const [reviewerName, setReviewerName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatingFormal, setGeneratingFormal] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [isAtBottom, setIsAtBottom] = useState(false);
    const [hasScroll, setHasScroll] = useState(false);
    // termsModal: null | 'save' | 'pdf_preparatorio' | 'pdf_formal'
    const [termsModal, setTermsModal] = useState(null);
    const [termsChecked, setTermsChecked] = useState(false);
    // Credit report after PDF generation
    const [creditReport, setCreditReport] = useState(null);
    const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

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
            Image.configure({
                allowBase64: true,
                HTMLAttributes: {
                    class: 'ata-imagem-anexada',
                },
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
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
            toast.error('Erro ao carregar os dados do documento.');
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    // Carrega nome do usuário logado para o rodapé do PDF
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
                const name =
                    data.user.user_metadata?.nome ||
                    data.user.user_metadata?.full_name ||
                    data.user.email ||
                    '';
                setReviewerName(name);
            }
        });
    }, []);

    useEffect(() => {
        loadAta();
    }, [loadAta]);

    useEffect(() => {
        if (!conteudo || !editor) return;
        const raw = activeTab === 'formal' ? conteudo.conteudo_formal : conteudo.conteudo_preparatorio;
        editor.commands.setContent(normalizeEditorContent(raw));
    }, [activeTab, conteudo, editor]);

    const handleSave = () => {
        if (hasAcceptedTerms) {
            _doSave();
        } else {
            setTermsChecked(false);
            setTermsScrolledToBottom(false);
            setTermsModal('save');
        }
    };

    const _doSave = async () => {
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

    const handleGeneratePdf = (tipo) => {
        if (hasAcceptedTerms) {
            _doGeneratePdf(tipo);
        } else {
            // Abre modal de termos antes de gerar o PDF
            setTermsChecked(false);
            setTermsScrolledToBottom(false);
            setTermsModal(`pdf_${tipo}`);
        }
    };

    // Stores the generated PDF blob URL for the credit report modal's "Ver PDF" button
    const pdfBlobUrlRef = useRef(null);

    const handleOpenPdf = () => {
        if (pdfBlobUrlRef.current) {
            const a = document.createElement('a');
            a.href = pdfBlobUrlRef.current;
            a.download = `legisvox_documento_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        setCreditReport(null);
    };

    const _doGeneratePdf = async (tipo) => {
        setGenerating(true);
        try {
            const data = await apiRequest(`/api/atas/${id}/generate-pdf`, {
                method: 'POST',
                body: JSON.stringify({
                    tipo,
                    conteudo: editor.getHTML(),
                    reviewer_name: reviewerName,
                }),
            });
            if (data.pdf_url) {
                const { getAuthHeaderForDownload } = await import('../services/api');
                const headers = await getAuthHeaderForDownload();
                const pdfResponse = await fetch(data.pdf_url, { headers });
                if (!pdfResponse.ok) throw new Error('Erro ao baixar o PDF gerado.');
                const blob = await pdfResponse.blob();
                const blobUrl = URL.createObjectURL(blob);
                pdfBlobUrlRef.current = blobUrl;

                // Auto-revoke after 5 minutes
                setTimeout(() => {
                    if (pdfBlobUrlRef.current === blobUrl) {
                        URL.revokeObjectURL(blobUrl);
                        pdfBlobUrlRef.current = null;
                    }
                }, 300000);

                // Show credit report with PDF data
                const hasReport = data.actual_pages || data.estimated_pages;
                if (hasReport) {
                    setCreditReport({
                        estimated: data.estimated_pages || 0,
                        actual: data.actual_pages || data.estimated_pages || 0,
                        creditsUsed: data.credits_used || 0,
                        refunded: data.refunded_credits || 0,
                        balanceAfter: data.balance_after,
                        pdfTipo: tipo,
                    });
                } else {
                    // Fallback: download PDF directly if no credit data
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `legisvox_documento_${id}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    toast.success('PDF gerado com sucesso!');
                }
            }
        } catch (err) {
            toast.error('Erro ao gerar PDF: ' + err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleTermsConfirm = async () => {
        const action = termsModal;
        setTermsModal(null);
        setTermsChecked(false);
        setHasAcceptedTerms(true);
        // Descomentar para persistir a flag:
        // localStorage.setItem('legisvox_terms_accepted', 'true');

        if (action === 'save') {
            await _doSave();
        } else if (action === 'pdf_preparatorio') {
            await _doGeneratePdf('preparatorio');
        } else if (action === 'pdf_formal') {
            await _doGeneratePdf('formal');
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
                    <Logo size={32} /> {ata?.titulo || 'Revisão do Documento'}
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
                        Versão Cartorária
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

                    <ToolBtn icon={<AlignLeft className="w-4 h-4" />} active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Alinhar à Esquerda" />
                    <ToolBtn icon={<AlignCenter className="w-4 h-4" />} active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Centralizar" />
                    <ToolBtn icon={<AlignRight className="w-4 h-4" />} active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Alinhar à Direita" />
                    <ToolBtn icon={<AlignJustify className="w-4 h-4" />} active={editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()} title="Justificar" />

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
                <button
                    className="btn-secondary"
                    onClick={() => handleGeneratePdf('preparatorio')}
                    disabled={generating}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {generating ? (
                            <><div className="sp-wave" style={{ width: 14, height: 14 }} /> Gerando...</>
                        ) : (
                            <><FileText className="w-4 h-4" /> PDF Preparatório</>
                        )}
                    </span>
                </button>
                {hasFormal && (
                    <button
                        className="btn-secondary"
                        onClick={() => handleGeneratePdf('formal')}
                        disabled={generating}
                    >
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
                        a versão formal do documento com linguagem apropriada de cartório.
                    </div>
                </div>
            )}

            {/* Terms Modal */}
            {termsModal && (
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
                        maxWidth: '540px',
                        width: '100%',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        animation: 'slideUp 0.25s ease-out',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '0.6rem',
                                background: 'var(--primary-glow)',
                                border: '1px solid rgba(59,130,246,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--primary-color)', flexShrink: 0,
                            }}>
                                <FileText size={20} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Termo de Responsabilidade
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Leia e aceite antes de continuar
                                </p>
                            </div>
                        </div>

                        <div 
                            ref={(el) => {
                                if (el && el.scrollHeight <= el.clientHeight) {
                                    setTermsScrolledToBottom(true);
                                }
                            }}
                            onScroll={(e) => {
                                const { scrollTop, scrollHeight, clientHeight } = e.target;
                                if (Math.ceil(scrollTop + clientHeight) >= scrollHeight - 20) {
                                    setTermsScrolledToBottom(true);
                                }
                            }}
                            style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.6rem',
                            padding: '1.1rem 1.25rem',
                            fontSize: '0.82rem',
                            lineHeight: 1.6,
                            color: 'var(--text-main)',
                            marginBottom: '1.25rem',
                            maxHeight: '260px',
                            overflowY: 'auto',
                            scrollBehavior: 'smooth',
                        }}>
                            <p style={{ margin: '0 0 0.75rem', fontWeight: 700, textAlign: 'center' }}>TERMO DE RESPONSABILIDADE, CONFORMIDADE E DECLARAÇÃO DE VERACIDADE</p>
                            <p style={{ margin: '0 0 0.75rem', textAlign: 'justify' }}>
                                Ao confirmar a geração deste documento, o responsável pela presente ação declara expressamente que:
                            </p>
                            <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'justify' }}>
                                <li><strong>Revisão e Validação Integral:</strong> Realizou a conferência exaustiva de todo o conteúdo exibido no editor, atestando a veracidade, completude, integridade e fidelidade das informações apresentadas em relação aos fatos e dados reais.</li>
                                <li><strong>Ciência de Processamento Automatizado:</strong> Compreende que o documento é fruto de processamento tecnológico e transcrições automáticas, estando ciente de que tais ferramentas podem apresentar imprecisões. Reconhece que a validação final e a correção de eventuais erros são deveres indelegáveis do usuário.</li>
                                <li><strong>Responsabilidade Plena (Civil, Administrativa e Criminal):</strong> Assume integral e exclusiva responsabilidade civil, administrativa e criminal, ética e profissional pelo conteúdo e pelo uso do documento gerado. Declara-se ciente de que a inserção de informações falsas ou a omissão de dados relevantes pode configurar ilícitos (como falsidade ideológica), isentando os desenvolvedores de qualquer solidariedade por danos ou irregularidades.</li>
                                <li><strong>Controle de Dados e LGPD:</strong> Declara-se, para fins da Lei nº 13.709/2018 (LGPD), como o único Controlador dos dados inseridos, garantindo possuir base legal ou consentimento explícito para o tratamento de dados de terceiros, eximindo a plataforma de responsabilidade sobre a origem ou legitimidade desses dados.</li>
                                <li><strong>Sigilo e Confidencialidade:</strong> Compromete-se a manter o sigilo sobre informações sensíveis contidas no documento, declarando que possui autorização hierárquica ou legal para o processamento de tais dados em ambiente digital.</li>
                                <li><strong>Dever de Indenização:</strong> Obriga-se a manter a plataforma e seus desenvolvedores indenes de qualquer prejuízo, comprometendo-se a ressarcir quaisquer custos, honorários ou indenizações decorrentes de ações judiciais ou administrativas causadas pelo uso indevido deste documento.</li>
                                <li><strong>Irretratabilidade e Registro de Autoria:</strong> Reconhece que este aceite eletrônico é irretratável e será vinculado ao documento final, servindo como prova de autoria, revisão e concordância irrestrita com todos os termos aqui descritos.</li>
                            </ol>
                        </div>

                        <label style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            cursor: termsScrolledToBottom ? 'pointer' : 'not-allowed', marginBottom: '1.5rem',
                            padding: '0.9rem 1rem',
                            background: termsChecked ? 'rgba(59,130,246,0.08)' : 'var(--surface-color)',
                            border: `1px solid ${termsChecked ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`,
                            borderRadius: '0.6rem',
                            transition: 'all 0.2s',
                            opacity: termsScrolledToBottom ? 1 : 0.6,
                        }}>
                            <input
                                type="checkbox"
                                checked={termsChecked}
                                disabled={!termsScrolledToBottom}
                                onChange={e => setTermsChecked(e.target.checked)}
                                style={{ width: '1.1rem', height: '1.1rem', marginTop: '0.1rem', accentColor: 'var(--primary-color)', flexShrink: 0, cursor: termsScrolledToBottom ? 'pointer' : 'not-allowed' }}
                            />
                            <span style={{ fontSize: '0.88rem', lineHeight: 1.4, color: termsScrolledToBottom ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                {termsScrolledToBottom 
                                    ? "Li, compreendi e aceito os termos acima, assumindo total responsabilidade pelo conteúdo a ser gerado."
                                    : "Role a barra de texto acima até o final para liberar o aceite."}
                            </span>
                        </label>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => { setTermsModal(null); setTermsChecked(false); }}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-gradient"
                                disabled={!termsChecked}
                                onClick={handleTermsConfirm}
                                style={{ opacity: termsChecked ? 1 : 0.5, cursor: termsChecked ? 'pointer' : 'not-allowed' }}
                            >
                                {termsModal === 'save' ? (
                                    <><Save size={15} /> Aceitar e Salvar</>
                                ) : (
                                    <><FileText size={15} /> Aceitar e Gerar PDF</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Credit Report Modal */}
            {creditReport && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                    animation: 'fadeIn 0.2s ease-out',
                }}>
                    <div style={{
                        background: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '1rem',
                        padding: '2rem',
                        maxWidth: '440px',
                        width: '100%',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        animation: 'slideUp 0.3s ease-out',
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '0.7rem',
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(16,185,129,0.15))',
                                    border: '1px solid rgba(59,130,246,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--primary-color)', flexShrink: 0,
                                }}>
                                    <Coins size={22} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                        Relatório de Créditos
                                    </h2>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        PDF gerado com sucesso
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCreditReport(null)}
                                style={{
                                    background: 'var(--surface-color)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.5rem',
                                    width: 32, height: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'var(--text-muted)',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                                onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Stats Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: creditReport.refunded > 0 ? '1fr 1fr' : '1fr 1fr',
                            gap: '0.75rem',
                            marginBottom: '1.25rem',
                        }}>
                            {/* Créditos Cobrados */}
                            <div style={{
                                padding: '1rem',
                                borderRadius: '0.75rem',
                                background: 'var(--surface-color)',
                                border: '1px solid var(--border-color)',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'rgba(59,130,246,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 0.5rem',
                                    color: 'var(--primary-color)',
                                }}>
                                    <Coins size={18} />
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-color)', lineHeight: 1 }}>
                                    {creditReport.estimated}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                    Créditos Cobrados
                                </div>
                            </div>

                            {/* Páginas Geradas */}
                            <div style={{
                                padding: '1rem',
                                borderRadius: '0.75rem',
                                background: 'var(--surface-color)',
                                border: '1px solid var(--border-color)',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'rgba(16,185,129,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 0.5rem',
                                    color: 'var(--success)',
                                }}>
                                    <FileText size={18} />
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>
                                    {creditReport.actual || '?'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                    Páginas no PDF
                                </div>
                            </div>

                            {/* Reembolso (condicional) */}
                            {creditReport.refunded > 0 && (
                                <div style={{
                                    padding: '1rem',
                                    borderRadius: '0.75rem',
                                    background: 'rgba(250,204,21,0.06)',
                                    border: '1px solid rgba(250,204,21,0.2)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'rgba(250,204,21,0.15)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 0.5rem',
                                        color: '#eab308',
                                    }}>
                                        <RefreshCw size={18} />
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308', lineHeight: 1 }}>
                                        +{creditReport.refunded}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                                        Devolvidos
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{
                            background: 'var(--surface-color)', padding: '1rem',
                            borderRadius: '0.6rem', border: '1px solid var(--border-color)',
                            marginBottom: '1rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Páginas do PDF:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{creditReport.actual} páginas</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px dashed var(--border-color)', marginBottom: '0.75rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Custo Exato:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{creditReport.actual} créditos</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Meu Saldo:</span>
                                <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{Math.floor(creditReport.balanceAfter)} créditos</span>
                            </div>
                        </div>

                        {/* Note about precision adjustment */}
                        <div style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '0.6rem',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            fontSize: '0.8rem',
                            color: 'var(--primary-color)',
                            textAlign: 'center',
                            marginBottom: '1.25rem',
                        }}>
                            💡 O ajuste matemático já foi realizado na sua reserva. Você pagou exatamente pelas {creditReport.actual} páginas do documento.
                        </div>

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => setCreditReport(null)}
                                style={{ flex: 1, justifyContent: 'center' }}
                            >
                                Fechar
                            </button>
                            <button
                                className="btn-gradient"
                                onClick={() => {
                                    handleOpenPdf();
                                }}
                                autoFocus
                                style={{ flex: 2, justifyContent: 'center' }}
                            >
                                <FileText size={16} /> Baixar PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false })}
                onConfirm={confirmGenerateFormal}
                title="Gerar Versão Cartorária"
                message="Deseja gerar a versão cartorária (formal) do documento? Este processo utiliza IA avançada e pode levar alguns minutos."
                confirmText="Gerar Versão"
                variant="primary"
            />

            {/* PDF Generation Overlay */}
            {generating && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: '1.5rem',
                    animation: 'fadeIn 0.3s ease-out',
                }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="sp-wave" style={{ width: 24, height: 24 }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                            Gerando PDF...
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
                            Isso pode levar alguns segundos. Não feche esta janela.
                        </p>
                    </div>
                </div>
            )}

            {/* Formal Version Generation Overlay */}
            {generatingFormal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: '1.5rem',
                    animation: 'fadeIn 0.3s ease-out',
                }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'rgba(167, 139, 250, 0.15)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="sp-wave" style={{ width: 24, height: 24 }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                            Gerando Versão Cartorária...
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0, maxWidth: '380px' }}>
                            A IA está convertendo o material preparatório em linguagem jurídica formal. Isso pode levar 1-3 minutos.
                        </p>
                    </div>
                </div>
            )}

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
            <LegalFooter style={{ marginTop: '2rem' }} />
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
