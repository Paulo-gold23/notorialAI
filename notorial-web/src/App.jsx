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
  };

  useEffect(() => {
    const checkApprovalStatus = async (currentSession) => {
      if (!currentSession) {
        setSession(null);
        setIsAdmin(false);
        setNeedsCpf(false);
        setNeedsPin(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('advogados')
          .select('status, cpf_cnpj, senha_assinatura_hash')
          .eq('id', currentSession.user.id)
          .single();

        if (data?.status === 'pendente') {
          // Force sign out if pending approval
          await supabase.auth.signOut();
          setSession(null);
          setIsAdmin(false);
          setNeedsCpf(false);
          setNeedsPin(false);
        } else {
          setSession(currentSession);
          // Check if CPF is missing
          setNeedsCpf(!data?.cpf_cnpj);
          // Check if signature PIN is missing
          setNeedsPin(!data?.senha_assinatura_hash);
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
