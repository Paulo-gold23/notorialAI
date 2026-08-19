import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
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
                        <h1 className="text-3xl font-serif mb-1" style={{ color: 'var(--text-main)' }}>
                            Termos e Condições de Uso
                        </h1>
                        <p className="text-sm m-0" style={{ color: 'var(--text-muted)' }}>
                            Última atualização: 16 de abril de 2026 · Plataforma LegisVox
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="card" style={{ padding: '2.5rem', color: 'var(--text-main)', lineHeight: 1.8 }}>

                {/* Intro */}
                <div style={{ marginBottom: '2rem' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                        A <strong>Legatus Tecnologia e Portais de Conteúdo Ltda.</strong> ("Legatus"), com sede em Vitória/ES, estabelece os
                        presentes Termos e Condições de Uso ("Termos") para regular o acesso e a utilização da plataforma <strong>LegisVox</strong> ("Plataforma").
                    </p>
                </div>

                <TermsSection title="1. Aceitação e Vinculação Jurídica">
                    <BulletList items={[
                        <><strong>1.1 Aceitação Integral:</strong> Ao realizar o cadastro, adquirir créditos ou contratar planos, o Usuário declara ter lido, compreendido e aceitado, de forma livre, expressa e sem reservas, a integralidade destes Termos e da Política de Privacidade.</>,
                        <><strong>1.2 Contrato Vinculante:</strong> A aceitação constitui um contrato jurídico vinculante entre o Usuário e a Legatus. Caso o Usuário não concorde com qualquer disposição, deverá abster-se de utilizar a Plataforma imediatamente.</>,
                        <><strong>1.3 Alterações dos Termos:</strong> A Legatus reserva-se o direito de alterar estes Termos a qualquer momento. Alterações substanciais serão notificadas ao Usuário, e a continuidade do uso após tais modificações implica a aceitação dos novos termos.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="2. Objeto e Natureza do Serviço (SaaS)">
                    <BulletList items={[
                        <><strong>2.1 Licenciamento de Software:</strong> A Legatus concede ao Usuário uma licença de uso temporária, revogável, não exclusiva e intransferível do software LegisVox, operado exclusivamente sob o modelo <em>Software as a Service</em> (SaaS).</>,
                        <><strong>2.2 Escopo Operacional:</strong> O LegisVox é uma ferramenta de suporte tecnológico destinada à organização, transcrição de áudio, estruturação de diálogos e referenciação contextual de arquivos exportados de aplicativos de mensagens instantâneas.</>,
                        <><strong>2.3 Inexistência de Fé Pública:</strong> O Usuário reconhece e aceita que a LegisVox é uma ferramenta de auxílio técnico e organizacional. Os relatórios gerados pela plataforma <strong>não possuem fé pública notarial</strong> (Art. 384, CPC) e não substituem, em nenhuma hipótese, a perícia oficial, a ata notarial ou qualquer outro meio de prova que exija certificação por autoridade pública ou perito judicial. A juntada ou utilização do relatório pelo advogado não lhe confere fé pública nem certifica a veracidade das comunicações. O valor probatório do documento será apreciado pela autoridade competente em conjunto com os arquivos originais e as demais provas.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="3. Condições de Acesso, Cadastro e Pagamento">
                    <BulletList items={[
                        <><strong>3.1 Capacidade Civil:</strong> O uso da Plataforma é restrito a pessoas físicas ou jurídicas plenamente capazes nos termos da legislação civil brasileira.</>,
                        <><strong>3.2 Segurança de Acesso:</strong> O Usuário é o único responsável pela veracidade dos dados cadastrais e pela guarda de suas credenciais de acesso. Qualquer atividade realizada na conta será de sua exclusiva responsabilidade.</>,
                        <><strong>3.3 Modalidades de Contratação:</strong> O serviço é disponibilizado mediante créditos avulsos (saldo para processamentos pontuais).</>,
                        <><strong>3.4 Processamento via Asaas:</strong> Todas as transações financeiras são processadas pela <strong>Asaas Gestão Financeira Instituição de Pagamento S/A</strong>. A Legatus não armazena dados sensíveis de pagamento, e a liberação dos serviços está condicionada à confirmação de pagamento.</>,
                        <><strong>3.5 Inadimplemento e Suspensão:</strong> A ausência de saldo de créditos ensejará a suspensão imediata e automática das funcionalidades do LegisVox.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="4. Responsabilidades e Obrigações do Usuário">
                    <BulletList items={[
                        <><strong>4.1 Licitude dos Dados Submetidos:</strong> O Usuário declara e garante ser o proprietário, interlocutor ou possuidor de autorização legal e expressa de todos os participantes das comunicações contidas nos arquivos submetidos. O Usuário assume total e exclusiva responsabilidade civil e criminal pela origem, licitude e veracidade dos dados processados (Art. 186 e 927 do Código Civil).</>,
                        <><strong>4.2 Finalidade de Uso:</strong> O Usuário obriga-se a utilizar os relatórios gerados exclusivamente para fins lícitos. A Legatus não se responsabiliza pelo uso indevido, ilegal ou antiético das informações organizadas pela Plataforma.</>,
                        <><strong>4.3 Sigilo das Comunicações:</strong> O Usuário reconhece que a utilização de mensagens privadas como meio de prova em processos judiciais deve observar os preceitos constitucionais de sigilo e privacidade. A Legatus não oferece consultoria jurídica e não garante a admissibilidade judicial do relatório gerado.</>,
                        <><strong>4.4 Guarda do Relatório e de Mídias:</strong> Em virtude da nossa <strong>Política de Custódia Zero</strong>, o Usuário é o único responsável por realizar o download e garantir a guarda segura do relatório final em PDF, bem como de todas as mídias (como imagens e arquivos de áudio) que incorporam ou acompanham a sua conversa processada.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="5. Limitação de Responsabilidade e Riscos da Tecnologia">
                    <BulletList items={[
                        <><strong>5.1 Natureza da Inteligência Artificial:</strong> O Usuário declara estar ciente de que o serviço LegisVox utiliza modelos de Inteligência Artificial para transcrição e análise. Tais tecnologias são baseadas em processamento estatístico e probabilístico, podendo apresentar imprecisões, omissões ou interpretações equivocadas de contexto (alucinações).</>,
                        <><strong>5.2 Dever de Conferência (Cláusula de Barreira):</strong> É obrigação inafastável do Usuário conferir integralmente o conteúdo do relatório gerado com os arquivos de áudio e texto originais antes de qualquer utilização profissional ou judicial. A Legatus não será responsabilizada por danos decorrentes de decisões tomadas com base exclusiva no relatório sem a devida conferência humana.</>,
                        <><strong>5.3 Indisponibilidade de Terceiros:</strong> A Legatus não será responsável por falhas decorrentes de alterações nas políticas de exportação de aplicativos de terceiros, instabilidades em serviços de infraestrutura de nuvem ou problemas na conexão de internet do Usuário.</>,
                        <><strong>5.4 Lucros Cessantes e Danos Indiretos:</strong> Em nenhuma hipótese a Legatus será responsabilizada por danos indiretos, lucros cessantes, perda de chances de negócio ou danos morais decorrentes do uso da Plataforma, sendo eventual responsabilidade limitada ao valor efetivamente pago pelo Usuário no último processamento realizado.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="6. Integridade e Verificação por Hash">
                    <BulletList items={[
                        <><strong>6.1 Resumo Criptográfico:</strong> A Plataforma gera automaticamente dois resumos criptográficos (Hash SHA-256): o <em>Hash do Arquivo Fonte</em>, que permite verificar se o arquivo .ZIP original sofreu alterações após o processamento, e o <em>Hash do Relatório</em>, que permite verificar a integridade do documento final em PDF. O hash não certifica autoria, veracidade, completude, origem ou admissibilidade judicial do conteúdo.</>,
                        <><strong>6.2 Veto à Edição e Adulteração:</strong> Visando a preservação da fidedignidade e a prevenção de fraudes processuais (Art. 299 do Código Penal), o sistema <strong>não permite a edição direta</strong> do conteúdo transcrito pela Inteligência Artificial. O Usuário poderá inserir notas de ressalva, que constarão de forma segregada no relatório, identificadas claramente como manifestações unilaterais do Usuário.</>,
                        <><strong>6.3 Guarda de Metadados:</strong> O Usuário concorda que a Legatus armazenará os referidos códigos Hash em seus registros de auditoria, mesmo após a exclusão do conteúdo das mensagens, para fins de verificação de integridade. O valor probatório do documento será apreciado pela autoridade competente em conjunto com os arquivos originais e as demais provas.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="7. Propriedade Intelectual e Restrições">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Todos os direitos de propriedade intelectual relativos ao LegisVox — incluindo código-fonte, arquitetura de software,
                        algoritmos de processamento, design de interface, marcas ("Legatus" e "LegisVox") e segredos de negócio — pertencem
                        exclusivamente à <strong>Legatus Tecnologia e Portais de Conteúdo Ltda.</strong>
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem', fontWeight: 600 }}>
                        É terminantemente proibido ao Usuário:
                    </p>
                    <BulletList items={[
                        <>Realizar engenharia reversa, descompilação ou qualquer tentativa de extrair o código-fonte da Plataforma;</>,
                        <>Utilizar o serviço para desenvolver ferramentas concorrentes ou para fins de espionagem industrial;</>,
                        <>Remover ou alterar avisos de direitos autorais ou selos de integridade (Hash) dos relatórios gerados.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="8. Eliminação de Dados e Política de Custódia Zero">
                    <BulletList items={[
                        <><strong>8.1 Descarte Automático:</strong> Em cumprimento aos Artigos 15 e 16 da LGPD, a Legatus procederá à eliminação definitiva e irreversível de todos os arquivos brutos submetidos (.ZIP), arquivos de áudio, imagens e transcrições em até <strong>24 horas</strong> após o processamento.</>,
                        <><strong>8.2 Responsabilidade de Armazenamento:</strong> A Legatus não atua como serviço de custódia ou backup de documentos ou arquivos de mídia. Uma vez concluído o descarte automático, é tecnicamente impossível a recuperação das transcrições, áudios e imagens. O Usuário assume a responsabilidade integral por realizar o download e garantir a guarda segura do relatório e de todas as mídias associadas à conversa.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="9. Rescisão e Suspensão">
                    <BulletList items={[
                        <><strong>9.1 Infração Contratual:</strong> A Legatus poderá rescindir o presente contrato e bloquear o acesso do Usuário, sem direito a reembolso de créditos, caso seja identificada qualquer violação a estes Termos, à legislação vigente ou uso abusivo da tecnologia.</>,
                        <><strong>9.2 Desistência:</strong> O Usuário poderá solicitar o cancelamento de sua conta a qualquer momento. Créditos avulsos já adquiridos não serão objeto de reembolso em caso de desistência após o uso parcial.</>,
                    ]} />
                </TermsSection>

                <TermsSection title="10. Disposições Gerais e Foro" last>
                    <BulletList items={[
                        <><strong>10.1 Independência das Cláusulas:</strong> Se qualquer disposição for considerada inválida ou inexequível, as demais cláusulas permanecerão em pleno vigor e efeito.</>,
                        <><strong>10.2 Tolerância:</strong> A eventual tolerância de qualquer infração não constituirá novação ou renúncia a direitos.</>,
                        <><strong>10.3 Lei Aplicável e Foro:</strong> Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o <strong>Foro da Comarca de Vitória/ES</strong>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</>,
                    ]} />
                </TermsSection>

                {/* Contact */}
                <div style={{
                    marginTop: '2rem',
                    padding: '1rem 1.5rem',
                    borderRadius: 10,
                    background: 'rgba(245,158,11,0.05)',
                    border: '1px solid rgba(245,158,11,0.15)',
                    fontSize: '0.88rem',
                    color: 'var(--text-muted)',
                }}>
                    📧 Dúvidas sobre estes Termos:{' '}
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
function TermsSection({ title, children, last = false }) {
    return (
        <section style={{
            marginBottom: last ? 0 : '2rem',
            paddingBottom: last ? 0 : '1.5rem',
            borderBottom: last ? 'none' : '1px solid var(--border-color)',
        }}>
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

function BulletList({ items }) {
    return (
        <ul style={{ paddingLeft: '1.25rem', margin: '0.4rem 0' }}>
            {items.map((item, i) => (
                <li key={i} style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem',
                    marginBottom: '0.65rem',
                    lineHeight: 1.7,
                }}>{item}</li>
            ))}
        </ul>
    );
}
