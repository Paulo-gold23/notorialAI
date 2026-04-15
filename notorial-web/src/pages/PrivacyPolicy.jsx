import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

export default function PrivacyPolicy() {
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
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 hidden sm:block">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-serif flex items-center gap-2 mb-1" style={{ color: 'var(--text-main)' }}>
                            Política de Privacidade
                        </h1>
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            Última atualização: 10 de Abril de 2026
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card space-y-6" style={{ padding: '2.5rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
                
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg mb-6">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 m-0">
                        Seu sigilo profissional e a cadeia de custódia da prova das informações dos seus clientes são nossa maior prioridade operacional.
                    </p>
                </div>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">1. Coleta de Dados Pessoais</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Coletamos dados necessários para a criação da sua identidade fiscal na emissão de notas (CPF/CNPJ, E-mail, Nome, Registro OAB). Tais dados são vitais para as transações na integração do Gateway Asaas e são ofuscados dentro da nossa plataforma sob criptografia (Base64 + Hash at-rest).
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">2. Dados das Conversas (Documentos)</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O conteúdo dos `.zip` ou `.txt` exportados pelo seu WhatsApp é processado efêmeramente em nossos servidores (memória e banco temporário) visando orquestrar as transcrições e ordenação AI. Os arquivos de mídia (áudios, imagens) não indexam perfil comportamental. 
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">3. Compartilhamento de Dados com Terceiros</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O LegisVox funciona através de integrações essenciais. Transferimos de forma encapsulada seu tráfego de geração de texto/áudio para provedores de LLM parceiros (ex: API Groq, VLLM, Supabase). Nesses provedores, seguimos planos Enterprise de Zero-Retention (dados não treinados por IA de terceiros).
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">4. Retenção e Exclusão</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        O usuário poderá gerenciar a deleção de seus documentos gerados diretamente na aplicação ("Deletar Documento"). Quando acionado, nosso ciclo de "on-delete cascade" expurga textos, mídias e metadados tanto do bucket de arquivos quanto da base relacional. Para encerramento definitivo de conta, basta acionar os canais de suporte em compliance com a LGPD (Lei Geral de Proteção de Dados - Brasil).
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-3 font-serif">5. Contato</h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Quaisquer dúvidas sobre o rigor de custódia e privacidade da ferramenta deverão ser direcionadas ao e-mail: <strong style={{ color: 'var(--text-main)' }}>privacidade@legisvox.ai</strong>
                    </p>
                </section>
            </div>
            
            <LegalFooter style={{ marginTop: '2rem' }} />
        </div>
    );
}
