import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Reveal } from './landingUtils';

export default function FAQSection() {
  const [openIdx, setOpenIdx] = React.useState(null);

  const faqs = [
    {
      q: 'O LegisVox substitui o trabalho do advogado?',
      a: 'Não. O LegisVox é uma ferramenta de apoio: ele organiza, transcreve e estrutura a informação para que o advogado tenha um material preparatório claro e eficiente. A análise jurídica, a estratégia e a decisão continuam sendo do profissional.',
    },
    {
      q: 'Quais formatos de conversa são suportados?',
      a: 'Atualmente o LegisVox processa arquivos ZIP exportados diretamente pelo WhatsApp, incluindo todos os áudios em formato .m4a e .ogg. O arquivo _chat.txt é extraído automaticamente.',
    },
    {
      q: 'Como funciona a cobrança por créditos?',
      a: 'Cada página de conteúdo processada consome 1 crédito. Você compra créditos conforme sua demanda — sem mensalidade, sem contrato, sem fidelidade. Os créditos têm validade de 6 meses a partir da compra.',
    },
    {
      q: 'Os dados das conversões ficam armazenados?',
      a: 'Não. O LegisVox foi projetado com conformidade LGPD: os dados são processados e apagados automaticamente após o período configurado. Nenhum conteúdo de conversa é retido desnecessariamente.',
    },
    {
      q: 'O PDF gerado é editável?',
      a: 'Sim. Antes de exportar o PDF, o advogado tem acesso a um editor completo onde pode revisar, ajustar e adicionar notas. O arquivo final é gerado após a revisão e inclui hash SHA-256 para integridade.',
    },
    {
      q: 'Funciona com conversões longas com muitos áudios?',
      a: 'Sim. O processamento é paralelo: os áudios são transcritos simultaneamente, o que garante velocidade mesmo em conversas com dezenas de mensagens de voz.',
    },
  ];

  return (
    <section id="faq" style={{ background: C.bg, padding: '6rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span style={{
              display: 'inline-block',
              background: `${C.blue}14`,
              color: C.blue,
              border: `1px solid ${C.blue}33`,
              borderRadius: 100,
              padding: '0.35rem 1rem',
              fontSize: '0.78rem',
              fontFamily: FONT_BODY,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}>Dúvidas Frequentes</span>
            <h2 style={{
              fontFamily: FONT_HEADING,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              fontWeight: 600,
              color: C.navy,
              margin: 0,
              lineHeight: 1.25,
            }}>Tudo que você precisa<br />saber antes de começar</h2>
          </div>
        </Reveal>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {faqs.map((faq, i) => (
            <Reveal key={i} delay={i * 60}>
              <div
                style={{
                  background: C.white,
                  border: `1px solid ${openIdx === i ? C.gold : C.border}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                <button
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '1.25rem 1.5rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontFamily: FONT_HEADING,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: C.navy,
                    lineHeight: 1.4,
                  }}>{faq.q}</span>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: openIdx === i ? C.gold : C.bgAlt,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s, transform 0.2s',
                    transform: openIdx === i ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={openIdx === i ? C.navy : C.textSm} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </div>
                </button>

                {openIdx === i && (
                  <div style={{
                    padding: '0 1.5rem 1.25rem',
                    fontFamily: FONT_BODY,
                    fontSize: '0.9rem',
                    color: C.textMd,
                    lineHeight: 1.75,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: '1rem',
                    marginTop: '-0.25rem',
                  }}>{faq.a}</div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
