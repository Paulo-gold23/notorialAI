import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Icon, Reveal } from './landingUtils';

export default function PricingSection() {
  const tiers = [
    {
      slug: 'starter',
      name: 'Starter',
      credits: 50,
      totalBRL: 'R$\u00A075',
      rateLabel: 'R$\u00A01,50/pág.',
      desc: 'Perfeito para começar e processar os primeiros casos.',
      badge: null,
      highlight: false,
    },
    {
      slug: 'basico',
      name: 'Básico',
      credits: 100,
      totalBRL: 'R$\u00A0120',
      rateLabel: 'R$\u00A01,20/pág.',
      desc: 'Ideal para advogados com demanda inicial regular.',
      badge: null,
      highlight: false,
    },
    {
      slug: 'profissional',
      name: 'Profissional',
      credits: 300,
      totalBRL: 'R$\u00A0270',
      rateLabel: 'R$\u00A00,90/pág.',
      desc: 'Para escritórios com alta demanda de análises — o mais escolhido.',
      badge: 'Mais Popular',
      highlight: true,
    },
    {
      slug: 'escritorio',
      name: 'Escritório',
      credits: 500,
      totalBRL: 'R$\u00A0350',
      rateLabel: 'R$\u00A00,70/pág.',
      desc: 'Para grandes equipes jurídicas com alto volume de casos.',
      badge: null,
      highlight: false,
    },
    {
      slug: 'enterprise',
      name: 'Enterprise',
      credits: 1000,
      totalBRL: 'R$\u00A0500',
      rateLabel: 'R$\u00A00,50/pág.',
      desc: 'Volume máximo e a maior economia por página do sistema.',
      badge: 'Melhor Valor',
      highlight: false,
    },
  ];

  return (
    <section id="pricing" style={{
      padding: '6rem 1.5rem',
      background: `linear-gradient(180deg, ${C.navyMid} 0%, ${C.navy} 100%)`,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
            }}>Créditos</span>
            <h2 style={{
              fontFamily: FONT_HEADING,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              fontWeight: 600,
              color: C.white,
              margin: '0 0 1rem',
              lineHeight: 1.25,
            }}>Quanto mais páginas,<br />menor o preço por página</h2>
            <p style={{
              fontFamily: FONT_BODY,
              fontSize: '0.95rem',
              color: 'rgba(255,255,255,0.45)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.7,
            }}>
              Sem mensalidade. Sem contrato. Compre créditos conforme sua demanda
              — de R$&nbsp;1,50 até R$&nbsp;0,50 por página, pagos via PIX.
            </p>
          </div>
        </Reveal>

        {/* Package grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1rem',
          alignItems: 'end',
          marginBottom: '1.5rem',
        }} className="lp-pricing-grid">
          {tiers.map((p, i) => (
            <Reveal key={p.slug} delay={i * 80}>
              <div style={{
                background: p.highlight ? C.white : 'rgba(255,255,255,0.04)',
                border: p.highlight ? `2px solid ${C.gold}` : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: p.highlight ? '2rem 1.25rem' : '1.5rem 1.25rem',
                position: 'relative',
                transition: 'transform 0.25s, box-shadow 0.25s',
                cursor: 'default',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = p.highlight
                    ? '0 20px 48px rgba(196,150,58,0.25)'
                    : '0 16px 40px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Badge */}
                {p.badge && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%',
                    transform: 'translateX(-50%)',
                    background: p.highlight
                      ? `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`
                      : 'rgba(255,255,255,0.15)',
                    color: p.highlight ? C.navy : C.white,
                    padding: '0.25rem 0.75rem',
                    borderRadius: 100,
                    fontSize: '0.7rem',
                    fontFamily: FONT_BODY,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>{p.badge}</div>
                )}

                {/* Name */}
                <div style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: p.highlight ? C.blue : C.gold,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.25rem',
                }}>{p.name}</div>

                {/* Credits */}
                <div style={{
                  fontFamily: FONT_HEADING,
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  color: p.highlight ? C.navy : C.white,
                  lineHeight: 1.1,
                }}>{p.credits}<span style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.75rem',
                  fontWeight: 400,
                  color: p.highlight ? C.textSm : 'rgba(255,255,255,0.4)',
                  marginLeft: '0.3rem',
                }}>páginas</span></div>

                {/* Total price */}
                <div style={{
                  fontFamily: FONT_HEADING,
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  color: p.highlight ? C.navy : C.white,
                  margin: '0.5rem 0 0.15rem',
                }}>{p.totalBRL}</div>

                {/* Rate */}
                <div style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.72rem',
                  color: p.highlight ? C.blue : C.gold,
                  fontWeight: 700,
                  marginBottom: '0.75rem',
                }}>{p.rateLabel}</div>

                {/* Desc */}
                <p style={{
                  fontFamily: FONT_BODY,
                  fontSize: '0.8rem',
                  color: p.highlight ? C.textSm : 'rgba(255,255,255,0.4)',
                  margin: '0 0 1.25rem',
                  lineHeight: 1.55,
                }}>{p.desc}</p>

                {/* CTA */}
                <a href="/login" style={{
                  display: 'block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 7,
                  fontSize: '0.82rem',
                  fontFamily: FONT_BODY,
                  fontWeight: 700,
                  transition: 'transform 0.2s, opacity 0.2s',
                  cursor: 'pointer',
                  background: p.highlight
                    ? `linear-gradient(135deg, ${C.blue}, ${C.blueLt})`
                    : 'rgba(255,255,255,0.07)',
                  color: p.highlight ? C.white : 'rgba(255,255,255,0.75)',
                  border: p.highlight ? 'none' : '1px solid rgba(255,255,255,0.13)',
                }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >Selecionar</a>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Custom package card */}
        <Reveal delay={500}>
          <div style={{
            marginTop: '1rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '1.5rem 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{
                fontFamily: FONT_BODY, fontSize: '0.78rem', fontWeight: 700,
                color: C.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem',
              }}>Sob Medida</div>
              <div style={{ fontFamily: FONT_HEADING, fontSize: '1.1rem', color: C.white, marginBottom: '0.25rem' }}>
                Escolha a quantidade exata que precisa
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>
                5 a 500 páginas · R$&nbsp;1,50/pág · Validade 6 meses
              </div>
            </div>
            <a href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              textDecoration: 'none',
              padding: '0.7rem 1.5rem',
              borderRadius: 8,
              fontFamily: FONT_BODY,
              fontWeight: 700,
              fontSize: '0.875rem',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.13)',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Icon.Zap /> Montar pacote personalizado
            </a>
          </div>
        </Reveal>

        {/* Trust notes */}
        <Reveal>
          <div style={{
            textAlign: 'center', marginTop: '2.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '1.5rem', flexWrap: 'wrap',
          }}>
            {[
              { icon: <Icon.Shield />, label: 'Pagamento seguro via PIX' },
              { icon: <Icon.Clock />, label: 'Créditos válidos por 6 meses' },
              { icon: <Icon.Zap />, label: 'Sem mensalidade ou fidelidade' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: 'rgba(255,255,255,0.35)',
                fontFamily: FONT_BODY,
                fontSize: '0.8rem',
              }}>
                <span style={{ display: 'flex' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .lp-pricing-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .lp-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 400px) {
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
