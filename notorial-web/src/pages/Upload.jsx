import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadZip, getAtaStatus } from '../services/api';
import { UploadCloud, Calendar, Send, Check as CheckIcon, ArrowRight, FileText, FileAudio, FileImage, FileStack, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import Logo from '../components/Logo';
import BackButton from '../components/BackButton';
import AnimatedNumber from '../components/AnimatedNumber';
import { useToast } from '../components/ToastContext';

const STEPS = [
    { key: 'uploading', label: 'Enviando ZIP', desc: 'Transferindo arquivo para o servidor' },
    { key: 'parsing', label: 'Parseando conversa', desc: 'Extraindo mensagens e metadados' },
    { key: 'transcribing', label: 'Transcrevendo áudios', desc: 'Convertendo áudio em texto com IA' },
    { key: 'organizing', label: 'Organizando com IA', desc: 'Estruturando conteúdo cronologicamente' },
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
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const toast = useToast();

    const analyzeZip = async (fileObj) => {
        try {
            setZipPreview({ loading: true });
            const jszip = new JSZip();
            const zip = await jszip.loadAsync(fileObj);

            let txtCount = 0;
            let audioCount = 0;
            let imageCount = 0;
            let totalCount = 0;

            Object.keys(zip.files).forEach((filename) => {
                if (!zip.files[filename].dir) {
                    totalCount++;
                    const lower = filename.toLowerCase();
                    if (lower.endsWith('.txt')) txtCount++;
                    else if (lower.endsWith('.opus') || lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.wav')) audioCount++;
                    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) imageCount++;
                }
            });

            setZipPreview({ loading: false, txtCount, audioCount, imageCount, totalCount, ready: true });
        } catch (err) {
            console.error('Failed to parse zip:', err);
            setZipPreview({ loading: false, error: 'Não foi possível ler o conteúdo do arquivo ZIP.' });
        }
    };

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
            analyzeZip(dropped);
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
            analyzeZip(selected);
        } else {
            toast.warning('Apenas arquivos .zip são aceitos.');
        }
    };

    const handleCancel = () => {
        setFile(null);
        setStartDate('');
        setEndDate('');
        setError('');
        setZipPreview(null);
    };

    const handleUpload = async () => {
        if (!file) return;

        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            toast.warning('A data inicial não pode ser posterior à data final.');
            return;
        }

        setUploading(true);
        setError('');
        setCurrentStatus('uploading');

        try {
            const data = await uploadZip(file, { startDate, endDate });
            setAtaId(data.ata_id);
            setCurrentStatus('parsing');
        } catch (err) {
            setError(err.message || 'Erro ao enviar arquivo');
            setUploading(false);
            toast.error(err.message || 'Erro ao enviar arquivo');
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
                <Logo size={32} /> Nova Ata Notarial
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Exporte a conversa do WhatsApp como ZIP e faça o upload abaixo.
            </p>

            {/* Drop Zone */}
            {!uploading && !currentStatus && (
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
                <div className="animate-shake" style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    marginTop: '1rem',
                    color: 'var(--danger)',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                }}>
                    <span>⚠</span> {error}
                </div>
            )}
        </div>
    );
}
