import React, { useEffect, useState } from 'react';
import Logo from '../Logo';
import { C, FONT_HEADING, FONT_BODY, Icon } from './landingUtils';

export default function Navbar({ session }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    transition: 'all 0.3s ease',
    background: scrolled ? 'rgba(15,23,42,0.97)' : 'transparent',
    backdropFilter: scrolled ? 'blur(12px)' : 'none',
    borderBottom: scrolled ? `1px solid rgba(255,255,255,0.07)` : '1px solid transparent',
  };

  const links = [
    { label: 'Como Funciona', href: '#how' },
    { label: 'Funcionalidades', href: '#features' },
    { label: 'Créditos', href: '#pricing' },
    { label: 'Dúvidas', href: '#faq' },
  ];

  return (
    <header style={navStyle} role="banner">
      <nav style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 1.5rem',
        height: 68,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <a href="#" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <Logo size={36} />
          <span style={{ fontFamily: FONT_HEADING, fontSize: '1.35rem', fontWeight: 700, color: C.white, letterSpacing: '0.01em' }}>
            LegisVox
          </span>
        </a>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }} className="lp-desktop-nav">
          {links.map(l => (
            <a key={l.label} href={l.href} style={{
              color: 'rgba(255,255,255,0.75)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontFamily: FONT_BODY,
              fontWeight: 400,
              transition: 'color 0.2s',
            }}
              onMouseEnter={e => e.target.style.color = C.white}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.75)'}
            >{l.label}</a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="lp-desktop-cta">
          {session ? (
            <a href="/dashboard" style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
              color: C.navy,
              textDecoration: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: 6,
              fontSize: '0.875rem',
              fontFamily: FONT_BODY,
              fontWeight: 700,
              transition: 'opacity 0.2s, transform 0.2s',
              cursor: 'pointer',
              display: 'inline-block',
            }}
              onMouseEnter={e => { e.target.style.opacity = '0.9'; e.target.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }}
            >Acessar Dashboard</a>
          ) : (
            <>
              <a href="/login" style={{
                color: 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontFamily: FONT_BODY,
                transition: 'color 0.2s',
              }}
                onMouseEnter={e => e.target.style.color = C.white}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.8)'}
              >Entrar</a>
              <a href="/login" style={{
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
                color: C.navy,
                textDecoration: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: 6,
                fontSize: '0.875rem',
                fontFamily: FONT_BODY,
                fontWeight: 700,
                transition: 'opacity 0.2s, transform 0.2s',
                cursor: 'pointer',
                display: 'inline-block',
              }}
                onMouseEnter={e => { e.target.style.opacity = '0.9'; e.target.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }}
              >Iniciar Grátis</a>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          id="lp-menu-toggle"
          aria-label="Abrir menu"
          onClick={() => setMenuOpen(v => !v)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: C.white,
            cursor: 'pointer',
            padding: '0.25rem',
          }}
          className="lp-hamburger"
        >
          {menuOpen ? <Icon.X /> : <Icon.Menu />}
        </button>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{
          background: C.navyMid,
          padding: '1rem 1.5rem 1.5rem',
          borderTop: `1px solid rgba(255,255,255,0.07)`,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          {links.map(l => (
            <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)} style={{
              color: 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              fontFamily: FONT_BODY,
              fontSize: '1rem',
              padding: '0.5rem 0',
              borderBottom: `1px solid rgba(255,255,255,0.06)`,
            }}>{l.label}</a>
          ))}
          {session ? (
            <a href="/dashboard" style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
              color: C.navy,
              textDecoration: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: 6,
              textAlign: 'center',
              fontFamily: FONT_BODY,
              fontWeight: 700,
              marginTop: '0.5rem',
            }}>Acessar Dashboard</a>
          ) : (
            <a href="/login" style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldLt})`,
              color: C.navy,
              textDecoration: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: 6,
              textAlign: 'center',
              fontFamily: FONT_BODY,
              fontWeight: 700,
              marginTop: '0.5rem',
            }}>Iniciar Grátis</a>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .lp-desktop-nav, .lp-desktop-cta { display: none !important; }
          .lp-hamburger { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
