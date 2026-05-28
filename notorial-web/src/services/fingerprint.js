import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Singleton — initialized once, reused across the app
let _fpPromise = null;

/**
 * Returns the device fingerprint (visitor ID) from FingerprintJS OSS.
 * The result is cached after the first call.
 */
export async function getDeviceFingerprint() {
    if (!_fpPromise) {
        _fpPromise = FingerprintJS.load();
    }
    const fp = await _fpPromise;
    const result = await fp.get();
    return result.visitorId;
}

/**
 * Converts a plain-text string to a SHA-256 hex digest
 * using the native Web Crypto API (zero dependencies, works in all modern browsers).
 */
export async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a raw CPF/CNPJ (digits only) to SHA-256.
 * Strips any non-digit characters first.
 */
export async function hashCpfCnpj(rawValue) {
    const digits = rawValue.replace(/\D/g, '');
    return sha256(digits);
}
