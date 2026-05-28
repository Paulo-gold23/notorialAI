import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabase';
import { checkIsAdmin } from './services/adminApi';
import { ToastProvider } from './components/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import ServiceStatusBanner from './components/ServiceStatusBanner';
import CPFPromptModal from './components/CPFPromptModal';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Review from './pages/Review';
import AdminDashboard from './pages/AdminDashboard';
import Credits from './pages/Credits';
import Profile from './pages/Profile';
import TermsOfUse from './pages/TermsOfUse';
import PrivacyPolicy from './pages/PrivacyPolicy';
import LandingPage from './pages/LandingPage';

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

  // Executa o hook que desloga após 120 minutos (2 horas)
  useSessionTimeout(120);

  useEffect(() => {
    const checkApprovalStatus = async (currentSession) => {
      if (!currentSession) {
        setSession(null);
        setIsAdmin(false);
        setNeedsCpf(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('advogados')
          .select('status, cpf_cnpj')
          .eq('id', currentSession.user.id)
          .single();

        if (data?.status === 'pendente') {
          // Force sign out if pending approval
          await supabase.auth.signOut();
          setSession(null);
          setIsAdmin(false);
          setNeedsCpf(false);
        } else {
          setSession(currentSession);
          // Check if CPF is missing
          setNeedsCpf(!data?.cpf_cnpj);
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
                {needsCpf && (
                  <CPFPromptModal onSaved={() => setNeedsCpf(false)} />
                )}
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
        </BrowserRouter>
      </ToastProvider>

    </ErrorBoundary>
    </>
  );
}

export default App;
