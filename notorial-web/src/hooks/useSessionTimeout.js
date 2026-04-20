import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

// Hook global para verificar inatividade
// Exemplo de uso: useSessionTimeout(30) -> 30 minutos
export function useSessionTimeout(timeoutMinutes = 30) {
  const timerRef = useRef(null);

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Configura o timer para desconectar após o tempo especificado
    timerRef.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log(`[Segurança] Sessão expirada por ${timeoutMinutes} minutos de inatividade.`);
          await supabase.auth.signOut();
          // O listener de authState do App.jsx redicionará o usuário automaticamente
        }
      } catch (e) {
        console.error('Erro no timeout de sessão', e);
      }
    }, timeoutMinutes * 60 * 1000);
  };

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'wheel', 'touchstart', 'click'];
    
    // Iniciar o timer assim que o hook for montado
    resetTimer();

    // Resetar o timer quando houver interação
    const handleAction = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleAction, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleAction);
      });
    };
  }, [timeoutMinutes]);
}
