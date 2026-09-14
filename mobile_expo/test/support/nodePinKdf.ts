// TEST-ONLY PinKdf over Node's PBKDF2 — the independent oracle for the native
// module's contract. Never shipped: the app has no JavaScript KDF. It enforces
// the same minimums as the Kotlin module so tests exercise the real contract.

import { Buffer } from 'node:buffer';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

import { err, ok, type Result } from '../../src/core/result.ts';
import type { PinKdf } from '../../src/security/pinKdf.ts';
import type { SecurityFailure } from '../../src/security/securityTypes.ts';

export class NodePinKdf implements PinKdf {
  readonly calls = { salt: 0, derive: 0, verify: 0 };
  /** Simulates the native module being absent or failing. */
  failWith: 'kdfUnavailable' | 'kdfFailed' | null = null;

  async generateSalt(): Promise<Result<string, SecurityFailure>> {
    this.calls.salt += 1;
    if (this.failWith) return err({ kind: this.failWith });
    return ok(randomBytes(16).toString('base64'));
  }

  async deriveVerifier(pin: string, saltB64: string, iterations: number): Promise<Result<string, SecurityFailure>> {
    this.calls.derive += 1;
    const d = this.#derive(pin, saltB64, iterations);
    return d.ok ? ok(d.value.toString('base64')) : d;
  }

  async verifyPin(pin: string, saltB64: string, iterations: number, verifierB64: string): Promise<Result<boolean, SecurityFailure>> {
    this.calls.verify += 1;
    const expected = Buffer.from(verifierB64, 'base64');
    if (expected.length !== 32) return err({ kind: 'kdfFailed', causeType: 'InvalidInput' });
    const d = this.#derive(pin, saltB64, iterations);
    return d.ok ? ok(timingSafeEqual(d.value, expected)) : d;
  }

  #derive(pin: string, saltB64: string, iterations: number): Result<ReturnType<typeof pbkdf2Sync>, SecurityFailure> {
    if (this.failWith) return err({ kind: this.failWith });
    const salt = Buffer.from(saltB64, 'base64');
    if (iterations < 100_000 || salt.length !== 16 || pin.length === 0) return err({ kind: 'kdfFailed', causeType: 'InvalidInput' });
    return ok(pbkdf2Sync(pin, salt, iterations, 32, 'sha256'));
  }
}
