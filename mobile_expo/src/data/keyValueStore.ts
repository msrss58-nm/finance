// Storage contract for all app data (Stage 1 foundation).
//
// Deliberately the same shape as the Web app's localStorage and the Flutter
// oracle's single Drift KV table: string keys -> raw string values. The
// family_finance_* values are stored exactly as the Web wrote them (raw JSON
// text, never re-serialised), which is what keeps backups byte-compatible.
// No financial schema is introduced here.

export interface KeyValueReader {
  /** The raw stored string, or null when the key is absent. */
  get(key: string): Promise<string | null>;
  /** Every key, in deterministic SQLite BINARY (byte-wise) order. */
  keys(): Promise<string[]>;
  /** [key, raw value] pairs whose key starts with `prefix`, same order as keys(). */
  entriesWithPrefix(prefix: string): Promise<(readonly [string, string])[]>;
}

export interface KeyValueWriter extends KeyValueReader {
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface KeyValueStore extends KeyValueWriter {
  /**
   * Atomic multi-key work (the basis for a future atomic backup restore).
   * Everything done through `tx` commits together when `work` resolves and
   * is rolled back entirely when it rejects; the caller's own error is
   * re-thrown unchanged. Do not use the outer store inside `work`.
   */
  transaction<T>(work: (tx: KeyValueWriter) => Promise<T>): Promise<T>;
}

export type PersistenceErrorKind =
  | 'open'
  | 'schema'
  | 'read'
  | 'write'
  | 'transaction'
  | 'invalidKey'
  | 'invalidValue';

/** Typed persistence failure. Never carries a key's value. */
export class PersistenceError extends Error {
  readonly kind: PersistenceErrorKind;
  readonly causeType: string | undefined;

  constructor(kind: PersistenceErrorKind, causeType?: string) {
    super(`persistence failure: ${kind}`);
    this.name = 'PersistenceError';
    this.kind = kind;
    this.causeType = causeType;
  }
}
