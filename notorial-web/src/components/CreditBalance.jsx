import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { creditsApi } from '../services/creditsApi';
import { Coins, Plus } from 'lucide-react';

export default function CreditBalance() {
  const [balance, setBalance] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBalance = () => creditsApi.getBalance().then(bal => setBalance(bal)).catch(console.error);
    fetchBalance();
    
    // Listen for custom event indicating balance might have changed
    window.addEventListener('creditsUpdated', fetchBalance);
    return () => window.removeEventListener('creditsUpdated', fetchBalance);
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
        {Math.floor(balance)} <span style={{ color: 'var(--text-muted)' }}>créditos</span>
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
