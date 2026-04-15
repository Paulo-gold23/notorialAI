import React from 'react';
import { WifiOff } from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';

export default function OfflineBanner() {
    const isOnline = useOnlineStatus();

    if (isOnline) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10000,
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#fff',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(239, 68, 68, 0.3)',
            animation: 'slideDown 0.3s ease-out',
        }}>
            <WifiOff size={16} />
            Sem conexão com a internet. Verifique sua rede.
        </div>
    );
}
