import React, { useState, useEffect } from 'react';
import { Moon, Sun, Monitor, Palette } from 'lucide-react';
import Modal from './Modal';

const themes = [
  { id: 'dark', name: 'Escuro', icon: Moon },
  { id: 'light', name: 'Claro', icon: Sun },
  { id: 'system', name: 'Sistema', icon: Monitor },
  { id: 'blue', name: 'Azure', icon: Palette, className: 'theme-blue' },
  { id: 'emerald', name: 'Esmeralda', icon: Palette, className: 'theme-emerald' },
  { id: 'sepia', name: 'Sépia', icon: Palette, className: 'theme-sepia' },
];

export default function SettingsModal({ isOpen, onClose }) {
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const applyTheme = (themeId) => {
    const root = document.documentElement;
    // Remove all theme classes
    themes.forEach(t => {
      if (t.className) root.classList.remove(t.className);
    });
    root.classList.remove('dark', 'light');

    let effectiveTheme = themeId;
    if (themeId === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    if (effectiveTheme === 'dark' || effectiveTheme === 'light') {
      root.classList.add(effectiveTheme);
    }

    // Apply special theme classes
    const themeObj = themes.find(t => t.id === themeId);
    if (themeObj?.className) {
      root.classList.add(themeObj.className);
    }

    localStorage.setItem('theme', themeId);
    setCurrentTheme(themeId);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurações">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section>
          <h4 style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '1rem',
          }}>
            Aparência
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
          }}>
            {themes.map((theme) => {
              const Icon = theme.icon;
              const isActive = currentTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => applyTheme(theme.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: isActive ? '2px solid var(--primary-color)' : '2px solid var(--border-color)',
                    background: isActive ? 'var(--primary-glow)' : 'var(--surface-color)',
                    color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
                    fontFamily: 'inherit',
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--border-hover)';
                      e.currentTarget.style.color = 'var(--text-main)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }
                  }}
                >
                  <Icon size={24} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{
          paddingTop: '1rem',
          borderTop: '1px solid var(--border-color)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <span>Notorial AI v1.0.0</span>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-color)',
                cursor: 'pointer',
                fontWeight: 600,
                fontFamily: 'inherit',
                fontSize: '0.8rem',
              }}
            >
              Concluído
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
