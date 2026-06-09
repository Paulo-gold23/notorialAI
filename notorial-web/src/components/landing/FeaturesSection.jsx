import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Icon, Reveal } from './landingUtils';

export default function FeaturesSection() {
  const features = [
    {
      icon: <Icon.Mic />,
      title: 'Transcrição Precisa de Áudios',
      desc: 'Groq Whisper-v3 com 97%+ de precisão. Identifica cada participante e mapeia falas ao contexto correto da conversa.',
      tag: 'IA Avançada',
    },
    {
      icon: <Icon.FileText />,
      title: 'Linguagem Jurídica Técnica',
      desc: 'GPT-4o estrutura o conteúdo em duas versões: preparatória (clareza) e formal (técnica), prontas para protocolo.',
      tag: 'Dual Output',
    },
    {
      icon: <Icon.Shield />,
      title: 'Integridade Documental',
      desc: 'Hash SHA-256 gerado automaticamente para cada documento. Rastreabilidade e autenticidade garantidas.',
      tag: 'Segurança',
    },
    {
      icon: <Icon.Clock />,
      title: 'Processamento em Minutos',
      desc: 'Áudios processados em paralelo com asyncio. Documentos entregues em menos de 5 minutos, independente do volume.',
      tag: 'Velocidade',
    },
    {
      icon: <Icon.Zap />,
      title: 'PDF Profissional Automático',
      desc: 'Gotenberg converte o documento revisado em PDF com formatação jurídica, proteção de senha e cabeçalho personalizado.',
      tag: 'Export',
    },
    {
      icon: <Icon.Scale />,
      title: 'Conformidade com LGPD',
      desc: 'Deleção automática por cron job após período configurável. Zero retenção desnecessária de dados sensíveis.',
      tag: 'Compliance',
    },
  ];

  return (
    <section id="features" style={{
      background: C.navyMid,
      padding: '6rem 1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* BG decoration */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '20%', right: '-5%',
        width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(3,105,161,0.12) 0%, transparent 70%)`,
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span style={{
              display: 'inline-block',
              background: 'rgba(196,150,58,0.1)',
              color: C.gold,
              border: `1px solid rgba(196,150,58,0.25)`,
              borderRadius: 100,
              padding: '0.35rem 1rem',
              fontSize: '0.78rem',
              fontFamily: FONT_BODY,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}>Funcionalidades</span>
            <h2 style={{
              fontFamily: FONT_HEADING,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              fontWeight: 600,
              color: C.white,
              margin: '0 0 1rem',
              lineHeight: 1.25,
            }}>
              Tudo que um advogado<br />precisa em uma plataforma
            </h2>
            <p style={{
              fontFamily: FONT_BODY,
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.5)',
              maxWidth: 480,
              margin: '0 auto',
              lineHeight: 1.7,
            }}>
              Desenvolvido com os requisitos específicos da prática jurídica brasileira.
            </p>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.25rem',
        }} className="lp-features-grid">
          {features.map((f, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '1.75rem',
                transition: 'background 0.25s, border-color 0.25s, transform 0.25s',
                cursor: 'default',
                height: '100%',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = `rgba(196,150,58,0.3)`;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem',
                }}>
                  <div style={{
                    width: 44, height: 44,
                    background: `rgba(196,150,58,0.12)`,
                    border: `1px solid rgba(196,150,58,0.2)`,
                    borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.gold,
                    flexShrink: 0,
                  }}>{f.icon}</div>
                  <span style={{
                    background: 'rgba(3,105,161,0.2)',
                    color: '#7DD3F8',
                    border: '1px solid rgba(3,105,161,0.3)',
                    borderRadius: 100,
                    padding: '0.15rem 0.6rem',
                    fontSize: '0.7rem',
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    marginTop: 4,
                    whiteSpace: 'nowrap',
                  }}>{f.tag}</span>
                </div>
                <h3 style={{
                  fontFamily: FONT_HEADING,
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: C.white,
                  margin: '0 0 0.6rem',
                  lineHeight: 1.35,
                }}>{f.title}</h3>
                <p style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.87rem',
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.7,
                  margin: 0,
                }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .lp-features-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
