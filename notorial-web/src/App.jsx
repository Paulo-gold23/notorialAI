import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabase';
import { checkIsAdmin } from './services/adminApi';
import { ToastProvider } from './components/ToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Review from './pages/Review';
import AdminDashboard from './pages/AdminDashboard';

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

  useEffect(() => {
    // Test admin override
    if (sessionStorage.getItem('notorial_test_admin') === 'true') {
      setSession({
        user: { email: 'demo@notorial.ai', user_metadata: { nome: 'Visitante' } },
      });
      return;
    }

    const checkApprovalStatus = async (currentSession) => {
      if (!currentSession) {
        setSession(null);
        setIsAdmin(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('advogados')
          .select('status')
          .eq('id', currentSession.user.id)
          .single();

        if (data?.status === 'pendente') {
          // Force sign out if pending approval
          await supabase.auth.signOut();
          setSession(null);
          setIsAdmin(false);
        } else {
          setSession(currentSession);
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
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkApprovalStatus(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (sessionStorage.getItem('notorial_test_admin') !== 'true') {
        checkApprovalStatus(session);
      }
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
    <ToastProvider>
      <HashRouter>
        <Routes>
          {!session ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Dashboard isAdmin={isAdmin} />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/review/:id" element={<Review />} />
              <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
