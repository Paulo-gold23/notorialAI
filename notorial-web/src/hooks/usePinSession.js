import { useCallback, useRef } from 'react';

const PIN_SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Manages a temporary "trust session" after PIN verification.
 * Session lives only in memory (useRef) — cleared on page reload.
 * Prevents repeated PIN prompts for consecutive actions within the window.
 */
export function usePinSession() {
    const sessionExpiry = useRef(null);

    const isPinSessionActive = useCallback(() => {
        return sessionExpiry.current && Date.now() < sessionExpiry.current;
    }, []);

    const startPinSession = useCallback(() => {
        sessionExpiry.current = Date.now() + PIN_SESSION_DURATION_MS;
    }, []);

    const clearPinSession = useCallback(() => {
        sessionExpiry.current = null;
    }, []);

    return { isPinSessionActive, startPinSession, clearPinSession };
}
