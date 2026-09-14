// ff_pin_v1 — the PIN verifier record. Format fixed by the Flutter oracle
// (pin_verifier.dart): {"v":1,"kdf":"pbkdf2-hmac-sha256","iterations",
// "saltB64","verifierB64"}. Pure: format and validation only; derivation is
// the native KDF's job (pinKdf.ts / src/platform/expoPinKdf.ts).

import { err, ok, type Result } from '../core/result.ts';
import type { SecurityFailure } from './securityTypes.ts';

export const PIN_RECORD_VERSION = 1;
export const PIN_KDF_ID = 'pbkdf2-hmac-sha256';
export const PIN_KDF_ITERATIONS = 100_000;
export const PIN_SALT_BYTES = 16;
export const PIN_VERIFIER_BYTES = 32;

export type PinRecord = {
  readonly v: typeof PIN_RECORD_VERSION;
  readonly kdf: typeof PIN_KDF_ID;
  readonly iterations: number;
  readonly saltB64: string;
  readonly verifierB64: string;
};

/** The Web rule (app.js submitSetPin): 4–6 ASCII digits. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** Decoded length of canonical padded base64; null when the text is not canonical base64. */
export function base64ByteLength(b64: string): number | null {
  if (b64.length === 0 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length / 4) * 3 - padding;
}

export function encodePinRecord(saltB64: string, verifierB64: string): string {
  return JSON.stringify({ v: PIN_RECORD_VERSION, kdf: PIN_KDF_ID, iterations: PIN_KDF_ITERATIONS, saltB64, verifierB64 });
}

/**
 * Strict parse. Anything unexpected — including parameters weaker than the
 * contract — is `unsupportedRecord`, never "no PIN configured": a record this
 * build cannot trust must keep the app locked.
 */
export function decodePinRecord(raw: string): Result<PinRecord, SecurityFailure> {
  const unsupported = err<SecurityFailure>({ kind: 'unsupportedRecord' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unsupported;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return unsupported;
  const r = parsed as Record<string, unknown>;
  if (r.v !== PIN_RECORD_VERSION || r.kdf !== PIN_KDF_ID) return unsupported;
  if (typeof r.iterations !== 'number' || !Number.isInteger(r.iterations) || r.iterations < PIN_KDF_ITERATIONS) return unsupported;
  if (typeof r.saltB64 !== 'string' || base64ByteLength(r.saltB64) !== PIN_SALT_BYTES) return unsupported;
  if (typeof r.verifierB64 !== 'string' || base64ByteLength(r.verifierB64) !== PIN_VERIFIER_BYTES) return unsupported;
  return ok({ v: PIN_RECORD_VERSION, kdf: PIN_KDF_ID, iterations: r.iterations, saltB64: r.saltB64, verifierB64: r.verifierB64 });
}
