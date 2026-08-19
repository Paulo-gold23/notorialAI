import React from 'react';
import { C, FONT_HEADING, FONT_BODY, Reveal } from './landingUtils';

export default function StatsBar() {
  const stats = [
    { value: '1.200+', label: 'Relatórios processados' },
    { value: 'Alta', label: 'Precisão na transcrição' },
    { value: 'Minutos', label: 'Tempo médio por análise' },
    { value: 'IA Avançada', label: 'Tecnologia de ponta' },
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
