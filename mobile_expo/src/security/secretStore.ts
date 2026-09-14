// Secret storage seam (Keystore / Keychain via expo-secure-store in
// production — src/platform/expoSecretStore.ts). Completely separate from the
// SQLite database, so no secret can ever be reached by a backup sweep.
//
// Contract (Flutter oracle secure_secret_store.dart, adapted to Result):
// - `absent` is returned ONLY when the platform reports no value.
// - Every platform failure is a typed Err — never `absent`, never swallowed.

import type { Result } from '../core/result.ts';

export const SECRET_KEYS = {
  /** The PIN verifier record (format fixed by the Flutter oracle — see pinRecord.ts). */
  pinRecord: 'ff_pin_v1',
  /** Stage 1 placeholder lock record — see lockVerifier.ts. NOT authentication. */
  foundationLock: 'ff_foundation_lock_v0',
} as const;

export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

export const ALL_SECRET_KEYS: readonly SecretKey[] = Object.values(SECRET_KEYS);

export type SecretStoreFailureKind = 'unavailable' | 'read' | 'write' | 'delete';
export type SecretStoreFailure = { readonly kind: SecretStoreFailureKind; readonly causeType?: string };

export type SecretReadResult = { readonly status: 'absent' } | { readonly status: 'present'; readonly value: string };

export interface SecretStore {
  read(key: SecretKey): Promise<Result<SecretReadResult, SecretStoreFailure>>;
  write(key: SecretKey, value: string): Promise<Result<void, SecretStoreFailure>>;
  delete(key: SecretKey): Promise<Result<void, SecretStoreFailure>>;
}
