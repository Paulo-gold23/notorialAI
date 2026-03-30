import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    }, 250);
  }, []);

  const addToast = useCallback((message, variant = 'info', duration = 3000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, variant, exiting: false }]);
    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const toast = useMemo(() => ({
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration ?? 5000),
    info: (msg, duration) => addToast(msg, 'info', duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration ?? 4000),
  }), [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastContainer({ toasts, onClose }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const Icon = ICONS[t.variant] || Info;
        return (
          <div
            key={t.id}
            className={`toast toast-${t.variant} ${t.exiting ? 'toast-exit' : ''}`}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="toast-close" onClick={() => onClose(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
