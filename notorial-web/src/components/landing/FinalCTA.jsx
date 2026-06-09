import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Icon, Reveal } from './landingUtils';

export default function FinalCTA({ session }) {
  return (
    <section style={{
      background: C.bg,
      padding: '6rem 1.5rem',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <div style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, #0d1f3c 100%)`,
            borderRadius: 20,
            padding: 'clamp(2.5rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3rem)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Decoration */}
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `
                radial-gradient(circle at 20% 50%, rgba(196,150,58,0.08) 0%, transparent 60%),
                radial-gradient(circle at 80% 50%, rgba(3,105,161,0.1) 0%, transparent 60%)
              `,
            }} />
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(rgba(196,150,58,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(196,150,58,0.04) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }} />

            <div style={{ position: 'relative' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(196,150,58,0.12)',
                border: '1px solid rgba(196,150,58,0.25)',
                borderRadius: 100,
                padding: '0.35rem 1rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
                <span style={{ color: C.gold, fontSize: '0.78rem', fontFamily: FONT_BODY, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Comece hoje
                </span>
              </div>

              <h2
                style={{
                  fontFamily: FONT_HEADING,
                  fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                  fontWeight: 600,
                  color: C.white,
                  margin: '0 0 1.25rem',
                  lineHeight: 1.2,
                }}
              >
                Transforme horas de trabalho<br />em minutos de resultado
              </h2>

              <p style={{
                fontFamily: FONT_BODY,
                fontSize: '1rem',
                color: 'rgba(255,255,255,0.55)',
                maxWidth: 460,
                margin: '0 auto 2.5rem',
                lineHeight: 1.75,
              }}>
                Junte-se a advogados que já agilizam sua preparação de casos com inteligência artificial.
              </p>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href={session ? "/dashboard" : "/login"} id="final-cta-btn" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
                  color: C.navy,
                  textDecoration: 'none',
                  padding: '0.9rem 2rem',
                  borderRadius: 8,
                  fontSize: '0.95rem',
                  fontFamily: FONT_BODY,
                  fontWeight: 700,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 4px 20px rgba(196,150,58,0.3)',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(196,150,58,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(196,150,58,0.3)'; }}
                >
                  {session ? "Acessar Dashboard" : "Criar conta gratuitamente"}
                  <Icon.ArrowRight />
                </a>
                <a href="#how" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  color: 'rgba(255,255,255,0.6)',
                  textDecoration: 'none',
                  padding: '0.9rem 1.5rem',
                  borderRadius: 8,
                  fontSize: '0.95rem',
                  fontFamily: FONT_BODY,
                  border: '1px solid rgba(255,255,255,0.12)',
                  transition: 'color 0.2s, border-color 0.2s',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                >Saiba mais</a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
