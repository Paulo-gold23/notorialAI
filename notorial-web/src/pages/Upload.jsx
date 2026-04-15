import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadZip, getAtaStatus, estimateUpload, confirmUpload } from '../services/api';
import { UploadCloud, Calendar, Send, Check as CheckIcon, ArrowRight, FileText, FileAudio, FileImage, FileStack, Loader2, Coins, AlertTriangle, ShieldCheck } from 'lucide-react';
import JSZip from 'jszip';
import Logo from '../components/Logo';
import BackButton from '../components/BackButton';
import AnimatedNumber from '../components/AnimatedNumber';
import { useToast } from '../components/ToastContext';
import ErrorState from '../components/ErrorState';
import LegalFooter from '../components/LegalFooter';

const STEPS = [
    { key: 'optimizing', label: 'Otimizando arquivo', desc: 'Filtrando mídias fora do período' },
    { key: 'estimating', label: 'Analisando conteúdo', desc: 'Estimando custo de processamento' },
    { key: 'uploading', label: 'Preparando processamento', desc: 'Debitando créditos e iniciando' },
    { key: 'parsing', label: 'Extraindo mensagens', desc: 'Processando conversas e metadados' },
    { key: 'transcribing', label: 'Transcrevendo áudios', desc: 'Convertendo áudio em texto com IA' },
    { key: 'organizing', label: 'Organizando documento', desc: 'Estruturando conteúdo cronologicamente' },
    { key: 'ready', label: 'Pronta!', desc: 'Ata gerada com sucesso' },
];

function SubtleConfetti() {
    const particles = Array.from({ length: 14 }).map((_, i) => ({
        left: `${8 + Math.random() * 84}%`,
        delay: `${Math.random() * 0.8}s`,
        duration: `${1.8 + Math.random() * 1.2}s`,
        color: ['#4ade80', '#3b82f6', '#f59e0b', '#a78bfa', '#f8fafc'][i % 5],
        size: 3 + Math.random() * 3,
    }));

    return (
        <div className="confetti-container" style={{ height: '120px', bottom: '100%' }}>
            {particles.map((p, i) => (
                <div
                    key={i}
                    className="confetti-particle"
                    style={{
                        left: p.left,
                        bottom: 0,
                        animationDelay: p.delay,
                        animationDuration: p.duration,
                        backgroundColor: p.color,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                    }}
                />
            ))}
        </div>
    );
}

