import React, { useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';

/* ============================================================
   LegisVox — Landing Page
   Design System: Trust & Authority
   Palette: Navy #0F172A | Steel #334155 | CTA #0369A1 | Gold #C4963A
   Typography: EB Garamond (headings) + Lato (body)
   Target: Advogados e escritórios de advocacia
   ============================================================ */

// ── Inline style constants ───────────────────────────────────
const C = {
  navy:   '#0F172A',
  navyMid:'#1E293B',
  steel:  '#334155',
  blue:   '#0369A1',
  blueLt: '#0284C7',
  gold:   '#C4963A',
  goldLt: '#E2B55A',
  bg:     '#F8FAFC',
  bgAlt:  '#F1F5F9',
  white:  '#FFFFFF',
  text:   '#020617',
  textMd: '#334155',
  textSm: '#64748B',
  border: '#E2E8F0',
};

const FONT_HEADING = "'EB Garamond', Georgia, serif";
const FONT_BODY    = "'Lato', 'Inter', sans-serif";

// ── Intersection Observer hook for reveal animations ─────────
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setVisible(true); return; }

    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, visible];
}

// ── Shared reveal wrapper ─────────────────────────────────────
function Reveal({ children, delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── SVG Icons (Lucide-style, consistent 24×24) ────────────────
const Icon = {
  Scale: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M3 7l9-4 9 4M6 21H3a1 1 0 01-1-1v-5l4-2 4-2V21H6z"/>
      <path d="M18 21h3a1 1 0 001-1v-5l-4-2-4-2V21h4z"/>
    </svg>
  ),
  Zap: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Shield: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  FileText: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Mic: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
  Clock: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  MessageSquare: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  Award: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  Menu: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  X: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Quote: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill={C.gold} stroke="none">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
    </svg>
  ),
};

// ── Navbar ────────────────────────────────────────────────────
function Navbar() {
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
          <a href="/#/login" style={{
            color: 'rgba(255,255,255,0.8)',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontFamily: FONT_BODY,
            transition: 'color 0.2s',
          }}
            onMouseEnter={e => e.target.style.color = C.white}
            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.8)'}
          >Entrar</a>
          <a href="/#/login" style={{
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
          <a href="/#/login" style={{
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

// ── Hero Section ──────────────────────────────────────────────
function Hero() {
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
            <a href="/#/login" id="hero-cta-primary" style={{
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
              Começar Gratuitamente
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

// ── Stats Bar ─────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: '1.200+', label: 'Processo analisados' },
    { value: '97%+', label: 'Precisão na transcrição' },
    { value: '< 5min', label: 'Tempo médio por análise' },
    { value: 'Groq + GPT-4o', label: 'Tecnologia de IA' },
  ];

  return (
    <section style={{
      background: C.navyMid,
      borderTop: `1px solid rgba(255,255,255,0.05)`,
      borderBottom: `1px solid rgba(255,255,255,0.05)`,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '1.75rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
      }} className="lp-stats-grid">
        {stats.map((s, i) => (
          <Reveal key={i} delay={i * 80}>
            <div style={{
              textAlign: 'center',
              padding: '0.5rem',
              borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
            }}>
              <div style={{ fontFamily: FONT_HEADING, fontSize: '1.6rem', fontWeight: 600, color: C.gold }}>{s.value}</div>
              <div style={{ fontFamily: FONT_BODY, fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{s.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
      <style>{`
        @media (max-width: 640px) {
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────
function HowItWorks() {
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

// ── Features Section ──────────────────────────────────────────
function Features() {
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
      desc: 'GPT-4o estrutura o conteúdo em duas versões: preparatória (clareza) e cartorária (técnica), prontas para protocolo.',
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


// ── FAQ Section ───────────────────────────────────────────────
function FAQ() {
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
      q: 'Os dados das conversôes ficam armazenados?',
      a: 'Não. O LegisVox foi projetado com conformidade LGPD: os dados são processados e apagados automaticamente após o período configurado. Nenhum conteúdo de conversa é retido desnecessariamente.',
    },
    {
      q: 'O PDF gerado é editável?',
      a: 'Sim. Antes de exportar o PDF, o advogado tem acesso a um editor completo onde pode revisar, ajustar e adicionar notas. O arquivo final é gerado após a revisão e inclui hash SHA-256 para integridade.',
    },
    {
      q: 'Funciona com conversôes longas com muitos áudios?',
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

// ── Pricing ───────────────────────────────────────────────────
function Pricing() {
  // Mirror exact packages from credit_packages table in Supabase
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

        {/* ── Package grid: 5 packages in responsive grid ── */}
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
                <a href="/#/login" style={{
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

        {/* ── Sob Medida card ── */}
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
            <a href="/#/login" style={{
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

        {/* Trust note */}
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


// ── CTA Final ──────────────────────────────────────────────────
function FinalCTA() {
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

              <h2 style={{
                fontFamily: FONT_HEADING,
                fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                fontWeight: 600,
                color: C.white,
                margin: '0 0 1.25rem',
                lineHeight: 1.2,
              }}>
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
                <a href="/#/login" id="final-cta-btn" style={{
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
                  Criar conta gratuitamente
                  <Icon.ArrowRight />
                </a>
                <a href="#how" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  color: 'rgba(255,255,255,0.6)',
                  textDecoration: 'none',
                  padding: '0.9rem 1.5rem',
                  borderRadius: 8,
                  fontSize: '0.9rem',
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

// ── Footer ────────────────────────────────────────────────────
function Footer() {
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
              { label: 'Termos de Uso', href: '/#/terms' },
              { label: 'Política de Privacidade', href: '/#/privacy' },
              { label: 'LGPD', href: '/#/privacy' },
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
              { label: 'Entrar', href: '/#/login' },
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

// ── Google Fonts Loader ────────────────────────────────────────
function GoogleFonts() {
  useEffect(() => {
    const id = 'legisvox-lp-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Lato:wght@300;400;700&display=swap";
    document.head.appendChild(link);
    return () => { /* leave font loaded */ };
  }, []);
  return null;
}

// ── Main Export ────────────────────────────────────────────────
export default function LandingPage() {
  // Override body background for this page only
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = C.bg;
    document.documentElement.classList.remove('dark', 'light', 'theme-blue', 'theme-emerald', 'theme-sepia');
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <>
      <GoogleFonts />
      <div style={{ fontFamily: FONT_BODY, color: C.text, background: C.bg }}>
        <Navbar />
        <main>
          <Hero />
          <StatsBar />
          <HowItWorks />
          <Features />
          <FAQ />
          <Pricing />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
