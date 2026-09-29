import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from './ToastContext';
import { useNavigate } from 'react-router-dom';

const POLL_ACTIVE = 30000;  // 30s when tracking atas
const POLL_IDLE = 60000;    // 60s when idle
const PROCESSING_STATUSES = ['uploading', 'parsing', 'transcribing', 'organizing', 'in_queue'];

/**
 * Background notification listener that polls for ata completion.
 * Renders nothing visible — just monitors active pipelines and shows
 * a toast when an ata transitions to 'ready'.
 * 
 * Optimizations:
 * - Uses session.user.id directly (advogados.id = auth.users.id)
 * - Pauses polling when tab is hidden (visibilitychange)
 * - Adaptive interval: 30s active / 60s idle
 */
export default function BackgroundNotificationListener({ session }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [trackedAtas, setTrackedAtas] = useState(new Set());
  const intervalRef = useRef(null);
  const trackedRef = useRef(trackedAtas);

  // Keep ref in sync with state (for use inside interval callback)
  useEffect(() => {
    trackedRef.current = trackedAtas;
  }, [trackedAtas]);

  const checkForCompletions = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      // Use session.user.id directly — advogados.id references auth.users(id)
      const advogadoId = session.user.id;

      // Check for atas in processing state (to start tracking)
      const { data: processing } = await supabase
        .from('atas')
        .select('id, status, titulo')
        .eq('advogado_id', advogadoId)
        .in('status', PROCESSING_STATUSES)
        .is('deleted_at', null);

      if (processing && processing.length > 0) {
        const newIds = new Set(trackedRef.current);
        processing.forEach(a => newIds.add(a.id));
        if (newIds.size !== trackedRef.current.size) {
          setTrackedAtas(newIds);
        }
      }

      // Check tracked atas for completion
      if (trackedRef.current.size === 0) return;

      const trackedIds = Array.from(trackedRef.current);
      const { data: completed } = await supabase
        .from('atas')
        .select('id, status, titulo')
        .in('id', trackedIds)
        .eq('status', 'ready')
        .is('deleted_at', null);

      if (completed && completed.length > 0) {
        const newTracked = new Set(trackedRef.current);
        completed.forEach(ata => {
          newTracked.delete(ata.id);
          const title = ata.titulo || 'Relatório Técnico';
          toast.success(
            `🎉 "${title}" foi gerada com sucesso!`,
            8000
          );
        });
        setTrackedAtas(newTracked);
      }

      // Also clean up any tracked atas that errored out
      const { data: errored } = await supabase
        .from('atas')
        .select('id')
        .in('id', trackedIds)
        .eq('status', 'error')
        .is('deleted_at', null);

      if (errored && errored.length > 0) {
        const newTracked = new Set(trackedRef.current);
        errored.forEach(ata => newTracked.delete(ata.id));
        if (newTracked.size !== trackedRef.current.size) {
          setTrackedAtas(newTracked);
        }
      }
    } catch (err) {
      // Silent fail — background polling should never disrupt the UI
      console.warn('[BackgroundNotificationListener] Poll error:', err.message);
    }
  }, [session, toast]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const interval = trackedRef.current.size > 0 ? POLL_ACTIVE : POLL_IDLE;
      intervalRef.current = setInterval(checkForCompletions, interval);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible — poll immediately and restart interval
        checkForCompletions();
        startPolling();
      } else {
        // Tab hidden — pause polling to save DB queries
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    // Initial check + start polling
    checkForCompletions();
    startPolling();

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, checkForCompletions]);

  // Adjust polling speed when tracked atas change
  useEffect(() => {
    if (!session?.user?.id) return;
    if (document.visibilityState !== 'visible') return;
    // Restart interval with appropriate speed
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = trackedAtas.size > 0 ? POLL_ACTIVE : POLL_IDLE;
    intervalRef.current = setInterval(checkForCompletions, interval);
  }, [trackedAtas.size, session, checkForCompletions]);

  // This component renders nothing — it's purely behavioral
  return null;
}
