import React, { useState, useEffect, useRef } from 'react';
import { FileText, Save, X, ShieldCheck } from 'lucide-react';

export default function TermsAcceptanceModal({ isOpen, onClose, onConfirm, action }) {
    const [termsChecked, setTermsChecked] = useState(false);
    const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
    const termsRef = useRef(null);

    // Lock and unlock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setTermsChecked(false);
            // Check if scroll is already at bottom or if container doesn't need scrolling
            setTimeout(() => {
                if (termsRef.current) {
                    const { scrollHeight, clientHeight } = termsRef.current;
                    if (scrollHeight <= clientHeight + 10) {
                        setTermsScrolledToBottom(true);
                    }
                }
            }, 100);
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleTermsScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollTop + clientHeight >= scrollHeight - 25 || scrollHeight <= clientHeight + 10) {
            setTermsScrolledToBottom(true);
        }
    };

    return (
        <div 
            className="modal-backdrop-responsive" 
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setTermsChecked(false);
                    onClose();
                }
            }}
        >
            <div 
                className="modal-dialog-responsive"
                style={{ maxWidth: '560px' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (Fixed) */}
                <div className="modal-dialog-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: '0.6rem',
                            background: 'var(--primary-glow)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-color)', flexShrink: 0,
                        }}>
                            <FileText size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Termo de Responsabilidade
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Leia e aceite antes de continuar
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setTermsChecked(false); onClose(); }}
                        style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--text-muted)',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                        }}
                        onMouseOver={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                        aria-label="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="modal-dialog-body">
                    <div 
                        ref={termsRef}
                        onScroll={handleTermsScroll}
                        style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.6rem',
                            padding: '1rem 1.15rem',
                            fontSize: '0.8rem',
                            lineHeight: 1.55,
                            color: 'var(--text-main)',
                            marginBottom: '1rem',
                            maxHeight: 'clamp(140px, 30vh, 240px)',
                            overflowY: 'auto',
                            scrollBehavior: 'smooth',
                        }}
                    >
                        <p style={{ margin: '0 0 0.75rem', fontWeight: 700, textAlign: 'center', fontSize: '0.82rem' }}>
                            TERMO DE RESPONSABILIDADE, CONFORMIDADE E DECLARAÇÃO DE VERACIDADE
                        </p>
                        <p style={{ margin: '0 0 0.75rem', textAlign: 'justify' }}>
                            Ao confirmar a geração deste documento, o responsável pela presente ação declara expressamente que:
                        </p>
                        <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'justify' }}>
                            <li><strong>Revisão e Validação Integral:</strong> Realizou a conferência exaustiva de todo o conteúdo exibido no editor, atestando a veracidade, completude, integridade e fidelidade das informações apresentadas em relação aos fatos e dados reais.</li>
                            <li><strong>Ciência de Processamento Automatizado:</strong> Compreende que o documento é fruto de processamento tecnológico e transcrições automáticas, estando ciente de que tais ferramentas podem apresentar imprecisões. Reconhece que a validação final e a correção de eventuais erros são deveres indelegáveis do usuário.</li>
                            <li><strong>Responsabilidade Plena (Civil, Administrativa e Criminal):</strong> Assume integral e exclusiva responsabilidade civil, administrativa e criminal, ética e profissional pelo conteúdo e pelo uso do documento gerado. Declara-se ciente de que a inserção de informações falsas ou a omissão de dados relevantes pode configurar ilícitos (como falsidade ideológica), isentando os desenvolvedores de qualquer solidariedade por danos ou irregularidades.</li>
                            <li><strong>Controle de Dados e LGPD:</strong> Declara-se, para fins da Lei nº 13.709/2018 (LGPD), como o único Controlador dos dados inseridos, garantindo possuir base legal ou consentimento explícito para o tratamento de dados de terceiros, eximindo a plataforma de responsabilidade sobre a origem ou legitimidade desses dados.</li>
                            <li><strong>Sigilo e Confidencialidade:</strong> Compromete-se a manter o sigilo sobre informações sensíveis contidas no documento, declarando que possui autorização hierárquica ou legal para o processamento de tais dados in ambiente digital.</li>
                            <li><strong>Dever de Indenização:</strong> Obriga-se a manter a plataforma e seus desenvolvedores indenes de qualquer prejuízo, comprometendo-se a ressarcir quaisquer custos, honorários ou indenizações decorrentes de ações judiciais ou administrativas causadas pelo uso indevido deste documento.</li>
                            <li><strong>Irretratabilidade e Registro de Autoria:</strong> Reconhece que este aceite eletrônico é irretratável e será vinculado ao documento final, servindo como prova de autoria, revisão e concordância irrestrita com todos os termos aqui descritos.</li>
                        </ol>
                    </div>

                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        cursor: termsScrolledToBottom ? 'pointer' : 'not-allowed',
                        padding: '0.8rem 0.9rem',
                        background: termsChecked ? 'rgba(59,130,246,0.08)' : 'var(--surface-color)',
                        border: `1px solid ${termsChecked ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`,
                        borderRadius: '0.6rem',
                        transition: 'all 0.2s',
                        opacity: termsScrolledToBottom ? 1 : 0.65,
                        minHeight: '44px',
                    }}>
                        <input
                            type="checkbox"
                            checked={termsChecked}
                            disabled={!termsScrolledToBottom}
                            onChange={e => setTermsChecked(e.target.checked)}
                            style={{ 
                                width: '1.15rem', height: '1.15rem', 
                                accentColor: 'var(--primary-color)', 
                                flexShrink: 0, 
                                cursor: termsScrolledToBottom ? 'pointer' : 'not-allowed' 
                            }}
                        />
                        <span style={{ fontSize: '0.82rem', lineHeight: 1.4, color: termsScrolledToBottom ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            {termsScrolledToBottom 
                                ? "Li, compreendi e aceito os termos acima, assumindo total responsabilidade pelo conteúdo a ser gerado."
                                : "Role a barra de texto acima até o final para liberar o aceite."}
                        </span>
                    </label>
                </div>

                {/* Footer (Fixed) */}
                <div className="modal-dialog-footer">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setTermsChecked(false); onClose(); }}
                        style={{ minHeight: '40px' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="btn-gradient"
                        disabled={!termsChecked}
                        onClick={onConfirm}
                        style={{ 
                            opacity: termsChecked ? 1 : 0.5, 
                            cursor: termsChecked ? 'pointer' : 'not-allowed',
                            minHeight: '40px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}
                    >
                        {action === 'save' ? (
                            <><Save size={15} /> Aceitar e Salvar</>
                        ) : (
                            <><ShieldCheck size={16} /> Aceitar e Gerar PDF</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

