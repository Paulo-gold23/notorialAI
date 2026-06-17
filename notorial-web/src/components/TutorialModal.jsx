import React, { useState, useEffect } from 'react';
import { X, Smartphone, Download, UploadCloud, CheckCircle2, ChevronRight, ChevronLeft, Lock } from 'lucide-react';

export default function TutorialModal({ isOpen, onClose }) {
    const [step, setStep] = useState(0);

    // Reset step to 0 every time the modal is opened
    useEffect(() => {
        if (isOpen) {
            setStep(0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const steps = [
        {
            icon: <Smartphone size={40} className="mb-4 text-blue-500" />,
            title: '1. Exporte a Conversa do WhatsApp',
            content: (
                <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p>No seu WhatsApp (celular da vítima ou cliente) encontre a conversa que será usada como prova e siga os passos:</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2">
                        <li><strong>No iPhone (iOS):</strong> Toque no nome do contato no topo, role até o final, escolha <strong className="text-[var(--text-main)]">"Exportar conversa"</strong> e selecione <strong className="text-[var(--text-main)]">"Anexar Mídia"</strong>.</li>
                        <li><strong>No Android:</strong> Toque nos três pontinhos no canto superior direito da conversa, vá em <strong className="text-[var(--text-main)]">Mais</strong>, depois em <strong className="text-[var(--text-main)]">"Exportar conversa"</strong> e selecione <strong className="text-[var(--text-main)]">"INCLUIR ARQUIVOS DE MÍDIA"</strong>.</li>
                    </ul>
                </div>
            )
        },
        {
            icon: <Download size={40} className="mb-4 text-indigo-500" />,
            title: '2. Obtenha o Arquivo .ZIP',
            content: (
                <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p>O WhatsApp irá gerar automaticamente um único pacote compactado, no formato <code className="bg-black/5 dark:bg-white/5 py-0.5 px-1.5 rounded">.zip</code>.</p>
                    <p>Você pode salvar esse arquivo no seu próprio celular (ex: iCloud Drive, Google Drive, Arquivos) ou mandá-lo rapidamente para o seu Telegram / E-mail para utilizá-lo direto do escritório pelo computador.</p>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-500 mt-4 leading-relaxed font-medium">
                        💡 Dica de Perícia Oficial: Nunca modifique o conteúdo das pastas e mensagens dentro do arquivo ZIP exportado, isso garante a integridade dos metadados extraídos para o documento final.
                    </div>
                </div>
            )
        },
        {
            icon: <UploadCloud size={40} className="mb-4 text-green-500" />,
            title: '3. Envie para o LegisVox',
            content: (
                <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p>Com o pacote <code className="bg-black/5 dark:bg-white/5 py-0.5 px-1.5 rounded">.zip</code> em mãos, abra nossa plataforma clicando em <strong>Novo Documento</strong> no painel principal.</p>
                    <p>Arraste o arquivo para a área de envio. A ferramenta usará nossos créditos automáticos para prever o quantitativo de páginas (folhas notariais) e, assim que você confirmar o envio, o Robô de Orquestramento fará todo o processo: parsear a conversa, criar linha cronológica e embedar as imagens formatadas no Word/PDF.</p>
                </div>
            )
        },
        {
            icon: <Lock size={40} className="mb-4 text-amber-500" />,
            title: '4. Senha de Assinatura',
            content: (
                <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p>Para chancelar a integridade jurídica das mensagens e das mídias exportadas, o LegisVox exige a criação de uma <strong>Senha de Assinatura de 4 dígitos</strong>.</p>
                    <p>Esta senha é de uso pessoal e exclusivo dentro da plataforma:</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2">
                        <li><strong>Diferente do celular:</strong> Não confunda com o PIN de bloqueio do seu smartphone ou chip telefônico. Ela é definida por você no primeiro acesso.</li>
                        <li><strong>Segurança Notarial:</strong> A senha será exigida sempre que você salvar alterações nas atas ou emitir relatórios finais em PDF.</li>
                        <li><strong>Recuperação Segura:</strong> Caso esqueça, você pode redefinir a senha a qualquer momento enviando um código temporário para o seu e-mail cadastrado.</li>
                    </ul>
                </div>
            )
        }
    ];

    const isLastStep = step === steps.length - 1;

    return (
        <div 
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 sm:p-6 transition-all" 
            onClick={onClose}
        >
            <div 
                className="bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl rounded-2xl animate-scale-in w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh]" 
                onClick={e => e.stopPropagation()}
            >
                {/* Visual Header Decoration */}
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500" />
                
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-1.5 rounded-full z-10"
                >
                    <X size={20} />
                </button>

                <div className="p-6 sm:p-8 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Stepper Dots */}
                    <div className="flex justify-center gap-2 mb-8">
                        {steps.map((_, i) => (
                            <div 
                                key={i} 
                                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${i === step ? 'bg-blue-500 w-6' : 'bg-gray-300 dark:bg-gray-700'}`}
                            />
                        ))}
                    </div>

                    {/* Content Caroussel */}
                    <div className="flex flex-col items-center text-center animation-slide-up" key={step}>
                        {steps[step].icon}
                        <h2 className="text-xl font-serif mb-4" style={{ color: 'var(--text-main)' }}>
                            {steps[step].title}
                        </h2>
                        <div className="text-left w-full">
                            {steps[step].content}
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="px-8 py-5 border-t border-[var(--border-color)] bg-[var(--surface-color)]/30 flex justify-between items-center">
                    <button 
                        onClick={() => {
                            if (step === 0) onClose();
                            else setStep(step - 1);
                        }}
                        className="text-sm font-semibold flex items-center gap-1 hover:opacity-75 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        {step === 0 ? 'Pular' : <><ChevronLeft size={16}/> Voltar</>}
                    </button>

                    <button 
                        onClick={() => {
                            if (isLastStep) onClose();
                            else setStep(step + 1);
                        }}
                        className="btn-primary flex items-center gap-2 px-5 py-2.5"
                    >
                        {isLastStep ? (
                            <>Entendido <CheckCircle2 size={18}/></>
                        ) : (
                            <>Próximo <ChevronRight size={18}/></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
