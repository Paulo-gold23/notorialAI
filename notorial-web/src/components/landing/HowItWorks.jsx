import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Icon, Reveal } from './landingUtils';

export default function HowItWorks() {
  const steps = [
    {
      num: '01',
      icon: <Icon.MessageSquare />,
      title: 'Exporte a conversa do WhatsApp',
      desc: 'Selecione a conversa relevante e exporte como arquivo ZIP diretamente do aplicativo. Áudios incluídos.',
    },
    {
      num: '02',
      icon: <Icon.Mic />,
      title: 'Transcrição automática via IA',
      desc: 'O LegisVox transcreve todos os áudios com alta precisão usando Groq Whisper, identificando cada participante da conversa.',
    },
    {
      num: '03',
      icon: <Icon.FileText />,
      title: 'Estruturação inteligente com GPT-4o',
      desc: 'A IA organiza o conteúdo em material preparatório claro, com versão narrativa e versão técnica para análise do advogado.',
    },
    {
      num: '04',
      icon: <Icon.Award />,
      title: 'Revisão e exportação em PDF',
      desc: 'O material é editável antes do export. O PDF final conta com hash SHA-256 para rastreabilidade e integridade.',
    },
  ];

  return (
    <section id="how" style={{ background: C.bg, padding: '6rem 1.5rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
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
            }}>Como Funciona</span>
            <h2 style={{
              fontFamily: FONT_HEADING,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              fontWeight: 600,
              color: C.navy,
              margin: '0 0 1rem',
              lineHeight: 1.25,
            }}>
              Do WhatsApp ao material preparatório<br />em 4 etapas simples
            </h2>
            <p style={{
              fontFamily: FONT_BODY,
              fontSize: '1rem',
              color: C.textSm,
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.7,
            }}>
              Nenhum conhecimento técnico necessário. O processo é totalmente automatizado e auditável.
            </p>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1.5rem',
          position: 'relative',
        }} className="lp-steps-grid">
          {/* Connector line */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            top: 52,
            left: '12.5%',
            right: '12.5%',
            height: 1,
            background: `linear-gradient(90deg, transparent, ${C.gold}44, ${C.blue}44, transparent)`,
          }} className="lp-step-connector" />

          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 120}>
              <div style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: '1.75rem 1.5rem',
                textAlign: 'center',
                transition: 'box-shadow 0.25s, border-color 0.25s, transform 0.25s',
                cursor: 'default',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(15,23,42,0.1)';
                  e.currentTarget.style.borderColor = C.gold;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Number */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.navy}, ${C.steel})`,
                  color: C.gold,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FONT_HEADING,
                  fontSize: '1rem',
                  fontWeight: 700,
                  margin: '0 auto 1.25rem',
                }}>
                  {s.num}
                </div>

                {/* Icon */}
                <div style={{
                  color: C.blue,
                  display: 'flex', justifyContent: 'center',
                  marginBottom: '1rem',
                }}>
                  {s.icon}
                </div>

                <h3 style={{
                  fontFamily: FONT_HEADING,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: C.navy,
                  margin: '0 0 0.75rem',
                  lineHeight: 1.35,
                }}>{s.title}</h3>

                <p style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.875rem',
                  color: C.textSm,
                  lineHeight: 1.7,
                  margin: 0,
                }}>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .lp-steps-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-step-connector { display: none !important; }
        }
        @media (max-width: 520px) {
          .lp-steps-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
