import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function TermsOfUse() {
    const navigate = useNavigate();

    return (
        <div className="page-enter container-centered pt-8 md:pt-10 pb-12 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8 border-b border-[var(--border-color)] pb-6">
                <button 
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    title="Voltar"
                >
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--primary-glow)] rounded-lg text-[var(--gold-main)] hidden sm:block">
                        <Scale size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-serif flex items-center gap-2 mb-1" style={{ color: 'var(--text-main)' }}>
                            Termos de Uso
                        </h1>
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            Última atualização: 10 de Abril de 2026
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card space-y-6" style={{ padding: '2.5rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">1. Aceitação dos Termos</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Ao acessar e utilizar a plataforma LegisVox, o usuário (você, advogado ou preposto legal) concorda com os presentes Termos de Uso. Este documento governa a utilização da tecnologia de processamento e diagramação de conversas e dados para uso jurídico.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">2. Serviços Prestados</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O LegisVox fornece ferramentas baseadas em Inteligência Artificial para organizar e formatar extrações de aplicativos de mensagens, auxiliando na instrução probatória. O software não presta consultoria jurídica, tampouco atua em nome de provedores como a Meta Platform Inc.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">3. Fidelidade e Uso Probatório</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Você reconhece que é de sua inteira responsabilidade atestar a veracidade e originalidade dos arquivos `.zip` ou `.txt` providos como extração das plataformas de mensagens originais. O sistema realiza transcrição e organização temporal visando máxima fidelidade, porém o acompanhamento e revisão manual antes do uso processual é indispensável.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">4. Direitos Intelectuais (Copyright)</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Todos os direitos sobre a interface, códigos-fonte, algoritmos de organização lógica, modelos de inteligência artificial de transcrição e a marca comercial LegisVox pertencem aos seus respectivos desenvolvedores. Qualquer reprodução mecânica ou código sem autorização configura violação das leis de copyright aplicáveis.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">5. Sistema de Créditos e Pagamentos</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O uso do sistema opera mediante pacotes de créditos pré-pagos. Os créditos possuem validade garantida de 6 meses após a aquisição. A plataforma reserva-se no direito de reter o processamento de novos documentos caso o saldo disponível não seja suficiente.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">6. Rescisão</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O LegisVox reserva-se o direito de suspender ou encerrar contas quando detectada violação destes termos, inatividade fraudulenta com dados de CPF/CNPJ de terceiros (Falsidade Ideológica) ou a pedido do usuário detentor dos dados.
                    </p>
                </section>
            </div>
            
            <LegalFooter style={{ marginTop: '2rem' }} />
        </div>
    );
}
