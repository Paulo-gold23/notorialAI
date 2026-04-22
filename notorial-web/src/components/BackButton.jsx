import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ to = '/dashboard', label = 'Voltar ao Dashboard' }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(to)}
      className="btn-ghost"
      style={{
        padding: '0.5rem 0.875rem',
        borderRadius: '0.5rem',
        border: '1px solid var(--border-color)',
        fontSize: '0.875rem',
        fontWeight: 500,
        marginBottom: '1.5rem',
        transition: 'all 0.2s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );
}
