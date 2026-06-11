import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { apiRequest } from '../services/api';
import { UserNote, extractRessalvas } from '../extensions/UserNote';

import BackButton from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import ErrorState from '../components/ErrorState';
import LegalFooter from '../components/LegalFooter';
import {
    FileText, Save, Check, ArrowDown, ArrowUp,
    Users, MessageSquare, Mic, CalendarRange,
    Coins, RefreshCw, X, AlertTriangle, Phone,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, Lock,
    StickyNote, Pencil, Trash2
} from 'lucide-react';
import Logo from '../components/Logo';
import { supabase } from '../services/supabase';
import ResetSignaturePinModal from '../components/ResetSignaturePinModal';
import SignaturePinSetupModal from '../components/SignaturePinPromptModal';
import TermsAcceptanceModal from '../components/review/TermsAcceptanceModal';
import PinVerificationModal from '../components/review/PinVerificationModal';
import CreditReportModal from '../components/review/CreditReportModal';
import MissingNumbersModal from '../components/review/MissingNumbersModal';

function normalizeEditorContent(value) {
    if (!value) return '<p>Conteúdo não disponível</p>';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof value.conteudo === 'string') return value.conteudo;
    return '<p>Conteúdo recebido em formato não suportado para edição.</p>';
}



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
    
    // States for Signature PIN verification
    const [showPinConfirm, setShowPinConfirm] = useState(null); // callback to run on success
    const [showResetPinModal, setShowResetPinModal] = useState(false);
    const [isPinBlocked, setIsPinBlocked] = useState(false);
    const [hasPinConfigured, setHasPinConfigured] = useState(true); // assume true until loaded
    const [showPinSetup, setShowPinSetup] = useState(false); // for first-time PIN creation
    const [pendingPinCallback, setPendingPinCallback] = useState(null); // callback after setup
    // Credit report after PDF generation
    const [creditReport, setCreditReport] = useState(null);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
    const [missingNumbersModal, setMissingNumbersModal] = useState({ isOpen: false, matches: [] });

    // ── Ressalvas state ───────────────────────────────────────────────────────
    const [ressalvas, setRessalvas] = useState([]);
    const [activeRessalvaId, setActiveRessalvaId] = useState(null);
    // noteForm: null | { mode: 'add'|'edit', excerpt: string, editId?: number }
    const [noteForm, setNoteForm] = useState(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    // annotationMode: when true, editor is temporarily editable and listens for mouse selection
    const [annotationMode, setAnnotationMode] = useState(false);
    const savedSelectionRef = useRef(null);
    const [showConfirmButton, setShowConfirmButton] = useState(false);
    const [buttonPosition, setButtonPosition] = useState({ top: 0, left: 0 });

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
        const blockDrag = (e) => {
            if (node.classList.contains('is-annotation-mode')) return;
            e.preventDefault();
        };
        // Prevent selection API bypass (selection via triple-click, etc.)
        const blockSelect = (e) => {
            if (node.classList.contains('is-annotation-mode')) return;
            e.preventDefault();
        };

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

    // ── Sync ressalvas list whenever editor content changes ────────────────────
    // Only listen to 'update' (when content/marks change) to prevent selectionUpdate lag in large documents
    useEffect(() => {
        if (!editor) return;
        const update = () => setRessalvas(extractRessalvas(editor));
        editor.on('update', update);
        update();
        return () => {
            editor.off('update', update);
        };
    }, [editor]);

    // ── Annotation mode: activate → user selects via mouse → form opens ────────
    // Strategy: keep editor ALWAYS non-editable (no text editing allowed).
    // Use CSS user-select:text to allow mouse selection, then read the native
    // browser selection with window.getSelection() + view.posAtDOM to convert
    // to TipTap positions. This avoids the "free editing" problem entirely.

    const handleActivateAnnotationMode = () => {
        if (!editor) return;
        // Clear any leftover browser selection
        window.getSelection()?.removeAllRanges();
        setAnnotationMode(true);
        setNoteForm(null);
        savedSelectionRef.current = null;
        setShowConfirmButton(false);
        // Do NOT make editor editable — CSS handles selection
    };

    const handleCancelAnnotationMode = () => {
        window.getSelection()?.removeAllRanges();
        setAnnotationMode(false);
        savedSelectionRef.current = null;
        setShowConfirmButton(false);
    };

    // Automatically toggle contentEditable on ProseMirror DOM is removed to prevent
    // browser-vs-ProseMirror selection fights and infinite focus redraw loops.
    // CSS user-select: text handles selection, and contentEditable="false" natively blocks editing.

    useEffect(() => {
        if (!annotationMode || !editor) return;

        let editorDom = null;
        try {
            editorDom = editor.view.dom;
        } catch {
            // View not ready/mounted yet - ignore silently
            return;
        }
        if (!editorDom) return;

        let selectionTimeout = null;
        let frameId = null;

        const handleSelectionChange = () => {
            if (selectionTimeout) clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                const nativeSel = window.getSelection();
                if (!nativeSel || nativeSel.isCollapsed || nativeSel.rangeCount === 0) {
                    setShowConfirmButton(false);
                    return;
                }

                const selectedText = nativeSel.toString().trim();
                if (selectedText.length < 2) {
                    setShowConfirmButton(false);
                    return; // ignore accidental single-char clicks
                }

                // Make sure the selection is actually inside the editor
                const range = nativeSel.getRangeAt(0);
                if (!editorDom.contains(range.commonAncestorContainer)) {
                    setShowConfirmButton(false);
                    return;
                }

                // Convert native DOM range → TipTap document positions
                let from, to;
                try {
                    from = editor.view.posAtDOM(range.startContainer, range.startOffset);
                    to   = editor.view.posAtDOM(range.endContainer,   range.endOffset);
                } catch {
                    setShowConfirmButton(false);
                    return; // DOM node not in the ProseMirror doc — ignore
                }

                if (from >= to) {
                    setShowConfirmButton(false);
                    return;
                }

                const bounds = range.getBoundingClientRect();
                setButtonPosition({
                    top: bounds.top - 8,
                    left: bounds.left + (bounds.width / 2),
                });

                const excerpt = selectedText.slice(0, 80) + (selectedText.length > 80 ? '...' : '');
                savedSelectionRef.current = { from, to, excerpt };
                setShowConfirmButton(true);
            }, 100);
        };

        const handleScrollOrResize = () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                const nativeSel = window.getSelection();
                if (!nativeSel || nativeSel.isCollapsed || nativeSel.rangeCount === 0) {
                    setShowConfirmButton(false);
                    return;
                }
                try {
                    const range = nativeSel.getRangeAt(0);
                    if (!editorDom.contains(range.commonAncestorContainer)) {
                        setShowConfirmButton(false);
                        return;
                    }
                    const bounds = range.getBoundingClientRect();
                    // If selection is completely scrolled out of the viewport, hide the button
                    if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
                        setShowConfirmButton(false);
                        return;
                    }
                    setButtonPosition({
                        top: bounds.top - 8,
                        left: bounds.left + (bounds.width / 2),
                    });
                } catch {
                    setShowConfirmButton(false);
                }
            });
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        window.addEventListener('scroll', handleScrollOrResize);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            if (selectionTimeout) clearTimeout(selectionTimeout);
            if (frameId) cancelAnimationFrame(frameId);
            document.removeEventListener('selectionchange', handleSelectionChange);
            window.removeEventListener('scroll', handleScrollOrResize);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [annotationMode, editor]);

    const handleConfirmSelection = () => {
        if (!savedSelectionRef.current) return;
        const { excerpt } = savedSelectionRef.current;
        setShowConfirmButton(false);
        setNoteForm({ mode: 'add', excerpt });
        setSheetOpen(true);
    };


    const handleSaveNote = (noteText) => {
        if (!noteText || !noteText.trim() || !editor) return;
        const trimmedNote = noteText.trim();
        // Briefly enable editing, apply the mark, then lock again
        editor.setOptions({ editable: true });
        if (noteForm.mode === 'add' && savedSelectionRef.current) {
            const { from, to } = savedSelectionRef.current;
            editor.chain().focus().setTextSelection({ from, to }).setMark('userNote', { note: trimmedNote }).run();
            savedSelectionRef.current = null;
            toast.success('Ressalva adicionada com sucesso!');
        } else if (noteForm.mode === 'edit' && noteForm.editId !== undefined) {
            const r = ressalvas[noteForm.editId];
            if (r) {
                editor.chain().focus().setTextSelection({ from: r.pos, to: r.pos + r.nodeSize }).setMark('userNote', { note: trimmedNote }).run();
            }
            toast.success('Ressalva atualizada!');
        }
        editor.setOptions({ editable: false });
        window.getSelection()?.removeAllRanges();
        setNoteForm(null);
    };

    const handleEditNote = (idx) => {
        const r = ressalvas[idx];
        if (!r) return;
        setNoteForm({ mode: 'edit', excerpt: r.excerpt, editId: idx });
        setSheetOpen(true);
    };

    const handleDeleteNote = (idx) => {
        const r = ressalvas[idx];
        if (!r || !editor) return;
        editor.setOptions({ editable: true });
        editor.chain().focus().setTextSelection({ from: r.pos, to: r.pos + r.nodeSize }).unsetMark('userNote').run();
        editor.setOptions({ editable: false });
        setActiveRessalvaId(null);
        toast.success('Ressalva removida.');
    };

    const handleRessalvaCardClick = (idx) => {
        const r = ressalvas[idx];
        if (!r || !editor) return;
        setActiveRessalvaId(idx);
        editor.commands.setTextSelection({ from: r.pos, to: r.pos + r.nodeSize });
        const domNode = editor.view.domAtPos(r.pos)?.node;
        if (domNode?.parentElement) {
            domNode.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const handleRessalvaClickFromText = (idx) => {
        setActiveRessalvaId(idx);
        // Scroll desktop sidebar card into view
        const desktopCard = document.getElementById(`ressalva-card-desktop-${idx}`);
        if (desktopCard) {
            desktopCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            desktopCard.classList.add('is-active-focus');
            setTimeout(() => {
                desktopCard.classList.remove('is-active-focus');
            }, 1500);
        }
        // Scroll mobile bottom sheet card into view
        const mobileCard = document.getElementById(`ressalva-card-mobile-${idx}`);
        if (mobileCard) {
            mobileCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            mobileCard.classList.add('is-active-focus');
            setTimeout(() => {
                mobileCard.classList.remove('is-active-focus');
            }, 1500);
        }
    };

    const handleCancelNoteForm = () => {
        savedSelectionRef.current = null;
        window.getSelection()?.removeAllRanges();
        setNoteForm(null);
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
                    .select('senha_assinatura_bloqueado, senha_assinatura_hash')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setIsPinBlocked(data.senha_assinatura_bloqueado);
                    setHasPinConfigured(!!data.senha_assinatura_hash);
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
        if (!hasPinConfigured) {
            // User has no PIN yet — show setup modal first
            setPendingPinCallback(() => callback);
            setShowPinSetup(true);
        } else {
            setShowPinConfirm(() => callback);
        }
    };

    const handleSave = () => {
        if (hasAcceptedTerms) {
            triggerPinVerification(_doSave);
        } else {
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
                        pdfUrl: blobUrl,
                        id: id,
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

            {/* ── Two-column layout: Editor + Sidebar ── */}
            <div className="review-with-sidebar">

            {/* ── Editor area ── */}
            <div className="review-editor-area">
            {/* Editor card */}
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
                    
                    <div className="toolbar-actions-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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

                        {/* ── Ressalva button ── */}
                        <button
                            id="btn-adicionar-ressalva"
                            className="btn-secondary"
                            onClick={handleActivateAnnotationMode}
                            disabled={annotationMode}
                            style={{
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.85rem',
                                color: annotationMode ? '#fff' : '#d97706',
                                borderColor: '#d97706',
                                background: annotationMode ? '#d97706' : 'transparent',
                                fontWeight: 600,
                            }}
                            title="Ativa o modo de anotação: selecione um trecho do documento para adicionar uma ressalva"
                        >
                            <StickyNote className="w-4 h-4" />
                            {annotationMode ? 'Selecionando...' : '+ Adicionar Ressalva'}
                        </button>
                    </div>
                </div>

                {/* ── Annotation mode banner ── */}
                {annotationMode && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 1rem',
                        background: 'rgba(217,119,6,0.1)',
                        borderBottom: '1px solid rgba(217,119,6,0.3)',
                        fontSize: '0.83rem',
                        color: '#92400e',
                        fontWeight: 500,
                        gap: '1rem',
                        animation: 'slideUp 0.2s ease-out',
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <StickyNote size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                            <strong>Modo de Anotação Ativo</strong> — Selecione o trecho no documento que deseja ressalvar
                        </span>
                        <button
                            onClick={handleCancelAnnotationMode}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#92400e',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.78rem',
                                padding: '0.2rem 0.4rem',
                                borderRadius: '0.3rem',
                            }}
                            title="Concluir e sair do modo de anotação (Esc)"
                        >
                            <Check size={13} /> Concluir (Sair)
                        </button>
                    </div>
                )}

                {/* Editor Content */}
                <div
                    ref={editorWrapperRef}
                    style={{
                        padding: '1.5rem',
                        minHeight: '400px',
                        fontSize: '0.95rem',
                        lineHeight: 1.6,
                        // Allow text selection only during annotation mode
                        userSelect: annotationMode ? 'text' : 'none',
                        WebkitUserSelect: annotationMode ? 'text' : 'none',
                        cursor: annotationMode ? 'text' : 'default',
                    }}
                    className={`ProseMirror-wrapper${annotationMode ? ' is-annotation-mode' : ''}`}
                    onClick={(e) => {
                        if (annotationMode) return; // let user select freely, don't navigate
                        
                        // Intercept clicks on userNote wrapper (ressalvas highlights)
                        const userNote = e.target.closest('.user-note-wrapper');
                        if (userNote) {
                            e.preventDefault();
                            try {
                                const pos = editor.view.posAtDOM(userNote, 0);
                                const matchIdx = ressalvas.findIndex(r => pos >= r.pos && pos <= r.pos + r.nodeSize);
                                if (matchIdx !== -1) {
                                    handleRessalvaClickFromText(matchIdx);
                                }
                            } catch (err) {
                                console.error('Erro ao mapear clique na ressalva:', err);
                            }
                            return;
                        }

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
                    <div
                        onCopy={(e) => { e.preventDefault(); toast.error("Cópia de texto desativada por razões de segurança."); }}
                        onCut={(e) => { e.preventDefault(); toast.error("Corte de texto desativado por razões de segurança."); }}
                        onContextMenu={(e) => { if (!annotationMode) e.preventDefault(); }}
                    >
                        <EditorContent editor={editor} />
                    </div>
                </div>
            </div>{/* .card */}
            </div>{/* .review-editor-area */}

            {/* ── Desktop Sidebar ── */}
            <aside className="ressalvas-sidebar">
                <div className="ressalvas-sidebar-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <StickyNote size={14} /> Ressalvas
                    </span>
                    {ressalvas.length > 0 && (
                        <span className="ressalvas-count-badge">{ressalvas.length}</span>
                    )}
                </div>

                {noteForm && (
                    <RessalvaForm
                        excerpt={noteForm.excerpt}
                        initialValue={noteForm.mode === 'edit' ? ressalvas[noteForm.editId]?.note : ''}
                        onSave={handleSaveNote}
                        onCancel={handleCancelNoteForm}
                    />
                )}

                {ressalvas.length === 0 && !noteForm ? (
                    <div className="ressalvas-sidebar-empty">
                        <StickyNote size={20} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0 }}>Selecione um trecho no documento e toque em <strong>Adicionar Ressalva</strong>.</p>
                    </div>
                ) : (
                    ressalvas.map((r, idx) => (
                        <div
                            key={idx}
                            id={`ressalva-card-desktop-${idx}`}
                            className={`ressalva-card${activeRessalvaId === idx ? ' is-highlighted' : ''}`}
                            onClick={() => handleRessalvaCardClick(idx)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', background: 'rgba(217, 119, 6, 0.08)', padding: '0.1rem 0.35rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>
                                    RESSALVA [{idx + 1}]
                                </span>
                            </div>
                            <div className="ressalva-card-excerpt">"{r.excerpt}"</div>
                            <div className="ressalva-card-text">{r.note}</div>
                            <div className="ressalva-card-actions" onClick={(e) => e.stopPropagation()}>
                                <button className="ressalva-card-btn" onClick={() => handleEditNote(idx)} title="Editar ressalva">
                                    <Pencil size={11} /> Editar
                                </button>
                                <button className="ressalva-card-btn danger" onClick={() => handleDeleteNote(idx)} title="Excluir ressalva">
                                    <Trash2 size={11} /> Excluir
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </aside>

            </div>{/* .review-with-sidebar */}

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

            {/* ── Mobile FAB ── */}
            <button
                className="ressalvas-fab"
                onClick={() => setSheetOpen(true)}
                title="Ver Ressalvas"
                aria-label="Abrir painel de ressalvas"
            >
                <StickyNote size={22} />
                {ressalvas.length > 0 && (
                    <span className="ressalvas-fab-badge">{ressalvas.length}</span>
                )}
            </button>

            {/* ── Mobile bottom-sheet backdrop ── */}
            <div
                className={`ressalvas-sheet-backdrop${sheetOpen ? ' is-open' : ''}`}
                onClick={() => { setSheetOpen(false); handleCancelNoteForm(); }}
            />

            {/* ── Mobile bottom-sheet panel ── */}
            <div className={`ressalvas-sheet${sheetOpen ? ' is-open' : ''}`}>
                <div className="ressalvas-sheet-handle" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <StickyNote size={15} style={{ color: '#d97706' }} /> Ressalvas
                        {ressalvas.length > 0 && (
                            <span style={{ background: '#d97706', color: '#fff', fontSize: '0.65rem', fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                                {ressalvas.length}
                            </span>
                        )}
                    </span>
                    <button className="btn-ghost" onClick={() => { setSheetOpen(false); handleCancelNoteForm(); }}>
                        <X size={16} />
                    </button>
                </div>

                {noteForm && (
                    <div style={{ marginBottom: '1rem' }}>
                        <RessalvaForm
                            excerpt={noteForm.excerpt}
                            initialValue={noteForm.mode === 'edit' ? ressalvas[noteForm.editId]?.note : ''}
                            onSave={handleSaveNote}
                            onCancel={handleCancelNoteForm}
                        />
                    </div>
                )}

                {ressalvas.length === 0 && !noteForm ? (
                    <div className="ressalvas-sidebar-empty">
                        <StickyNote size={20} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0 }}>Selecione um trecho no documento e toque em <strong>Adicionar Ressalva</strong>.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {ressalvas.map((r, idx) => (
                            <div
                                key={idx}
                                id={`ressalva-card-mobile-${idx}`}
                                className={`ressalva-card${activeRessalvaId === idx ? ' is-highlighted' : ''}`}
                                onClick={() => { handleRessalvaCardClick(idx); setSheetOpen(false); }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', background: 'rgba(217, 119, 6, 0.08)', padding: '0.1rem 0.35rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>
                                        RESSALVA [{idx + 1}]
                                    </span>
                                </div>
                                <div className="ressalva-card-excerpt">"{r.excerpt}"</div>
                                <div className="ressalva-card-text">{r.note}</div>
                                <div className="ressalva-card-actions" onClick={(e) => e.stopPropagation()}>
                                    <button className="ressalva-card-btn" onClick={() => handleEditNote(idx)}>
                                        <Pencil size={11} /> Editar
                                    </button>
                                    <button className="ressalva-card-btn danger" onClick={() => handleDeleteNote(idx)}>
                                        <Trash2 size={11} /> Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showConfirmButton && (
                <button
                    className="ressalva-confirm-btn"
                    style={{
                        top: buttonPosition.top,
                        left: buttonPosition.left,
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleConfirmSelection}
                >
                    <Check size={14} /> Confirmar Ressalva
                </button>
            )}

            <MissingNumbersModal
                isOpen={missingNumbersModal.isOpen}
                matches={missingNumbersModal.matches}
                onMatchesChange={(newMatches) => setMissingNumbersModal({ ...missingNumbersModal, matches: newMatches })}
                onClose={() => setMissingNumbersModal({ isOpen: false, matches: [] })}
                onConfirm={handleConfirmFillNumbers}
            />

            <TermsAcceptanceModal
                isOpen={!!termsModal}
                action={termsModal}
                onClose={() => setTermsModal(null)}
                onConfirm={handleTermsConfirm}
            />

            <CreditReportModal
                report={creditReport}
                onClose={() => setCreditReport(null)}
                onDownload={handleOpenPdf}
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



            {/* Scroll button — only visible when page has scrollable content */}
            {hasScroll && (
                <button
                    onClick={toggleScroll}
                    className="scroll-to-top-bottom"
                    title={isAtBottom ? "Voltar ao topo" : "Ir para o final"}
                >
                    {isAtBottom ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
                </button>
            )}
            <PinVerificationModal
                isOpen={!!showPinConfirm}
                onClose={() => setShowPinConfirm(null)}
                onSuccess={async () => {
                    const callback = showPinConfirm;
                    setShowPinConfirm(null);
                    if (callback) {
                        await callback();
                    }
                }}
                onForgotPin={() => {
                    setShowPinConfirm(null);
                    setShowResetPinModal(true);
                }}
                isPinBlocked={isPinBlocked}
                setIsPinBlocked={setIsPinBlocked}
            />

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

            {/* First-time PIN setup — shown when user has no PIN and tries to sign */}
            {showPinSetup && (
                <SignaturePinSetupModal
                    onSaved={() => {
                        setShowPinSetup(false);
                        setHasPinConfigured(true);
                        // After PIN is created, proceed with the pending action via verification
                        if (pendingPinCallback) {
                            const cb = pendingPinCallback;
                            setPendingPinCallback(null);
                            setShowPinConfirm(() => cb);
                        }
                    }}
                />
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

function RessalvaForm({ excerpt, initialValue, onSave, onCancel }) {
    const [input, setInput] = useState(initialValue || '');
    
    return (
        <div className="ressalva-form">
            <p className="ressalva-form-excerpt">"{excerpt}"</p>
            <textarea
                className="ressalva-form-textarea"
                placeholder="Descreva a ressalva jurídica..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        onSave(input);
                    }
                }}
            />
            <div className="ressalva-form-actions">
                <button
                    className="btn-primary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    onClick={() => onSave(input)}
                >
                    <Check size={12} /> Salvar
                </button>
                <button
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    onClick={onCancel}
                >
                    <X size={12} /> Cancelar
                </button>
            </div>
        </div>
    );
}
