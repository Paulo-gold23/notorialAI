import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/supabase';
import { ToastProvider } from './components/ToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Review from './pages/Review';

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

  useEffect(() => {
    // Test admin override
    if (localStorage.getItem('notorial_test_admin') === 'true') {
      setSession({
        user: { email: 'admin@notorial.ai', user_metadata: { nome: 'Admin (Modo Teste)' } },
      });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (localStorage.getItem('notorial_test_admin') !== 'true') {
        setSession(session || null);
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
      <BrowserRouter>
        <Routes>
          {!session ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/review/:id" element={<Review />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