export default function Upload() {
    const [file, setFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [currentStatus, setCurrentStatus] = useState(null);
    const [error, setError] = useState('');
    const [ataId, setAtaId] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [zipPreview, setZipPreview] = useState(null);
    const [invalidDrop, setInvalidDrop] = useState(false);
    const [estimationData, setEstimationData] = useState(null);
    const [errorCategory, setErrorCategory] = useState(null);
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const toast = useToast();

    const analyzeZip = async (fileObj, filterStart = '', filterEnd = '') => {
        try {
            setZipPreview((prev) => ({ ...prev, loading: true }));
            const jszip = new JSZip();
            const zip = await jszip.loadAsync(fileObj);

            let txtCount = 0;
            let audioCount = 0;
            let imageCount = 0;
            let totalCount = 0;

            const getUtcDate = (dateStr) => {
                const d = new Date(dateStr);
                return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            };

            const sDate = filterStart ? getUtcDate(filterStart) : new Date('1970-01-01');
            const eDate = filterEnd ? getUtcDate(filterEnd) : new Date('2099-12-31');
            const getFileDate = (filepath) => {
                const basename = filepath.split('/').pop();
                let m = basename.match(/(20\d{2})(\d{2})(\d{2})/);
                if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
                m = basename.match(/(20\d{2})-(\d{2})-(\d{2})/);
                if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
                return null;
            };

            Object.keys(zip.files).forEach((filename) => {
                const fileEntry = zip.files[filename];
                if (!fileEntry.dir) {
                    const lower = filename.toLowerCase();
                    const isMedia = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || 
                                    lower.endsWith('.png') || lower.endsWith('.webp') ||
                                    lower.endsWith('.opus') || lower.endsWith('.m4a') || 
                                    lower.endsWith('.ogg') || lower.endsWith('.mp4');

                    let keep = true;
                    if (isMedia && (filterStart || filterEnd)) {
                        const fileDate = getFileDate(filename);
                        if (fileDate) {
                            const adjustedSDate = new Date(sDate);
                            adjustedSDate.setDate(adjustedSDate.getDate() - 2);
                            
                            const adjustedEDate = new Date(eDate);
                            adjustedEDate.setDate(adjustedEDate.getDate() + 2);
                            
                            if (fileDate < adjustedSDate || fileDate > adjustedEDate) {
                                keep = false;
                            }
                        }
                    }

                    if (keep) {
                        totalCount++;
                        if (lower.endsWith('.txt')) txtCount++;
                        else if (lower.endsWith('.opus') || lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.wav')) audioCount++;
                        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) imageCount++;
                    }
                }
            });

            setZipPreview({ loading: false, txtCount, audioCount, imageCount, totalCount, ready: true });
        } catch (err) {
            console.error('Failed to parse zip:', err);
            setZipPreview({ loading: false, error: 'Não foi possível ler o conteúdo do arquivo ZIP.' });
        }
    };

    // Recalcula o preview sempre que as datas mudarem, debounce
    useEffect(() => {
        if (!file) return;
        const handler = setTimeout(() => {
            analyzeZip(file, startDate, endDate);
        }, 500); // 500ms debounce
        return () => clearTimeout(handler);
    }, [file, startDate, endDate]);

    // Polling
    useEffect(() => {
        if (!ataId || currentStatus === 'ready' || currentStatus === 'error') return;

        const interval = setInterval(async () => {
            try {
                const data = await getAtaStatus(ataId);
                setCurrentStatus(data.status);
                setProgress(data.progress || 0);
                setStatusMessage(data.status_message || '');

                if (data.status === 'error') {
                    setError(data.error_message || 'Erro no processamento');
                    setErrorCategory(data.error_category || 'INTERNAL');
                    setUploading(false);
                    toast.error(data.error_message || 'Erro no processamento');
                }
                if (data.status === 'ready') {
                    setUploading(false);
                    setProgress(100);
                    toast.success('Ata processada com sucesso!');
                }
            } catch (err) {
                console.error(err);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [ataId, currentStatus, toast]);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped && dropped.name.endsWith('.zip')) {
            setFile(dropped);
            setError('');
            setInvalidDrop(false);
        } else {
            setInvalidDrop(true);
            toast.warning('Apenas arquivos .zip são aceitos.');
            setTimeout(() => setInvalidDrop(false), 600);
        }
    };

    const handleFileSelect = (e) => {
        const selected = e.target.files[0];
        if (selected && selected.name.endsWith('.zip')) {
            setFile(selected);
            setError('');
        } else {
            toast.warning('Apenas arquivos .zip são aceitos.');
        }
    };

    const handleCancel = () => {
        setFile(null);
        setStartDate('');
        setEndDate('');
        setError('');
        setErrorCategory(null);
        setZipPreview(null);
        setEstimationData(null);
    };

    const handleRetry = () => {
        setError('');
        setErrorCategory(null);
        setCurrentStatus(null);
        setUploading(false);
        setAtaId(null);
        setProgress(0);
        setStatusMessage('');
        // Keep file selected so user can retry without re-selecting
    };

    const handleUpload = async () => {
        if (!file) return;

        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            toast.warning('A data inicial não pode ser posterior à data final.');
            return;
        }

        setUploading(true);
        setError('');
        
        let fileToUpload = file;
        
        if (startDate || endDate) {
            setCurrentStatus('optimizing');
            try {
                const jszip = new JSZip();
                const zip = await jszip.loadAsync(file);
                
                // Tratar o reset do fuso horário para bater as datas 
                const getUtcDate = (dateStr) => {
                    const d = new Date(dateStr);
                    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                };

                const sDate = startDate ? getUtcDate(startDate) : new Date('1970-01-01');
                const eDate = endDate ? getUtcDate(endDate) : new Date('2099-12-31');
                
                const getFileDate = (filepath) => {
                    const basename = filepath.split('/').pop();
                    let m = basename.match(/(20\d{2})(\d{2})(\d{2})/);
                    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
                    m = basename.match(/(20\d{2})-(\d{2})-(\d{2})/);
                    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
                    return null;
                };

                const newZip = new JSZip();
                
                let keptCount = 0;
                let droppedCount = 0;
                
                for (const relativePath in zip.files) {
                    const fileObj = zip.files[relativePath];
                    if (fileObj.dir) continue;
                    
                    const lowerPath = relativePath.toLowerCase();
                    const isMedia = lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || 
                                    lowerPath.endsWith('.png') || lowerPath.endsWith('.webp') ||
                                    lowerPath.endsWith('.opus') || lowerPath.endsWith('.m4a') || 
                                    lowerPath.endsWith('.ogg') || lowerPath.endsWith('.mp4');
                    
                    if (isMedia) {
                        const fileDate = getFileDate(relativePath);
                        if (fileDate) {
                            // Margem de +- 1 dia para evitar problemas com diferença de fuso horário
                            const adjustedSDate = new Date(sDate);
                            adjustedSDate.setDate(adjustedSDate.getDate() - 2);
                            
                            const adjustedEDate = new Date(eDate);
                            adjustedEDate.setDate(adjustedEDate.getDate() + 2);
                            
                            if (fileDate >= adjustedSDate && fileDate <= adjustedEDate) {
                                newZip.file(relativePath, fileObj.async('blob'));
                                keptCount++;
                            } else {
                                droppedCount++;
                            }
                        } else {
                            // Se não tiver data no nome explícito, manter para garantir a integridade
                            newZip.file(relativePath, fileObj.async('blob'));
                            keptCount++;
                        }
                    } else {
                        // _chat.txt, json, docs ou qualquer outra coisa -> mantém original intacto.
                        newZip.file(relativePath, fileObj.async('blob'));
                        keptCount++;
                    }
                }
                
                if (droppedCount > 0) {
                    const optimizedBlob = await newZip.generateAsync({ type: 'blob', compression: 'STORE' });
                    fileToUpload = new File([optimizedBlob], file.name, { type: 'application/zip' });
                    toast.success(`Otimização local: ${droppedCount} arquivos fora do período descartados!`);
                }
            } catch (e) {
                console.error("Erro na otimização local do ZIP", e);
                // Fallback passivo: continua com o original caso dê zebra
            }
        }

        setCurrentStatus('estimating');
        setStatusMessage('Analisando conversa e estimando custo...');

        try {
            const data = await estimateUpload(fileToUpload, { startDate, endDate });
            setEstimationData(data);
            setCurrentStatus(null);
            setUploading(false);
        } catch (err) {
            setError(err.message || 'Erro ao analisar arquivo');
            setUploading(false);
            setCurrentStatus(null);
            toast.error(err.message || 'Erro ao analisar arquivo');
        }
    };

    const handleConfirm = async () => {
        if (!estimationData) return;
        setUploading(true);
        setEstimationData(null);
        setCurrentStatus('uploading');
        setStatusMessage('Debitando créditos e iniciando processamento...');

        try {
            const data = await confirmUpload(estimationData.ata_id);
            setAtaId(data.ata_id);
            setCurrentStatus('parsing');
        } catch (err) {
            setError(err.message || 'Erro ao confirmar processamento');
            setUploading(false);
            setCurrentStatus(null);
            toast.error(err.message || 'Erro ao confirmar processamento');
        }
    };

    const currentStepIdx = STEPS.findIndex(s => s.key === currentStatus);

    const zipStatItems = zipPreview?.ready ? [
        { icon: FileStack, color: 'var(--primary-color)', value: zipPreview.totalCount, label: 'Total' },
        { icon: FileAudio, color: 'var(--success)', value: zipPreview.audioCount, label: 'Áudios' },
        { icon: FileImage, color: 'var(--info)', value: zipPreview.imageCount, label: 'Imagens' },
        { icon: FileText, color: 'var(--accent-color)', value: zipPreview.txtCount, label: 'Docs (.txt)' },
    ] : [];

    return (
        <div className="page-enter container-centered" style={{ paddingTop: '2rem', maxWidth: '700px', paddingBottom: '3rem' }}>
            <BackButton />

            <h1 className="font-serif" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Logo size={32} /> Nova Conversa
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Exporte a conversa do WhatsApp como ZIP e faça o upload abaixo.
            </p>

            {/* Drop Zone */}
            {!uploading && !currentStatus && !estimationData && (
                <>
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        className={invalidDrop ? 'animate-shake' : ''}
                        style={{
                            border: `2px dashed ${dragActive ? 'var(--primary-color)' : 'var(--border-color)'}`,
                            borderRadius: '0.75rem',
                            padding: '3rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
                            background: dragActive ? 'var(--primary-glow)' : 'transparent',
                            boxShadow: dragActive ? '0 0 0 4px var(--primary-glow)' : 'none',
                            position: 'relative',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            marginBottom: '1rem',
                            color: 'var(--primary-color)',
                        }}>
                            <div style={{ animation: dragActive ? 'none' : 'breathe 3s ease-in-out infinite' }}>
                                <UploadCloud size={48} />
                            </div>
                        </div>
                        <p style={{ fontWeight: 600, margin: '0 0 0.5rem', fontSize: '1.05rem' }}>
                            {file ? file.name : 'Arraste o arquivo ZIP aqui'}
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'ou clique para selecionar'}
                        </p>
                        <input ref={inputRef} type="file" accept=".zip" onChange={handleFileSelect} style={{ display: 'none' }} />
                    </div>

                    {file && (
                        <div style={{ marginTop: '1.5rem' }} className="animate-scale-in">
                            {/* ZIP Preview */}
                            {zipPreview && (
                                <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
                                    <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center' }}>
                                        <FileStack className="w-4 h-4 mr-2" /> Conteúdo do ZIP
                                    </h3>
                                    {zipPreview.loading && (
                                        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando arquivo...
                                        </div>
                                    )}
                                    {zipPreview.error && (
                                        <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                                            {zipPreview.error}
                                        </div>
                                    )}
                                    {zipPreview.ready && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' }}>
                                            {zipStatItems.map((item, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        background: 'var(--surface-color)',
                                                        padding: '0.75rem',
                                                        borderRadius: '0.5rem',
                                                        textAlign: 'center',
                                                        border: '1px solid var(--border-color)',
                                                        animation: `slideUp 0.3s ease-out ${i * 80}ms both`,
                                                    }}
                                                >
                                                    <div style={{ color: item.color, marginBottom: '0.25rem', display: 'flex', justifyContent: 'center' }}>
                                                        <item.icon className="w-5 h-5" />
                                                    </div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                                                        <AnimatedNumber value={item.value} duration={500} />
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Date Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <p style={{ fontWeight: 500, margin: 0 }}>Filtrar por período <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>:</p>
                                <button
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    title="Limpar datas e processar a conversa inteira"
                                    className="btn-ghost"
                                    style={{
                                        background: (startDate || endDate) ? 'var(--primary-glow)' : 'transparent',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.375rem',
                                        color: (startDate || endDate) ? 'var(--primary-color)' : 'var(--text-muted)',
                                        fontSize: '0.8rem',
                                        padding: '0.3rem 0.75rem',
                                    }}
                                >
                                    <Calendar className="w-4 h-4" /> Toda a conversa
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="label-base" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Data Inicial</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="input-base"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="label-base" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Data Final</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="input-base"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>
                            {!(startDate || endDate) && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    💡 Sem filtro — toda a conversa será processada.
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button onClick={handleCancel} className="btn-secondary" style={{ flex: 1, color: 'var(--danger)' }}>
                                    Cancelar
                                </button>
                                <button className="btn-gradient" onClick={handleUpload} style={{ flex: 2 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        {(startDate || endDate) ? <><Calendar className="w-4 h-4" /> Enviar período selecionado</> : <><Send className="w-4 h-4" /> Enviar conversa completa</>}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Estimation Gate */}
            {estimationData && !currentStatus && (
                <div className="card animate-scale-in" style={{ marginTop: '1.5rem', position: 'relative' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem',
                            background: estimationData.has_credits ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: estimationData.has_credits ? '#10b981' : 'var(--danger)',
                        }}>
                            {estimationData.has_credits ? <ShieldCheck size={32} /> : <AlertTriangle size={32} />}
                        </div>
                        <h3 className="font-serif text-xl" style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                            Estimativa de Processamento
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Analisamos o conteúdo do seu arquivo. Confira os detalhes:
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            background: 'var(--surface-color)', padding: '1.25rem',
                            borderRadius: '0.75rem', border: '1px solid var(--border-color)',
                            textAlign: 'center'
                        }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                                Reserva Estimada
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {estimationData.estimated_pages}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>créditos</div>
                        </div>
                        <div style={{
                            background: 'var(--surface-color)', padding: '1.25rem',
                            borderRadius: '0.75rem', border: '1px solid var(--border-color)',
                            textAlign: 'center'
                        }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                                Seu Saldo Atual
                            </div>
                            <div style={{
                                fontSize: '2rem', fontWeight: 700,
                                color: estimationData.has_credits ? 'var(--success)' : 'var(--danger)'
                            }}>
                                {Math.floor(estimationData.balance)}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>créditos disponíveis</div>
                        </div>
                    </div>

                    {estimationData.has_credits ? (
                        <div>
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)',
                                borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem',
                                fontSize: '0.85rem', color: 'var(--primary-color)', textAlign: 'center'
                            }}>
                                💡 Após a geração do PDF, faremos o <strong>ajuste exato</strong> do saldo: você pagará apenas pelo número real de páginas geradas (1 página = 1 crédito).
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button onClick={handleCancel} className="btn-secondary" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                                <button onClick={handleConfirm} className="btn-gradient" style={{ flex: 2 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <Coins size={18} /> Reservar {estimationData.estimated_pages} créditos e Processar
                                    </span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem',
                                fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center'
                            }}>
                                ⚠️ Saldo insuficiente para iniciar. Você precisa reservar {estimationData.estimated_pages} créditos, mas possui apenas {Math.floor(estimationData.balance)}.
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button onClick={handleCancel} className="btn-secondary" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                                <button onClick={() => navigate('/credits')} className="btn-gradient" style={{ flex: 2 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <Coins size={18} /> Adquirir Créditos
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Progress Steps */}
            {currentStatus && (
                <div className="card animate-scale-in" style={{ marginTop: '1rem', position: 'relative' }}>
                    <h3 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {currentStatus === 'ready' ? (
                            <CheckIcon size={20} style={{ color: 'var(--success)' }} />
                        ) : (
                            <div className="sp-wave" />
                        )}
                        {currentStatus === 'ready' ? 'Processamento concluído' : 'Processamento em andamento'}
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {STEPS.map((step, idx) => {
                            const isActive = idx === currentStepIdx;
                            const isDone = idx < currentStepIdx;
                            const isPending = idx > currentStepIdx;
                            const isLast = idx === STEPS.length - 1;

                            return (
                                <div key={step.key} style={{ display: 'flex', gap: '0.75rem', position: 'relative', paddingBottom: isLast ? 0 : '1.25rem' }}>
                                    {/* Connector line */}
                                    {!isLast && (
                                        <div style={{
                                            position: 'absolute',
                                            left: '13px',
                                            top: '30px',
                                            bottom: '0',
                                            width: '2px',
                                            background: isDone ? 'var(--success)' : isActive ? 'linear-gradient(to bottom, var(--primary-color), var(--border-color))' : 'var(--border-color)',
                                            transition: 'background 0.4s',
                                        }} />
                                    )}

                                    {/* Step indicator */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.8rem', fontWeight: 600, flexShrink: 0,
                                        background: isDone ? 'var(--success)' : isActive ? 'var(--primary-color)' : 'var(--surface-color)',
                                        color: isPending ? 'var(--text-muted)' : '#fff',
                                        transition: 'all 0.4s',
                                        boxShadow: isActive ? '0 0 0 4px var(--primary-glow)' : 'none',
                                        border: isPending ? '2px solid var(--border-color)' : 'none',
                                        position: 'relative',
                                        zIndex: 1,
                                    }}>
                                        {isDone ? <CheckIcon className="w-4 h-4" /> : idx + 1}
                                    </div>

                                    {/* Step content */}
                                    <div style={{ flex: 1, paddingTop: '2px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                color: isPending ? 'var(--text-muted)' : 'var(--text-main)',
                                                fontWeight: isActive ? 600 : 400,
                                                transition: 'color 0.3s',
                                            }}>
                                                {step.label}
                                                {isActive && uploading && <div className="sp-wave" />}
                                            </span>
                                            {isActive && (step.key === 'transcribing' || step.key === 'organizing') && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 600 }}>{progress}%</span>
                                            )}
                                        </div>
                                        {isActive && (
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                                                {step.desc}
                                            </p>
                                        )}
                                        {isActive && (step.key === 'transcribing' || step.key === 'organizing') && (
                                            <div style={{
                                                width: '100%',
                                                height: '4px',
                                                background: 'var(--surface-color)',
                                                borderRadius: '2px',
                                                marginTop: '0.5rem',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    width: `${progress}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(90deg, var(--primary-color), var(--accent-color))',
                                                    transition: 'width 0.5s ease-out',
                                                    borderRadius: '2px',
                                                }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {statusMessage && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '0.75rem',
                            background: 'var(--primary-glow)',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            color: 'var(--primary-color)',
                            textAlign: 'center',
                            border: '1px solid rgba(59,130,246,0.2)',
                        }}>
                            {statusMessage}
                        </div>
                    )}

                    {currentStatus === 'ready' && (
                        <div style={{ position: 'relative', marginTop: '1.5rem' }}>
                            <SubtleConfetti />
                            <button
                                className="btn-gradient"
                                onClick={() => navigate(`/review/${ataId}`)}
                                style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    Revisar Ata <ArrowRight className="w-4 h-4" />
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ marginTop: '1rem' }}>
                    <ErrorState
                        category={errorCategory || 'INTERNAL'}
                        message={error}
                        onRetry={handleRetry}
                        onBack={handleCancel}
                        compact={true}
                    />
                </div>
            )}
            <LegalFooter style={{ marginTop: '3rem' }} />
        </div>
    );
}
