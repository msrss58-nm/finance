// The PIN KDF seam, implemented by src/platform/expoPinKdf.ts over the local
// native module modules/ff-pin-kdf. There is deliberately no JavaScript
// implementation: when the native module is missing every call fails, and the
// security layer fails closed.

import type { Result } from '../core/result.ts';
import type { SecurityFailure } from './securityTypes.ts';

export interface PinKdf {
  /** A fresh CSPRNG salt (16 bytes), base64. */
  generateSalt(): Promise<Result<string, SecurityFailure>>;
  /** PBKDF2-HMAC-SHA256 → 32-byte verifier, base64. */
  deriveVerifier(pin: string, saltB64: string, iterations: number): Promise<Result<string, SecurityFailure>>;
  /** Derives and compares in constant time; the verifier is never returned. */
  verifyPin(pin: string, saltB64: string, iterations: number, verifierB64: string): Promise<Result<boolean, SecurityFailure>>;
}
