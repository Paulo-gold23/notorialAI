import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { Mark, mergeAttributes } from '@tiptap/core';
import { apiRequest } from '../services/api';

import BackButton from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import ErrorState from '../components/ErrorState';
import LegalFooter from '../components/LegalFooter';
import {
    FileText, Save, Check, ArrowDown, ArrowUp,
    Users, MessageSquare, Mic, CalendarRange,
    Coins, RefreshCw, X, PlusCircle, AlertTriangle, Phone,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, Lock
} from 'lucide-react';
import Logo from '../components/Logo';
import { supabase } from '../services/supabase';
import ResetSignaturePinModal from '../components/ResetSignaturePinModal';
import { getDeviceFingerprint } from '../services/fingerprint';

function normalizeEditorContent(value) {
    if (!value) return '<p>Conteúdo não disponível</p>';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof value.conteudo === 'string') return value.conteudo;
    return '<p>Conteúdo recebido em formato não suportado para edição.</p>';
}


const formatPhone = (val) => {
    let v = val.replace(/\D/g, '').substring(0, 11);
    if (v.length === 0) return '';
    if (v.length <= 2) return `(${v}`;
    if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
};

export const UserNote = Mark.create({
    name: 'userNote',
    
    addAttributes() {
        return {
            note: {
                default: null,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-user-note]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        if (!HTMLAttributes.note) {
            return ['span', mergeAttributes(HTMLAttributes, { 'data-user-note': '' }), 0];
        }
        return [
            'span',
            mergeAttributes(HTMLAttributes, { 
                'data-user-note': HTMLAttributes.note,
                class: 'user-note-wrapper', 
                style: 'background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 2px 4px; display: inline; line-height: 1.6; margin: 2px 0;' 
            }),
            ['span', { class: 'user-note-content', style: 'text-decoration: underline; text-decoration-style: dashed; text-decoration-color: #d97706;' }, 0],
            ['span', { class: 'user-note-label', style: 'color: #d97706; font-weight: bold; font-size: 0.85em; margin-left: 4px; user-select: none;' }, ` 📝 [Ressalva: ${HTMLAttributes.note}]`]
        ];
    },
});


export default function Review() {
    const { id } = useParams();
    const toast = useToast();

    const [ata, setAta] = useState(null);
    const [conteudo, setConteudo] = useState(null);
    const [activeTab, setActiveTab] = useState('preparatorio');
    const [reviewerName, setReviewerName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(false);
    const [hasScroll, setHasScroll] = useState(false);
    // termsModal: null | 'save' | 'pdf_preparatorio' | 'pdf_formal'
    const [termsModal, setTermsModal] = useState(null);
    const [termsChecked, setTermsChecked] = useState(false);
    
    // States for Signature PIN verification
    const [showPinConfirm, setShowPinConfirm] = useState(null); // callback to run on success
    const [pinInput, setPinInput] = useState(['', '', '', '']);
    const [pinError, setPinError] = useState('');
    const [verifyingPin, setVerifyingPin] = useState(false);
    const [showResetPinModal, setShowResetPinModal] = useState(false);
    const [isPinBlocked, setIsPinBlocked] = useState(false);
    // Credit report after PDF generation
    const [creditReport, setCreditReport] = useState(null);
    const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
    const [missingNumbersModal, setMissingNumbersModal] = useState({ isOpen: false, matches: [] });

    const tabsRef = useRef(null);
    // Callback ref that attaches copy-protection listeners as soon as the DOM node mounts.
    // A plain ref + useEffect won't work here because editorWrapperRef.current is not
    // a reactive value — changing it never triggers a re-render / effect re-run.
    const editorWrapperRef = useCallback((node) => {
        if (!node) return;

        const blockCopyAndCut = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const blockContext = (e) => e.preventDefault();

        const blockKeys = (e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            // Block Ctrl+C (copy), Ctrl+X (cut), Ctrl+A (select-all), Ctrl+U (view-source)
            if (ctrl && ['c', 'x', 'a', 'u'].includes(e.key.toLowerCase())) {
                // Allow Ctrl+A inside modal inputs/textareas
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Prevent drag-to-clipboard bypass
        const blockDrag = (e) => e.preventDefault();
        // Prevent selection API bypass (selection via triple-click, etc.)
        const blockSelect = (e) => e.preventDefault();

        node.addEventListener('copy',        blockCopyAndCut);
        node.addEventListener('cut',         blockCopyAndCut);
        node.addEventListener('contextmenu', blockContext);
        node.addEventListener('keydown',     blockKeys);
        node.addEventListener('dragstart',   blockDrag);
        node.addEventListener('selectstart', blockSelect);

        // Cleanup when the node unmounts (callback ref receives null)
        return () => {
            node.removeEventListener('copy',        blockCopyAndCut);
            node.removeEventListener('cut',         blockCopyAndCut);
            node.removeEventListener('contextmenu', blockContext);
            node.removeEventListener('keydown',     blockKeys);
            node.removeEventListener('dragstart',   blockDrag);
            node.removeEventListener('selectstart', blockSelect);
        };
    }, []);

    useEffect(() => {
        const checkScrollable = () => {
            const scrollable = document.documentElement.scrollHeight > window.innerHeight + 100;
            setHasScroll(scrollable);
        };
        
        const resizeObserver = new ResizeObserver(() => checkScrollable());
        resizeObserver.observe(document.body);
        checkScrollable();
        
        const bottomObserver = new IntersectionObserver(
            ([entry]) => setIsAtBottom(entry.isIntersecting),
            { rootMargin: '0px', threshold: 0.1 }
        );
        
        const sentinel = document.getElementById('bottom-sentinel');
        if (sentinel) bottomObserver.observe(sentinel);
        
        const timer = setTimeout(checkScrollable, 500);
        
        return () => {
            resizeObserver.disconnect();
            bottomObserver.disconnect();
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



    const editor = useEditor({
        editable: false,
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
                openOnClick: false,
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
                inline: true,
                allowBase64: true,
                HTMLAttributes: {
                    class: 'ata-imagem-anexada',
                },
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
            }),
            UserNote,
        ],
        content: '<p>Carregando conteúdo...</p>',
    });

    const handleAddNote = () => {
        if (!editor || editor.state.selection.empty) return;
        
        const noteText = window.prompt("Digite sua nota de ressalva para o texto selecionado:");
        if (noteText && noteText.trim() !== "") {
            editor.setOptions({ editable: true });
            
            // Re-focus the editor to ensure the transaction originates correctly
            editor.commands.focus();
            
            editor.chain().setMark('userNote', { note: noteText.trim() }).run();
            
            editor.setOptions({ editable: false });
            toast.success("Ressalva adicionada com sucesso!");
        }
    };

    const handleFillNumbers = () => {
        if (!editor) return;
        let html = editor.getHTML();
        if (!html.includes('[INSIRA NUMERO AQUI]')) {
            toast.info("Nenhum número faltante encontrado neste documento.");
            return;
        }

        const matches = [];
        const regex = /\[INSIRA NUMERO AQUI\]/g;
        let match;
        let indexCount = 0;
        
        while ((match = regex.exec(html)) !== null) {
            indexCount++;
            // Obtém um contexto maior antes da tag
            let start = Math.max(0, match.index - 120);
            let context = html.substring(start, match.index);
            
            // 1. Isola apenas o bloco de texto atual (corta parágrafos, cabeçalhos ou listas anteriores)
            const blockRegex = /<(?:p|li|br|h[1-6]|div|tr|td|th|ul|ol)[^>]*>|<\/(?:p|li|h[1-6]|div|tr|td|th|ul|ol|table|tbody)>/gi;
            let blocks = context.split(blockRegex);
            let currentBlockText = blocks[blocks.length - 1] || "";
            
            // 2. Substitui tags HTML (como strong, span) e entities por espaços
            let cleanContext = currentBlockText.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');
            
            // 3. Remove prefixos ou rótulos comuns caso estejam na mesma linha
            cleanContext = cleanContext.replace(/\b(participantes?|nomes?|locador(es)?|locatári[oa]s?|testemunhas?|outorgantes?|outorgados?|comprador(es)?|vendedor(es)?|cliente)\b/gi, ' ');
            
            // 4. Se pegou parte de um [INSIRA NUMERO AQUI] anterior, corta dali pra frente
            let lastBracket = cleanContext.lastIndexOf(']');
            if (lastBracket !== -1) {
                cleanContext = cleanContext.substring(lastBracket + 1);
            }
            
            // 5. Se houver dois pontos (ex: "Nome: "), pega só o que vem depois
            let lastColon = cleanContext.lastIndexOf(':');
            if (lastColon !== -1) {
                cleanContext = cleanContext.substring(lastColon + 1);
            }
            
            // 6. Divide em palavras limpas
            let nameParts = cleanContext.trim().split(/\s+/).filter(p => p.length > 0);
            
            // 7. Pega no máximo as últimas 4 palavras para comportar nomes maiores
            if (nameParts.length > 4) {
                nameParts = nameParts.slice(-4);
            }
            
            // 8. Remove pontuações indesejadas no começo e no fim
            let extractedName = nameParts.join(' ').replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ0-9]+/, '').replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ0-9]+$/, '').trim();
            
            matches.push({
                name: extractedName || `Participante ${indexCount}`,
                value: ''
            });
        }

        setMissingNumbersModal({ isOpen: true, matches });
    };

    const handleConfirmFillNumbers = () => {
        if (!editor) return;
        let updatedHtml = editor.getHTML();
        let count = 0;

        const { matches } = missingNumbersModal;
        for (const m of matches) {
            if (m.value && m.value.trim() !== '') {
                updatedHtml = updatedHtml.replace('[INSIRA NUMERO AQUI]', m.value.trim());
                count++;
            }
        }

        if (count > 0) {
            editor.setOptions({ editable: true });
            editor.commands.setContent(normalizeEditorContent(updatedHtml));
            editor.setOptions({ editable: false });
            toast.success(`${count} número(s) preenchido(s). Lembre-se de salvar o documento.`);
        }
        
        setMissingNumbersModal({ isOpen: false, matches: [] });
    };

    const handleAlign = (alignment) => {
        if (!editor) return;
        editor.setOptions({ editable: true });
        editor.commands.focus();
        editor.chain().setTextAlign(alignment).run();
        editor.setOptions({ editable: false });
    };


    const loadAta = useCallback(async () => {
        try {
            const ataData = await apiRequest(`/api/atas/${id}/preview`);
            setAta(ataData.ata);
            setConteudo(ataData.conteudo);

            // Fetch signature PIN status
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('advogados')
                    .select('senha_assinatura_bloqueado')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setIsPinBlocked(data.senha_assinatura_bloqueado);
                }
            }
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

    const triggerPinVerification = (callback) => {
        setPinInput(['', '', '', '']);
        setPinError('');
        setVerifyingPin(false);
        setShowPinConfirm(() => callback);
    };

    const handlePinVerifySubmit = async (e) => {
        if (e) e.preventDefault();
        setVerifyingPin(true);
        setPinError('');
        try {
            const fingerprint = await getDeviceFingerprint();
            const rawPin = pinInput.join('');
            
            if (rawPin.length !== 4) {
                setPinError('O PIN deve ter 4 dígitos.');
                setVerifyingPin(false);
                return;
            }

            await apiRequest('/api/auth/signature-pin/verify', {
                method: 'POST',
                body: JSON.stringify({
                    pin: rawPin,
                    device_fingerprint: fingerprint
                })
            });

            // If success, run callback and clear modal
            const callback = showPinConfirm;
            setShowPinConfirm(null);
            setPinInput(['', '', '', '']);
            if (callback) {
                await callback();
            }
        } catch (err) {
            setPinError(err.message || 'Senha de assinatura incorreta.');
            setPinInput(['', '', '', '']);
            if (err.message && err.message.includes('bloqueada')) {
                setIsPinBlocked(true);
            }
        } finally {
            setVerifyingPin(false);
        }
    };

    const handleSave = () => {
        if (hasAcceptedTerms) {
            triggerPinVerification(_doSave);
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

    const handleGeneratePdf = (tipo) => {
        if (hasAcceptedTerms) {
            triggerPinVerification(() => _doGeneratePdf(tipo));
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
                        pdfHash: data.pdf_hash || null,
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
        
        try {
            // Persiste aceite de termos no banco (T1.11)
            await apiRequest('/api/auth/accept-terms', { method: 'POST' });
            localStorage.setItem('legisvox_terms_accepted', 'true');
        } catch (err) {
            console.error('Falha ao registrar aceite de termos:', err);
        }

        if (action === 'save') {
            triggerPinVerification(_doSave);
        } else if (action === 'pdf_preparatorio') {
            triggerPinVerification(() => _doGeneratePdf('preparatorio'));
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
            </div>

            {/* Editor */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Minimal Toolbar since it's read-only */}
                <div className="sticky-toolbar" style={{
                    display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', flexWrap: 'wrap',
                    alignItems: 'center', background: 'var(--surface-color)', borderBottom: '1px solid var(--border-color)',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <AlertTriangle className="w-4 h-4" style={{ color: 'var(--accent-color)' }} />
                        <span>A edição livre está desativada para compliance.</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => handleAlign('left')}
                                style={{ padding: '0.4rem', border: 'none', borderRadius: 0, borderRight: '1px solid var(--border-color)', background: editor?.isActive({ textAlign: 'left' }) ? 'var(--bg-color)' : 'transparent' }}
                                title="Alinhar à Esquerda"
                            >
                                <AlignLeft className="w-4 h-4" />
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => handleAlign('center')}
                                style={{ padding: '0.4rem', border: 'none', borderRadius: 0, borderRight: '1px solid var(--border-color)', background: editor?.isActive({ textAlign: 'center' }) ? 'var(--bg-color)' : 'transparent' }}
                                title="Centralizar"
                            >
                                <AlignCenter className="w-4 h-4" />
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => handleAlign('right')}
                                style={{ padding: '0.4rem', border: 'none', borderRadius: 0, borderRight: '1px solid var(--border-color)', background: editor?.isActive({ textAlign: 'right' }) ? 'var(--bg-color)' : 'transparent' }}
                                title="Alinhar à Direita"
                            >
                                <AlignRight className="w-4 h-4" />
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => handleAlign('justify')}
                                style={{ padding: '0.4rem', border: 'none', borderRadius: 0, background: editor?.isActive({ textAlign: 'justify' }) ? 'var(--bg-color)' : 'transparent' }}
                                title="Justificar"
                            >
                                <AlignJustify className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            className="btn-secondary"
                            onClick={handleFillNumbers}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', color: 'var(--primary-color)' }}
                            title="Localiza as marcações '[INSIRA NUMERO AQUI]' e permite preenchê-las."
                        >
                            <Phone className="w-4 h-4" />
                            Preencher Números Faltantes
                        </button>
                    </div>
                </div>

                {/* Editor Content */}
                <div
                    ref={editorWrapperRef}
                    style={{
                        padding: '1.5rem',
                        minHeight: '400px',
                        fontSize: '0.95rem',
                        lineHeight: 1.6,
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                    }}
                    className="ProseMirror-wrapper"
                    onClick={(e) => {
                        // Intercept anchor clicks to handle internal (#) navigation
                        const anchor = e.target.closest('a[href]');
                        if (!anchor) return;
                        const href = anchor.getAttribute('href');
                        if (href && href.startsWith('#')) {
                            e.preventDefault();
                            // Find the target element by ID inside the editor wrapper
                            const targetId = href.slice(1);
                            const target = document.getElementById(targetId);
                            if (target) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        } else if (href) {
                            // External link — open in new tab safely
                            e.preventDefault();
                            window.open(href, '_blank', 'noopener,noreferrer');
                        }
                    }}
                >
                    {editor && (
                        <BubbleMenu 
                            editor={editor} 
                            tippyOptions={{ duration: 100, placement: 'top' }}
                            shouldShow={({ state, editor }) => {
                                const { from, to } = state.selection;
                                return from !== to && !editor.isActive('userNote');
                            }}
                        >
                            <button
                                onClick={handleAddNote}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: 'var(--panel-bg)',
                                    color: 'var(--text-main)',
                                    border: '1px solid var(--border-color)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <PlusCircle size={16} style={{ color: 'var(--primary-color)' }} />
                                Adicionar Ressalva
                            </button>
                        </BubbleMenu>
                    )}

                    <div
                        onCopy={(e) => {
                            e.preventDefault();
                            toast.error("Cópia de texto desativada por razões de segurança.");
                        }}
                        onCut={(e) => {
                            e.preventDefault();
                            toast.error("Corte de texto desativado por razões de segurança.");
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <EditorContent editor={editor} />
                    </div>
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
            }}
                className="review-actions"
            >
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
                            <><FileText className="w-4 h-4" /> Gerar PDF</>
                        )}
                    </span>
                </button>
            </div>



            {/* Missing Numbers Modal */}
            {missingNumbersModal.isOpen && (
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
                        maxWidth: '500px',
                        width: '100%',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        animation: 'slideUp 0.25s ease-out',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '0.6rem',
                                background: 'var(--primary-glow)',
                                border: '1px solid rgba(59,130,246,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--primary-color)', flexShrink: 0,
                            }}>
                                <Phone size={20} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Preencher Números Faltantes
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Insira os dados dos participantes pendentes
                                </p>
                            </div>
                        </div>

                        <div style={{ 
                            maxHeight: '350px', overflowY: 'auto', 
                            paddingRight: '0.5rem', marginBottom: '1.5rem',
                            display: 'flex', flexDirection: 'column', gap: '1rem'
                        }}>
                            {missingNumbersModal.matches.map((match, index) => (
                                <div key={index} style={{
                                    background: 'var(--surface-color)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.6rem',
                                    padding: '1rem',
                                }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
                                        {match.name}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="(00) 00000-0000"
                                        maxLength="15"
                                        value={match.value}
                                        onChange={(e) => {
                                            const newMatches = [...missingNumbersModal.matches];
                                            newMatches[index].value = formatPhone(e.target.value);
                                            setMissingNumbersModal({ ...missingNumbersModal, matches: newMatches });
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem 0.8rem',
                                            background: 'var(--panel-bg)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '0.4rem',
                                            color: 'var(--text-main)',
                                            fontSize: '0.9rem',
                                            outline: 'none',
                                            transition: 'border-color 0.2s',
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                                        onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                                    />
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => setMissingNumbersModal({ isOpen: false, matches: [] })}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-gradient"
                                onClick={handleConfirmFillNumbers}
                            >
                                <Check size={16} /> Confirmar Substituição
                            </button>
                        </div>
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
                            {creditReport.pdfHash && (
                                <div style={{
                                    marginTop: '0.75rem',
                                    paddingTop: '0.75rem',
                                    borderTop: '1px dashed var(--border-color)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>SHA-256 do PDF:</span>
                                        <span
                                            title={creditReport.pdfHash}
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.7rem',
                                                color: 'var(--text-muted)',
                                                wordBreak: 'break-all',
                                                textAlign: 'right',
                                                cursor: 'help',
                                            }}
                                        >
                                            {creditReport.pdfHash.slice(0, 16)}…{creditReport.pdfHash.slice(-8)}
                                        </span>
                                    </div>
                                </div>
                            )}
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
            {/* Signature PIN Verification Modal */}
            {showPinConfirm && (
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
                        maxWidth: '400px',
                        width: '100%',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        animation: 'slideUp 0.25s ease-out',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '0.6rem',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))',
                                border: '1px solid rgba(59,130,246,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--primary-color)', flexShrink: 0,
                            }}>
                                <Lock size={20} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Assinatura Eletrônica
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Confirme sua identidade com seu PIN
                                </p>
                            </div>
                        </div>

                        {isPinBlocked ? (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    color: 'var(--danger, #ef4444)',
                                    fontSize: '0.82rem',
                                    lineHeight: 1.4,
                                    marginBottom: '1rem',
                                }}>
                                    ⚠️ Sua senha de assinatura está bloqueada por excesso de tentativas incorretas. Por favor, redefina-a por e-mail para continuar.
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => setShowPinConfirm(null)}
                                        style={{ flex: 1 }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        className="btn-gradient"
                                        onClick={() => {
                                            setShowPinConfirm(null);
                                            setShowResetPinModal(true);
                                        }}
                                        style={{ flex: 2 }}
                                    >
                                        Redefinir PIN por E-mail
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handlePinVerifySubmit}>
                                {pinError && (
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
                                    }}>
                                        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                        {pinError}
                                    </div>
                                )}

                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
                                        PIN de 4 dígitos
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                        {pinInput.map((digit, idx) => (
                                            <input
                                                key={`verify-pin-${idx}`}
                                                type="password"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                maxLength={1}
                                                value={digit}
                                                disabled={verifyingPin}
                                                onChange={(e) => {
                                                    const cleanVal = e.target.value.replace(/\D/g, '').slice(-1);
                                                    const newPin = [...pinInput];
                                                    if (cleanVal) {
                                                        newPin[idx] = cleanVal;
                                                        setPinInput(newPin);
                                                        // Auto focus next input
                                                        if (idx < 3) {
                                                            const nextInput = e.target.nextElementSibling;
                                                            if (nextInput) nextInput.focus();
                                                        }
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Backspace') {
                                                        e.preventDefault();
                                                        const newPin = [...pinInput];
                                                        if (newPin[idx]) {
                                                            newPin[idx] = '';
                                                            setPinInput(newPin);
                                                        } else if (idx > 0) {
                                                            const prevInput = e.target.previousElementSibling;
                                                            if (prevInput) {
                                                                prevInput.focus();
                                                                newPin[idx - 1] = '';
                                                                setPinInput(newPin);
                                                            }
                                                        }
                                                    }
                                                }}
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
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPinConfirm(null);
                                            setShowResetPinModal(true);
                                        }}
                                        className="btn-ghost text-xs"
                                        style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
                                    >
                                        Esqueci meu PIN
                                    </button>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowPinConfirm(null)}
                                            className="btn-secondary"
                                            disabled={verifyingPin}
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn-gradient"
                                            disabled={verifyingPin || pinInput.some(d => d === '')}
                                            style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                                        >
                                            {verifyingPin ? 'Verificando...' : 'Assinar Documento'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Reset Signature PIN Modal */}
            {showResetPinModal && (
                <ResetSignaturePinModal 
                    onClose={() => setShowResetPinModal(false)}
                    onSuccess={() => {
                        setShowResetPinModal(false);
                        setIsPinBlocked(false);
                        // Re-trigger the verification prompt for the action
                        if (showPinConfirm) {
                            triggerPinVerification(showPinConfirm);
                        }
                    }}
                />
            )}

            <div id="bottom-sentinel" style={{ height: '1px', width: '100%' }} />
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
