import React from 'react';
import Logo from '../Logo';
import { C, FONT_HEADING, FONT_BODY, Icon } from './landingUtils';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{
      background: C.navy,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '3rem 1.5rem',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '3rem',
          paddingBottom: '2.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }} className="lp-footer-grid">
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{
                width: 32, height: 32,
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
                borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.navy,
              }}>
                <Icon.Scale />
              </div>
              <span style={{ fontFamily: FONT_HEADING, fontSize: '1.2rem', fontWeight: 700, color: C.white }}>LegisVox</span>
            </div>
            <p style={{
              fontFamily: FONT_BODY,
              fontSize: '0.875rem',
              color: 'rgba(255,255,255,0.4)',
              lineHeight: 1.7,
              maxWidth: 300,
              margin: '0 0 1rem',
            }}>
              Plataforma de automação jurídica com inteligência artificial para advogados e escritórios brasileiros.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              color: 'rgba(255,255,255,0.25)',
              fontSize: '0.75rem',
              fontFamily: FONT_BODY,
            }}>
              <Icon.Shield />
              <span>INPI BR512026002376-9</span>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 style={{ fontFamily: FONT_BODY, fontSize: '0.8rem', fontWeight: 700, color: C.gold, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 1.25rem' }}>Legal</h4>
            {[
              { label: 'Termos de Uso', href: '/terms' },
              { label: 'Política de Privacidade', href: '/privacy' },
              { label: 'LGPD', href: '/privacy' },
            ].map(l => (
              <a key={l.label} href={l.href} style={{
                display: 'block',
                fontFamily: FONT_BODY,
                fontSize: '0.875rem',
                color: 'rgba(255,255,255,0.45)',
                textDecoration: 'none',
                marginBottom: '0.6rem',
                transition: 'color 0.2s',
              }}
                onMouseEnter={e => e.target.style.color = C.white}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.45)'}
              >{l.label}</a>
            ))}
          </div>

          {/* Produto */}
          <div>
            <h4 style={{ fontFamily: FONT_BODY, fontSize: '0.8rem', fontWeight: 700, color: C.gold, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 1.25rem' }}>Produto</h4>
            {[
              { label: 'Como Funciona', href: '#how' },
              { label: 'Funcionalidades', href: '#features' },
              { label: 'Planos', href: '#pricing' },
              { label: 'Entrar', href: '/login' },
            ].map(l => (
              <a key={l.label} href={l.href} style={{
                display: 'block',
                fontFamily: FONT_BODY,
                fontSize: '0.875rem',
                color: 'rgba(255,255,255,0.45)',
                textDecoration: 'none',
                marginBottom: '0.6rem',
                transition: 'color 0.2s',
              }}
                onMouseEnter={e => e.target.style.color = C.white}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.45)'}
              >{l.label}</a>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '1.5rem',
          flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <p style={{ fontFamily: FONT_BODY, fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
            © {year} LegisVox. Todos os direitos reservados.
          </p>
          <p style={{ fontFamily: FONT_BODY, fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
            Feito com tecnologia de IA de próxima geração para a advocacia brasileira.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .lp-footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .lp-footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
