import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Icon } from './landingUtils';

function HeroCard() {
  const steps = [
    { color: C.gold,  label: 'Upload do ZIP do WhatsApp' },
    { color: C.blue,  label: 'Transcrição automática de áudios' },
    { color: '#16a34a', label: 'Organização e estruturação com IA' },
    { color: C.gold,  label: 'PDF profissional pronto para uso' },
  ];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 16,
      padding: '2rem',
      width: '100%',
      maxWidth: 420,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          width: 40, height: 40,
          background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.navy,
        }}>
          <Icon.FileText />
        </div>
        <div>
          <div style={{ color: C.white, fontFamily: FONT_BODY, fontWeight: 600, fontSize: '0.9rem' }}>Material Preparatório</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONT_BODY, fontSize: '0.75rem', marginTop: 2 }}>Gerado com IA · Pronto em minutos</div>
        </div>
        <div style={{
          marginLeft: 'auto',
          background: 'rgba(22,163,74,0.15)',
          color: '#4ade80',
          borderRadius: 100,
          padding: '0.2rem 0.7rem',
          fontSize: '0.72rem',
          fontFamily: FONT_BODY,
          fontWeight: 700,
          border: '1px solid rgba(74,222,128,0.2)',
        }}>ativo</div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${s.color}22`,
              border: `1px solid ${s.color}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            </div>
            <div style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '0.5rem 0.75rem',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontFamily: FONT_BODY, fontSize: '0.83rem' }}>{s.label}</span>
            </div>
            <div style={{ color: '#4ade80', flexShrink: 0 }}>
              <Icon.Check />
            </div>
          </div>
        ))}
      </div>

      {/* Stat bar */}
      <div style={{
        marginTop: '1.5rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '0.5rem',
        textAlign: 'center',
      }}>
        {[
          { val: '< 5min', label: 'por processo' },
          { val: '100%', label: 'automatizado' },
          { val: 'PDF', label: 'profissional' },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ color: C.gold, fontFamily: FONT_HEADING, fontSize: '1.2rem', fontWeight: 600 }}>{s.val}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONT_BODY, fontSize: '0.7rem', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeroSection({ session }) {
  return (
    <section
      id="hero"
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: `linear-gradient(160deg, ${C.navy} 0%, #0E2040 55%, #112540 100%)`,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        paddingTop: 68,
      }}
    >
      {/* Decorative background elements */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
      }}>
        {/* Grid lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(196,150,58,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(196,150,58,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }} />
        {/* Glow orbs */}
        <div style={{
          position: 'absolute', top: '15%', right: '8%',
          width: 480, height: 480, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(3,105,161,0.18) 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', left: '5%',
          width: 360, height: 360, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(196,150,58,0.12) 0%, transparent 70%)`,
          filter: 'blur(50px)',
        }} />
      </div>

      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '4rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4rem',
        alignItems: 'center',
        width: '100%',
        position: 'relative',
        zIndex: 1,
      }} className="lp-hero-grid">

        {/* Left — Text */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(196,150,58,0.12)',
            border: `1px solid rgba(196,150,58,0.3)`,
            borderRadius: 100,
            padding: '0.35rem 0.9rem',
            marginBottom: '1.75rem',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
            <span style={{ color: C.gold, fontSize: '0.78rem', fontFamily: FONT_BODY, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Ferramenta para Advogados
            </span>
          </div>

          <h1 style={{
            fontFamily: FONT_HEADING,
            fontSize: 'clamp(2.4rem, 4vw, 3.4rem)',
            fontWeight: 600,
            color: C.white,
            lineHeight: 1.18,
            margin: '0 0 1.5rem',
            letterSpacing: '-0.01em',
          }}>
            Do WhatsApp ao{' '}
            <span style={{
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLt} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              material preparatório
            </span>{' '}
            em minutos
          </h1>

          <p style={{
            fontFamily: FONT_BODY,
            fontSize: '1.1rem',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.75,
            margin: '0 0 2.5rem',
            maxWidth: 480,
          }}>
            O LegisVox analisa conversas do WhatsApp, transcreve áudios e organiza o conteúdo com IA — gerando material preparatório claro e estruturado para apoiar o trabalho do advogado.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={session ? "/dashboard" : "/login"} id="hero-cta-primary" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLt} 100%)`,
              color: C.navy,
              textDecoration: 'none',
              padding: '0.875rem 1.75rem',
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
              {session ? 'Acessar Dashboard' : 'Começar Gratuitamente'}
              <Icon.ArrowRight />
            </a>
            <a href="#how" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontFamily: FONT_BODY,
              transition: 'color 0.2s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.color = C.white}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            >
              Ver como funciona
              <Icon.ChevronRight />
            </a>
          </div>

          {/* Trust badges */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '2.5rem',
            flexWrap: 'wrap',
          }}>
            {[
              { icon: <Icon.Shield />, text: 'INPI Registrado' },
              { icon: <Icon.Award />, text: 'BR512026002376-9' },
            ].map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: 'rgba(255,255,255,0.45)',
                fontSize: '0.78rem',
                fontFamily: FONT_BODY,
              }}>
                <span style={{ color: C.gold, display: 'flex' }}>{b.icon}</span>
                {b.text}
              </div>
            ))}
          </div>
        </div>

        {/* Right — Proof card */}
        <div style={{ display: 'flex', justifyContent: 'center' }} className="lp-hero-right">
          <HeroCard />
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; gap: 3rem !important; }
          .lp-hero-right { display: none !important; }
        }
      `}</style>
    </section>
  );
}
