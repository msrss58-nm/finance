// The PIN KDF over the local native module modules/ff-pin-kdf (Android:
// SecretKeyFactory PBKDF2WithHmacSHA256 + SecureRandom). There is NO
// JavaScript fallback: when the module is absent from the build (iOS, Expo Go,
// an older development client) every call returns kdfUnavailable and the
// security layer fails closed. Failures carry a cause type only, never input.

import { requireOptionalNativeModule } from 'expo';

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import type { PinKdf } from '../security/pinKdf.ts';
import type { SecurityFailure } from '../security/securityTypes.ts';

type NativePinKdf = {
  generateSalt(): Promise<unknown>;
  deriveVerifier(pin: string, saltB64: string, iterations: number): Promise<unknown>;
  verifyPin(pin: string, saltB64: string, iterations: number, verifierB64: string): Promise<unknown>;
};

const native = requireOptionalNativeModule<NativePinKdf>('FfPinKdf');

async function call<T>(run: (m: NativePinKdf) => Promise<unknown>, accept: (v: unknown) => v is T): Promise<Result<T, SecurityFailure>> {
  if (native === null) return err({ kind: 'kdfUnavailable' });
  try {
    const value = await run(native);
    return accept(value) ? ok(value) : err({ kind: 'kdfFailed', causeType: 'UnexpectedResult' });
  } catch (e) {
    return err({ kind: 'kdfFailed', causeType: causeTypeOf(e) });
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

export const expoPinKdf: PinKdf = {
  generateSalt: () => call((m) => m.generateSalt(), isString),
  deriveVerifier: (pin, saltB64, iterations) => call((m) => m.deriveVerifier(pin, saltB64, iterations), isString),
  verifyPin: (pin, saltB64, iterations, verifierB64) => call((m) => m.verifyPin(pin, saltB64, iterations, verifierB64), isBoolean),
};
