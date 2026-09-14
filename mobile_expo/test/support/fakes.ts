// In-memory fakes for the platform seams. Synthetic data only.

import { err, ok, type Result } from '../../src/core/result.ts';
import type { FileGateway, FileResult, PickedTextDocument } from '../../src/backup/fileGateway.ts';
import type { LockVerifier } from '../../src/security/lockVerifier.ts';
import type { PrivacyMode, ScreenPrivacy } from '../../src/security/privacyPolicy.ts';
import type { SecretKey, SecretReadResult, SecretStore, SecretStoreFailure } from '../../src/security/secretStore.ts';
import type { SecurityMarkerStore } from '../../src/security/securityMarker.ts';
import type { SecurityFailure } from '../../src/security/securityTypes.ts';

export type Deferred<T> = { readonly promise: Promise<T>; resolve(value: T): void };

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export class MemorySecretStore implements SecretStore {
  readonly values = new Map<SecretKey, string>();
  readonly log: string[] = [];
  failRead: SecretStoreFailure | null = null;
  failWrite: SecretStoreFailure | null = null;
  failDelete: SecretStoreFailure | null = null;

  async read(key: SecretKey): Promise<Result<SecretReadResult, SecretStoreFailure>> {
    this.log.push(`read:${key}`);
    if (this.failRead) return err(this.failRead);
    const value = this.values.get(key);
    return ok(value === undefined ? { status: 'absent' } : { status: 'present', value });
  }

  async write(key: SecretKey, value: string): Promise<Result<void, SecretStoreFailure>> {
    this.log.push(`write:${key}`);
    if (this.failWrite) return err(this.failWrite);
    this.values.set(key, value);
    return ok(undefined);
  }

  async delete(key: SecretKey): Promise<Result<void, SecretStoreFailure>> {
    this.log.push(`delete:${key}`);
    if (this.failDelete) return err(this.failDelete);
    this.values.delete(key);
    return ok(undefined);
  }
}

export class MemoryMarker implements SecurityMarkerStore {
  configured = false;
  readonly log: string[] = [];
  failRead: SecurityFailure | null = null;
  failWrite: SecurityFailure | null = null;

  async read(): Promise<Result<boolean, SecurityFailure>> {
    this.log.push('marker:read');
    return this.failRead ? err(this.failRead) : ok(this.configured);
  }

  async write(configured: boolean): Promise<Result<void, SecurityFailure>> {
    this.log.push(`marker:write:${configured}`);
    if (this.failWrite) return err(this.failWrite);
    this.configured = configured;
    return ok(undefined);
  }
}

export class RecordingPrivacy implements ScreenPrivacy {
  readonly applied: PrivacyMode[] = [];
  fail = false;

  async apply(mode: PrivacyMode): Promise<void> {
    if (this.fail) throw new Error('privacy apply failed');
    this.applied.push(mode);
  }
}

/** Verifier whose answer the test controls (to simulate a slow KDF). */
export class ControlledVerifier implements LockVerifier {
  calls = 0;
  pending: Deferred<Result<boolean, SecurityFailure>> | null = null;

  verify(): Promise<Result<boolean, SecurityFailure>> {
    this.calls += 1;
    this.pending = deferred<Result<boolean, SecurityFailure>>();
    return this.pending.promise;
  }
}

export class FakeFileGateway implements FileGateway {
  supportsFolderExport = true;
  pickResult: FileResult<PickedTextDocument> | Deferred<FileResult<PickedTextDocument>> = { status: 'cancelled' };
  shareResult: FileResult<void> = { status: 'ok', value: undefined };
  folderResult: FileResult<{ readonly fileName: string }> = { status: 'ok', value: { fileName: 'x.json' } };
  throwOnPick = false;
  readonly shared: { fileName: string; text: string }[] = [];

  async pickTextDocument(): Promise<FileResult<PickedTextDocument>> {
    if (this.throwOnPick) throw new Error('native crash with /private/path/and-user-data');
    const r = this.pickResult;
    return 'promise' in r ? r.promise : r;
  }

  async shareJson(fileName: string, text: string): Promise<FileResult<void>> {
    this.shared.push({ fileName, text });
    return this.shareResult;
  }

  async saveJsonToFolder(): Promise<FileResult<{ readonly fileName: string }>> {
    return this.folderResult;
  }
}

/** Deterministic PRNG (mulberry32) for property-style tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
