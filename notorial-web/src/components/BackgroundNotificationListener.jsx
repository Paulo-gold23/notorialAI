import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from './ToastContext';
import { useNavigate } from 'react-router-dom';

const POLL_INTERVAL = 15000; // 15 seconds
const PROCESSING_STATUSES = ['uploading', 'parsing', 'transcribing', 'organizing', 'in_queue'];

/**
 * Background notification listener that polls for ata completion.
 * Renders nothing visible — just monitors active pipelines and shows
 * a toast when an ata transitions to 'ready'.
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
      // Find advogado_id for this user (advogados.id maps directly to auth user id)
      const { data: advData } = await supabase
        .from('advogados')
        .select('id')
        .eq('id', session.user.id)
        .single();

      if (!advData?.id) return;

      // Check for atas in processing state (to start tracking)
      const { data: processing } = await supabase
        .from('atas')
        .select('id, status, titulo')
        .eq('advogado_id', advData.id)
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

    // Initial check
    checkForCompletions();

    // Set up polling interval
    intervalRef.current = setInterval(checkForCompletions, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [session, checkForCompletions]);

  // This component renders nothing — it's purely behavioral
  return null;
}
