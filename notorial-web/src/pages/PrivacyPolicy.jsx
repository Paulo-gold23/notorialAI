import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
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
                        <h1 className="text-3xl font-serif mb-1" style={{ color: 'var(--text-main)' }}>
                            Política de Privacidade
                        </h1>
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            Última atualização: 16 de abril de 2026 · Legatus Tecnologia e Portais de Conteúdo Ltda.
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card" style={{ padding: '2.5rem', color: 'var(--text-main)', lineHeight: 1.8 }}>

                {/* Intro */}
                <div style={{ marginBottom: '2rem' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        Bem-vindo à <strong>Legatus</strong>!
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
                        A <strong>Legatus Tecnologia e Portais de Conteúdo Ltda.</strong> ("Legatus") oferece, em seu ecossistema digital, uma
                        ferramenta de inteligência jurídica – <strong>LegisVox</strong> – baseada em algoritmos de processamento de linguagem
                        natural e inteligência artificial para a organização, transcrição e contextualização de comunicações exportadas de
                        aplicativos de mensagens instantâneas. A presente <strong>Política de Privacidade</strong> explica de maneira clara e
                        acessível como as suas informações e dados serão coletados, usados, compartilhados e armazenados por meio dos nossos sistemas.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
                        Quando você utiliza a Plataforma LegisVox, você nos confia dados e informações. Nos comprometemos a manter essa
                        confiança através de padrões rigorosos de segurança e transparência, em total observância à <strong>Lei Geral de
                        Proteção de Dados</strong> (Lei nº 13.709/18 – "LGPD") e ao <strong>Marco Civil da Internet</strong> (Lei nº 12.965/14).
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
                        A aceitação desta Política será feita quando você iniciar seu uso de nossa Plataforma ou acessar nosso site. Este
                        documento deve ser lido em conjunto com os nossos <strong>Termos de Uso</strong>. Caso tenha dúvidas, entre em contato
                        pelo e-mail <strong>contato@legatus.com.br</strong>.
                    </p>
                </div>

                <PolicySection title="1. Informações que Coletamos">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Nós coletamos informações para fornecer serviços melhores a todos os usuários da Plataforma — desde entender questões
                        básicas, como o idioma que você fala, até questões operacionais complexas, como a gestão de créditos e a organização
                        lógica de fluxos de diálogos e transcrições de áudio.
                    </p>

                    <SubHeading>1.1. Caso você visite nosso site</SubHeading>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Se você apenas navegar em nosso site, poderemos coletar dados de navegação por meio de ferramentas de monitoramento
                        de erros e desempenho (como Sentry) para garantir a estabilidade do serviço.
                        Poderão ser coletados: endereço IP, tipo de navegador, duração da visita
                        e páginas visitadas.
                    </p>

                    <SubHeading>1.2. Informações que você nos fornece</SubHeading>
                    <BulletList items={[
                        <><strong>Dados de Cadastro:</strong> Nome completo, e-mail, número de telefone e, facultativamente, nome da organização ou sociedade de advogados. São condição <em>sine qua non</em> para autenticação e fruição dos serviços.</>,
                        <><strong>Dados de Pagamento:</strong> Para aquisição de créditos avulsos, coletamos nome completo ou razão social, CPF ou CNPJ e endereço de cobrança.</>,
                        <><strong>Processamento via Asaas:</strong> Todas as transações financeiras são processadas pela <strong>Asaas Gestão Financeira Instituição de Pagamento S/A</strong>. Dados sensíveis de pagamento (números de cartão) não são armazenados nos servidores da Legatus, garantindo conformidade com os padrões PCI-DSS.</>,
                        <><strong>Dados de Identificação de Dispositivo:</strong> Modelo de hardware, versão do sistema operacional e identificadores exclusivos, visando a segurança da conta e prevenção de acessos não autorizados.</>,
                    ]} />

                    <SubHeading>1.3. Conteúdo Submetido e Dados de Terceiros</SubHeading>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        A Legatus processa arquivos de mídia no formato .ZIP exportados diretamente de aplicativos de mensagens instantâneas.
                        No que tange ao conteúdo das comunicações submetidas, a Legatus atua estritamente na qualidade de <strong>Operadora de
                        Dados</strong> (Art. 5º, VII, LGPD). O Usuário, ao realizar o <em>upload</em>, assume a posição de <strong>Controlador</strong>,
                        declarando possuir a base legal ou o consentimento necessário para o tratamento e submissão de tais dados.
                    </p>
                </PolicySection>

                <PolicySection title="2. Uso e Partilha dos Seus Dados Pessoais">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Todos os dados recolhidos são tratados como confidenciais e utilizados estritamente para as finalidades descritas,
                        em conformidade com as bases legais previstas na LGPD.
                    </p>

                    <SubHeading>2.1. Finalidades do Tratamento</SubHeading>
                    <BulletList items={[
                        <><strong>Prestação do Serviço LegisVox:</strong> Utilizamos os dados de registro e o Conteúdo Submetido para viabilizar transcrição de áudio, estruturação de texto e organização lógica das comunicações.</>,
                        <><strong>Processamento por Inteligência Artificial:</strong> O conteúdo submetido é processado exclusivamente para execução do serviço, em modalidade de processamento transitório. A plataforma realiza referenciação e contextualização de anexos, não procedendo à transcrição do conteúdo interno de documentos ou reconhecimento de caracteres em imagens.</>,
                        <><strong>Gestão de Créditos:</strong> Os dados financeiros são utilizados para processamento de pagamentos via <strong>Asaas</strong> e emissão de documentos fiscais.</>,
                        <><strong>Comunicação e Suporte:</strong> Utilizamos dados de contato para suporte, alertas de sistema e, mediante consentimento expresso, comunicações sobre novas funcionalidades.</>,
                        <><strong>Segurança e Prevenção à Fraude:</strong> Dados de navegação e identificação de dispositivo são essenciais para garantir a segurança da rede e combater fraudes.</>,
                    ]} />

                    <SubHeading>2.2. Partilha de Informações</SubHeading>
                    <BulletList items={[
                        <><strong>Provedores de Infraestrutura e IA:</strong> Partilhamos o conteúdo estritamente necessário com parceiros de infraestrutura de nuvem e APIs de processamento de linguagem natural. É terminantemente vedado a esses parceiros o uso dos seus dados para treino de modelos públicos.</>,
                        <><strong>Processamento Financeiro (Asaas):</strong> Dados necessários para faturação são transmitidos de forma encriptada à Asaas, responsável pela liquidação das transações.</>,
                        <><strong>Cumprimento de Obrigações Legais:</strong> Caso compelidos por ordem judicial ou autoridade competente, a Legatus fornecerá os dados estritamente necessários, informando o Utilizador sempre que legalmente permitido.</>,
                    ]} />
                </PolicySection>

                <PolicySection title="3. Direitos dos Titulares">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        A Legatus garante o pleno exercício dos direitos previstos na LGPD. Você pode exercê-los a qualquer momento
                        mediante solicitação ao e-mail <strong>contato@legatus.com.br</strong>.
                    </p>
                    <BulletList items={[
                        <><strong>Confirmação e Acesso:</strong> Confirmar se a Legatus realiza o tratamento de seus dados e obter acesso a eles.</>,
                        <><strong>Correção:</strong> Solicitar a correção de dados incompletos, inexatos ou desatualizados.</>,
                        <><strong>Anonimização, Bloqueio ou Eliminação:</strong> Solicitar a desvinculação ou exclusão de dados desnecessários ou tratados em desconformidade com a lei.</>,
                        <><strong>Portabilidade:</strong> Solicitar a transferência de seus dados cadastrais a outro fornecedor.</>,
                        <><strong>Revogação do Consentimento:</strong> Revogar seu consentimento e ser informado sobre as consequências da negativa.</>,
                        <><strong>Revisão de Decisões Automatizadas:</strong> Solicitar revisão de decisões tomadas unicamente com base em tratamento automatizado. Ressaltamos que o relatório gerado pela IA é uma ferramenta de auxílio técnico, cabendo ao Usuário a decisão final.</>,
                    ]} />
                </PolicySection>

                <PolicySection title="4. Segurança das Informações">
                    <SubHeading>4.1. Criptografia e Armazenamento</SubHeading>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Todos os dados coletados e processados pelo LegisVox são protegidos por medidas técnicas de segurança tanto em repouso
                        (armazenamento) quanto em trânsito (transmissão), utilizando protocolos como SSL/TLS.
                    </p>

                    <SubHeading>4.2. Verificação de Integridade — Resumo Criptográfico Duplo</SubHeading>
                    <BulletList items={[
                        <><strong>Hash do Arquivo Fonte:</strong> No momento do upload do arquivo .ZIP, o sistema gera um resumo criptográfico único (SHA-256) que permite verificar se o conteúdo original sofreu alterações.</>,
                        <><strong>Hash do Relatório Final:</strong> Após o processamento e inserção de eventuais ressalvas, um segundo código Hash é gerado para o arquivo PDF final.</>,
                        <><strong>Imutabilidade:</strong> Ambos os códigos são impressos no rodapé de todas as páginas do relatório, permitindo rastreabilidade total em ambientes de auditoria ou processos judiciais.</>,
                    ]} />

                    <SubHeading>4.3. Política de Descarte e Eliminação Definitiva (Custódia Zero)</SubHeading>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Em cumprimento aos princípios da necessidade e da minimização (Art. 6º, III, LGPD) e observância aos Artigos 15 e
                        16 da Lei nº 13.709/2018:
                    </p>
                    <BulletList items={[
                        <>Considera-se exaurida a finalidade do tratamento assim que o relatório consolidado em PDF é gerado e disponibilizado para download.</>,
                        <>Os arquivos brutos submetidos (.ZIP) e as mídias processadas (áudios e imagens) são automática e permanentemente eliminados de nossos servidores em até <strong>24 horas</strong> após a disponibilização do arquivo para o Usuário.</>,
                        <>Em conformidade com o Art. 16, II, da LGPD, a Legatus conserva apenas: registros de acesso pelo prazo de 6 meses (Marco Civil) e os registros de integridade (Hashes SHA-256), que possuem natureza meramente matemática e não permitem a reconstituição do conteúdo original.</>,
                    ]} />

                    <SubHeading>4.4. Notificação de Incidentes</SubHeading>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        A Legatus se compromete a comunicar ao Usuário e à Autoridade Nacional de Proteção de Dados (ANPD) a ocorrência de
                        qualquer incidente de segurança que possa acarretar risco ou dano relevante aos seus dados pessoais.
                    </p>
                </PolicySection>

                <PolicySection title="5. Cookies e Armazenamento Local">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        O LegisVox <strong>não utiliza cookies de rastreamento, publicidade ou analytics de terceiros</strong>.
                        Utilizamos exclusivamente armazenamentos técnicos estritamente necessários para o funcionamento da plataforma:
                    </p>
                    <BulletList items={[
                        <><strong>Sessão de autenticação (localStorage):</strong> Token JWT gerenciado pelo Supabase Auth, necessário para manter o usuário autenticado. Removido ao fazer logout.</>,
                        <><strong>Preferência de tema (localStorage):</strong> Salva a escolha de tema visual (claro/escuro) do usuário. Dado puramente funcional, sem identificação pessoal.</>,
                        <><strong>Flag de tutorial (localStorage):</strong> Indica se o tutorial inicial já foi visualizado. Não contém dados pessoais.</>,
                        <><strong>CPF/CNPJ temporário (sessionStorage):</strong> Armazenado apenas durante a aba ativa para agilizar compras consecutivas. Eliminado automaticamente ao fechar a aba.</>,
                    ]} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        Por se tratarem de armazenamentos <strong>estritamente técnicos e necessários</strong> ao funcionamento do serviço, 
                        dispensam consentimento prévio nos termos da LGPD e da Diretiva ePrivacy. Nenhum dado é compartilhado com terceiros 
                        por meio desses mecanismos.
                    </p>
                </PolicySection>

                <PolicySection title="6. Atualizações e Lei Aplicável">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        A Legatus reserva-se o direito de alterar esta Política periodicamente para refletir melhorias no serviço ou mudanças
                        legislativas, sempre indicando a data da última atualização no topo do documento.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        Este documento é regido pelas leis da República Federativa do Brasil. Fica eleito o <strong>Foro da Comarca de Vitória/ES</strong>{' '}
                        como o competente para dirimir quaisquer controvérsias oriundas desta Política, com renúncia expressa a qualquer outro,
                        por mais privilegiado que seja.
                    </p>
                </PolicySection>

                {/* Contact */}
                <div style={{
                    marginTop: '2rem',
                    padding: '1rem 1.5rem',
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.05)',
                    border: '1px solid rgba(59,130,246,0.15)',
                    fontSize: '0.88rem',
                    color: 'var(--text-muted)',
                }}>
                    📧 Dúvidas sobre privacidade:{' '}
                    <a href="mailto:contato@legatus.com.br" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                        contato@legatus.com.br
                    </a>
                </div>
            </div>

            <LegalFooter style={{ marginTop: '2rem' }} />
        </div>
    );
}

/* ── Sub-components ────────────────────────────────────────── */
function PolicySection({ title, children }) {
    return (
        <section style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                fontFamily: 'Georgia, serif',
                marginBottom: '1rem',
                color: 'var(--text-main)',
            }}>{title}</h2>
            {children}
        </section>
    );
}

function SubHeading({ children }) {
    return (
        <h3 style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            color: 'var(--text-main)',
            marginTop: '1.1rem',
            marginBottom: '0.4rem',
        }}>{children}</h3>
    );
}

function BulletList({ items }) {
    return (
        <ul style={{ paddingLeft: '1.25rem', margin: '0.4rem 0' }}>
            {items.map((item, i) => (
                <li key={i} style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem',
                    marginBottom: '0.5rem',
                    lineHeight: 1.7,
                }}>{item}</li>
            ))}
        </ul>
    );
}
