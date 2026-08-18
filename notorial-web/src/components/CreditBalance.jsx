import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { creditsApi } from '../services/creditsApi';
import { Coins, Plus } from 'lucide-react';

export default function CreditBalance() {
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const fetchBalance = () => {
      creditsApi.getBalance()
        .then(bal => {
          if (isMounted) {
            setBalance(bal);
            setError(false);
          }
        })
        .catch(err => {
          if (isMounted) {
            console.error('Failed to fetch credit balance:', err);
            setError(true);
          }
        });
    };
    fetchBalance();
    
    // Listen for custom event indicating balance might have changed
    window.addEventListener('creditsUpdated', fetchBalance);
    return () => {
      isMounted = false;
      window.removeEventListener('creditsUpdated', fetchBalance);
    };
  }, []);

  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{ border: '1px solid var(--border-color)', background: 'var(--surface-color)' }}
      onClick={() => navigate('/credits')}
      title="Gerenciar Créditos"
    >
      <Coins size={16} style={{ color: 'var(--gold-main)' }} />
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
        {error ? '--' : (balance === null ? '...' : Math.floor(balance))} <span style={{ color: 'var(--text-muted)' }}>créditos</span>
      </span>
      <div 
        className="ml-1 rounded-full p-0.5 flex items-center justify-center"
        style={{ background: 'var(--primary-glow)', color: 'var(--gold-main)' }}
      >
        <Plus size={12} strokeWidth={3} />
      </div>
    </div>
  );
}
