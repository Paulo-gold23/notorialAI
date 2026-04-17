import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, XCircle, X, RefreshCw, ExternalLink } from 'lucide-react';

/*
 * ServiceStatusBanner
 * ─────────────────────────────────────────────────────────────
 * Polls https://status.supabase.com/api/v2/summary.json every
 * POLL_INTERVAL_MS and surfaces any active incident as a banner.
 *
 * Severity mapping (Supabase / Atlassian Statuspage):
 *   "none"     → no banner
 *   "minor"    → yellow warning
 *   "major"    → orange alert
 *   "critical" → red critical
 *
 * The banner is dismissible but re-appears if a new incident
 * is detected (different ID).
 */

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const STATUS_API = 'https://status.supabase.com/api/v2/summary.json';
const STATUS_PAGE = 'https://status.supabase.com';

const SEVERITY = {
  minor:    { color: '#92400E', bg: '#FEF3C7', border: '#F59E0B', icon: AlertTriangle, label: 'Aviso',  },
  major:    { color: '#7C2D12', bg: '#FED7AA', border: '#F97316', icon: AlertTriangle, label: 'Alerta', },
  critical: { color: '#7F1D1D', bg: '#FEE2E2', border: '#EF4444', icon: XCircle,      label: 'Crítico' },
};

export default function ServiceStatusBanner() {
  const [incident, setIncident]     = useState(null);   // { id, name, severity, updatedAt }
  const [dismissed, setDismissed]   = useState(null);   // dismissed incident id
  const [checking, setChecking]     = useState(false);

  const fetchStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(STATUS_API, { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      const indicator = data?.status?.indicator;        // "none"|"minor"|"major"|"critical"
      const incidents  = data?.incidents ?? [];         // active incidents array

      if (!indicator || indicator === 'none' || incidents.length === 0) {
        setIncident(null);
        return;
      }

      // Grab the most recent active incident
      const latest = incidents.sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      )[0];

      setIncident({
        id:        latest.id,
        name:      latest.name,
        severity:  indicator,
        updatedAt: latest.updated_at,
        url:       latest.shortlink || STATUS_PAGE,
      });
    } catch (_) {
      // Network error fetching status page — don't surface another error
    } finally {
      setChecking(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Catch Supabase auth failures surfaced on the window (e.g. "Failed to fetch")
  useEffect(() => {
    const handleUnhandledRejection = (e) => {
      const msg = e?.reason?.message || '';
      const isAuthFail =
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('networkerror') ||
        msg.toLowerCase().includes('load failed');

      if (isAuthFail && !incident) {
        // Synthetic incident: we couldn't reach the server
        setIncident(prev => prev ?? {
          id:       'local-fetch-error',
          name:     'Falha de conexão com o servidor de autenticação',
          severity: 'minor',
          updatedAt: new Date().toISOString(),
          url:      STATUS_PAGE,
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, [incident]);

  // Don't render if no incident, or if this incident was already dismissed
  if (!incident || dismissed === incident.id) return null;

  const sev = SEVERITY[incident.severity] ?? SEVERITY.minor;
  const Icon = sev.icon;

  const formattedTime = incident.updatedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(incident.updatedAt)
      )
    : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     9999,
        background: sev.bg,
        borderBottom: `3px solid ${sev.border}`,
        padding:    '0.6rem 1rem',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap:        '0.75rem',
        fontSize:   '0.85rem',
        fontWeight: 500,
        color:      sev.color,
        animation:  'slideDown 0.3s ease-out',
        boxShadow:  '0 2px 12px rgba(0,0,0,0.1)',
        flexWrap:   'wrap',
      }}
    >
      {/* Left: icon + message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
        <Icon size={16} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, marginRight: '0.25rem' }}>
          [{sev.label}] Supabase:
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {incident.name}
        </span>
        {formattedTime && (
          <span style={{ opacity: 0.65, fontWeight: 400, whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
            · atualizado {formattedTime}
          </span>
        )}
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={fetchStatus}
          disabled={checking}
          title="Verificar novamente"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.25rem 0.6rem',
            borderRadius: 6,
            border: `1px solid ${sev.border}`,
            background: 'transparent',
            color: sev.color,
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: checking ? 'not-allowed' : 'pointer',
            opacity: checking ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <RefreshCw size={12} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
          {checking ? 'Verificando…' : 'Atualizar'}
        </button>

        <a
          href={incident.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver status oficial"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.25rem 0.6rem',
            borderRadius: 6,
            border: `1px solid ${sev.border}`,
            background: 'transparent',
            color: sev.color,
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <ExternalLink size={12} />
          Status
        </a>

        <button
          onClick={() => setDismissed(incident.id)}
          title="Fechar aviso"
          style={{
            display: 'flex', alignItems: 'center',
            background: 'none', border: 'none',
            cursor: 'pointer', color: sev.color,
            padding: '0.2rem', borderRadius: 4,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <X size={16} />
        </button>
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
