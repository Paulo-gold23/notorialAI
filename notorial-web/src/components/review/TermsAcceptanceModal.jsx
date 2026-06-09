import React, { useState, useEffect } from 'react';
import { FileText, Save } from 'lucide-react';

export default function TermsAcceptanceModal({ isOpen, onClose, onConfirm, action }) {
    const [termsChecked, setTermsChecked] = useState(false);
    const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);

    // Lock and unlock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
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
                        <li><strong>Sigilo e Confidencialidade:</strong> Compromete-se a manter o sigilo sobre informações sensíveis contidas no documento, declarando que possui autorização hierárquica ou legal para o processamento de tais dados in ambiente digital.</li>
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
                        onClick={() => { setTermsChecked(false); onClose(); }}
                    >
                        Cancelar
                    </button>
                    <button
                        className="btn-gradient"
                        disabled={!termsChecked}
                        onClick={onConfirm}
                        style={{ opacity: termsChecked ? 1 : 0.5, cursor: termsChecked ? 'pointer' : 'not-allowed' }}
                    >
                        {action === 'save' ? (
                            <><Save size={15} /> Aceitar e Salvar</>
                        ) : (
                            <><FileText size={15} /> Aceitar e Gerar PDF</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
