import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabase';
import { checkIsAdmin } from './services/adminApi';
import { ToastProvider } from './components/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import ServiceStatusBanner from './components/ServiceStatusBanner';
import CPFPromptModal from './components/CPFPromptModal';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Upload = lazy(() => import('./pages/Upload'));
const Review = lazy(() => import('./pages/Review'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Credits = lazy(() => import('./pages/Credits'));
const Profile = lazy(() => import('./pages/Profile'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

import { useSessionTimeout } from './hooks/useSessionTimeout';

// Apply saved theme on app load
function initializeTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  const root = document.documentElement;

  // Clear all theme classes
  root.classList.remove('dark', 'light', 'theme-blue', 'theme-emerald', 'theme-sepia');

  let effective = saved;
  if (saved === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  if (effective === 'dark' || effective === 'light') {
    root.classList.add(effective);
  }

  // Special themes
  const themeClassMap = {
    blue: 'theme-blue',
    emerald: 'theme-emerald',
    sepia: 'theme-sepia',
  };
  if (themeClassMap[saved]) {
    root.classList.add(themeClassMap[saved]);
  }
}

initializeTheme();

function App() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsCpf, setNeedsCpf] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);
  const [needsTermsReaccept, setNeedsTermsReaccept] = useState(false);

  // Executa o hook que desloga após 120 minutos (2 horas)
  useSessionTimeout(120);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error signing out:', e);
    }
    setSession(null);
    setIsAdmin(false);
    setNeedsCpf(false);
    setNeedsPin(false);
    setNeedsTermsReaccept(false);
  };

  useEffect(() => {
    const checkApprovalStatus = async (currentSession) => {
      if (!currentSession) {
        setSession(null);
        setIsAdmin(false);
        setNeedsCpf(false);
        setNeedsPin(false);
        setNeedsTermsReaccept(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('advogados')
          .select('status, cpf_cnpj, senha_assinatura_hash, terms_version, terms_accepted_at')
          .eq('id', currentSession.user.id)
          .single();

        if (data?.status === 'pendente') {
          // Force sign out if pending approval
          await supabase.auth.signOut();
          setSession(null);
          setIsAdmin(false);
          setNeedsCpf(false);
          setNeedsPin(false);
          setNeedsTermsReaccept(false);
        } else {
          setSession(currentSession);
          // Check if CPF is missing
          setNeedsCpf(!data?.cpf_cnpj);
          // Check if signature PIN is missing
          setNeedsPin(!data?.senha_assinatura_hash);
          // Check if terms re-acceptance is needed (version mismatch or never accepted)
          setNeedsTermsReaccept(!data?.terms_version || data.terms_version !== '2.3');
          // Check admin status
          try {
            const adminResult = await checkIsAdmin();
            setIsAdmin(adminResult);
          } catch (e) {
            setIsAdmin(false);
          }
        }
      } catch (err) {
        setSession(currentSession); // fallback
        setIsAdmin(false);
        setNeedsCpf(false);
        setNeedsPin(false);
        setNeedsTermsReaccept(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkApprovalStatus(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkApprovalStatus(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading state with animated spinner
  if (session === undefined) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem',
      }}>
        <div className="sp-wave" style={{ width: 32, height: 32 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando...</span>
      </div>
    );
  }

  return (
    <>
      <OfflineBanner />
      <ServiceStatusBanner />
      <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          {session && needsCpf && (
            <CPFPromptModal 
              userEmail={session.user?.email} 
              onSaved={() => setNeedsCpf(false)} 
              onSignOut={handleSignOut}
            />
          )}
          {session && needsTermsReaccept && !needsCpf && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1rem',
            }}>
              <div style={{
                background: 'var(--bg-card)', borderRadius: '1rem',
                padding: '2rem', maxWidth: '480px', width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                maxHeight: '90vh', overflowY: 'auto',
              }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                  📜 Atualização dos Termos de Uso
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
                  Atualizamos nossos Termos de Uso e Política de Privacidade. Para continuar utilizando o LegisVox, é necessário <strong>ler</strong> e aceitar a nova versão.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <a href="/terms" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--primary-color)', fontSize: '0.85rem', textDecoration: 'underline' }}>
                    📄 Ler Termos de Uso (v2.3) ↗
                  </a>
                  <a href="/privacy" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--primary-color)', fontSize: '0.85rem', textDecoration: 'underline' }}>
                    🔒 Ler Política de Privacidade (v2.3) ↗
                  </a>
                </div>

                {/* Checkbox obrigatório — impede aceite sem leitura */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.25rem' }}>
                  <input
                    type="checkbox"
                    id="reaccept-terms-checkbox"
                    style={{ marginTop: '3px', accentColor: 'var(--primary-color)', flexShrink: 0 }}
                    onChange={(e) => {
                      const btn = document.getElementById('reaccept-terms-btn');
                      if (btn) btn.disabled = !e.target.checked;
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Li e aceito os <strong>Termos de Uso</strong> e a <strong>Política de Privacidade</strong> na versão atual (v2.3).
                    <span style={{ color: 'var(--danger)' }}> *</span>
                  </span>
                </label>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    id="reaccept-terms-btn"
                    className="btn-gradient"
                    disabled
                    style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}
                    onClick={async () => {
                      try {
                        const { apiRequest } = await import('./services/api');
                        const { getDeviceFingerprint } = await import('./services/fingerprint');
                        const fp = await getDeviceFingerprint();
                        await apiRequest('/api/consent/accept', {
                          method: 'POST',
                          body: JSON.stringify({ consent_type: 'terms', device_fingerprint: fp }),
                        });
                        await apiRequest('/api/consent/accept', {
                          method: 'POST',
                          body: JSON.stringify({ consent_type: 'privacy', device_fingerprint: fp }),
                        });
                        setNeedsTermsReaccept(false);
                      } catch (err) {
                        console.error('Failed to accept terms:', err);
                      }
                    }}
                  >
                    Aceitar e Continuar
                  </button>
                  <button
                    style={{
                      flex: 0, padding: '0.75rem 1.25rem', fontSize: '0.85rem',
                      background: 'transparent', border: '1px solid var(--border-color)',
                      borderRadius: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                    onClick={handleSignOut}
                  >
                    Sair
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* PIN setup is prompted organically in Review.jsx when the user tries to sign.
              Do NOT block app entry here — only CPF is mandatory for onboarding. */}
          <Suspense fallback={
            <div style={{
              minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '1rem',
            }}>
              <div className="sp-wave" style={{ width: 32, height: 32 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando...</span>
            </div>
          }>
            <Routes>
              {/* Rotas Públicas */}
              <Route path="/" element={<LandingPage session={session} />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />

              {!session ? (
                <>
                  <Route path="/login" element={<Login />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : (
                <>
                  <Route path="/dashboard" element={<Dashboard isAdmin={isAdmin} />} />
                  <Route path="/upload" element={<Upload />} />
                  <Route path="/review/:id" element={<Review />} />
                  <Route path="/credits" element={<Credits />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </>
              )}
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>

    </ErrorBoundary>
    </>
  );
}

export default App;
