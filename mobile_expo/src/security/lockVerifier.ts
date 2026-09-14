// Lock verification seam.
//
// ============================================================
//  STAGE 1 PLACEHOLDER — THIS IS NOT PIN AUTHENTICATION.
// ============================================================
// The real verifier (PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt,
// 32-byte verifier, stored as ff_pin_v1 — the Flutter oracle's format) needs
// a KDF package that is NOT approved yet. Until then the security shell is
// exercised with a synthetic record and a fixed, public synthetic code. It
// proves the gate, lifecycle locking and fail-closed paths only; it protects
// nothing and must never ship to users.

import { err, ok, type Result } from '../core/result.ts';
import type { SecurityFailure } from './securityTypes.ts';

export interface LockVerifier {
  /** ok(true) = matched, ok(false) = wrong input, Err = record unusable. */
  verify(input: string, storedRecord: string): Promise<Result<boolean, SecurityFailure>>;
}

export const FOUNDATION_LOCK_RECORD = '{"v":0,"kind":"foundation-placeholder"}';

/** Public synthetic code. Not a secret, not a credential. */
export const FOUNDATION_PLACEHOLDER_CODE = '2468';

/** Length-checked comparison without an early exit inside the loop. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isPlaceholderRecord(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Record<string, unknown>).v === 0 &&
      (parsed as Record<string, unknown>).kind === 'foundation-placeholder'
    );
  } catch {
    return false;
  }
}

export const foundationPlaceholderVerifier: LockVerifier = {
  async verify(input, storedRecord) {
    if (!isPlaceholderRecord(storedRecord)) return err({ kind: 'unsupportedRecord' });
    return ok(constantTimeEqual(input, FOUNDATION_PLACEHOLDER_CODE));
  },
};
