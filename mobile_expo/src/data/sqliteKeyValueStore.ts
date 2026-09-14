// SQLite-backed KeyValueStore.
//
// Schema v1: one STRICT table `kv(key TEXT PRIMARY KEY, value TEXT)`,
// versioned through PRAGMA user_version. STRICT guarantees every stored value
// is TEXT (a non-text bind is converted losslessly or rejected), and the API
// only ever binds well-formed strings, so a stored string always comes back as
// the identical string.

import { causeTypeOf } from '../core/result.ts';
import { isWellFormedUtf16 } from '../core/utf8.ts';
import { PersistenceError, type KeyValueStore, type KeyValueWriter, type PersistenceErrorKind } from './keyValueStore.ts';
import type { SqlDriver, SqlExecutor } from './sql.ts';

export const KV_SCHEMA_VERSION = 1;

const SQL = {
  get: 'SELECT value FROM kv WHERE key = ?',
  upsert: 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  remove: 'DELETE FROM kv WHERE key = ?',
  keys: 'SELECT key FROM kv ORDER BY key',
  entries: 'SELECT key, value FROM kv ORDER BY key',
  createTable: 'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT',
} as const;

function wrap(kind: PersistenceErrorKind, e: unknown): PersistenceError {
  return e instanceof PersistenceError ? e : new PersistenceError(kind, causeTypeOf(e));
}

function assertKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || !isWellFormedUtf16(key)) {
    throw new PersistenceError('invalidKey');
  }
}

function assertValue(value: string): void {
  // A lone UTF-16 surrogate cannot survive UTF-8 storage unchanged; refusing
  // it is the only way to guarantee "what you read is what you wrote".
  if (typeof value !== 'string' || !isWellFormedUtf16(value)) {
    throw new PersistenceError('invalidValue');
  }
}

function operations(db: SqlExecutor): KeyValueWriter {
  return {
    async get(key) {
      assertKey(key);
      try {
        const row = await db.getFirst<{ value: string }>(SQL.get, [key]);
        return row === null ? null : row.value;
      } catch (e) {
        throw wrap('read', e);
      }
    },
    async set(key, value) {
      assertKey(key);
      assertValue(value);
      try {
        await db.run(SQL.upsert, [key, value]);
      } catch (e) {
        throw wrap('write', e);
      }
    },
    async remove(key) {
      assertKey(key);
      try {
        await db.run(SQL.remove, [key]);
      } catch (e) {
        throw wrap('write', e);
      }
    },
    async keys() {
      try {
        const rows = await db.getAll<{ key: string }>(SQL.keys, []);
        return rows.map((r) => r.key);
      } catch (e) {
        throw wrap('read', e);
      }
    },
    async entriesWithPrefix(prefix) {
      // Filtered in JS, not with SQL LIKE: '_' in 'family_finance_' is a LIKE
      // wildcard and would match keys it must not.
      try {
        const rows = await db.getAll<{ key: string; value: string }>(SQL.entries, []);
        return rows.filter((r) => r.key.startsWith(prefix)).map((r) => [r.key, r.value] as const);
      } catch (e) {
        throw wrap('read', e);
      }
    },
  };
}

async function migrate(driver: SqlDriver): Promise<void> {
  const row = await driver.getFirst<{ user_version: number }>('PRAGMA user_version', []);
  const version = row === null ? 0 : Number(row.user_version);
  if (version > KV_SCHEMA_VERSION) {
    // A newer app wrote this database. Refuse rather than risk corrupting it.
    throw new PersistenceError('schema');
  }
  if (version < 1) {
    await driver.transaction(async (tx) => {
      await tx.run(SQL.createTable, []);
      await tx.run(`PRAGMA user_version = ${KV_SCHEMA_VERSION}`, []);
    });
  }
}

/** Opens (and if needed creates/migrates) the key-value store on `driver`. */
export async function openKeyValueStore(driver: SqlDriver): Promise<KeyValueStore> {
  try {
    await migrate(driver);
  } catch (e) {
    throw e instanceof PersistenceError ? e : new PersistenceError('open', causeTypeOf(e));
  }

  const direct = operations(driver);
  return {
    ...direct,
    async transaction(work) {
      const box: { workFailed: boolean; workError: unknown } = { workFailed: false, workError: undefined };
      try {
        return await driver.transaction(async (tx) => {
          try {
            return await work(operations(tx));
          } catch (e) {
            box.workFailed = true;
            box.workError = e;
            throw e;
          }
        });
      } catch (e) {
        // Rolled back either way. The caller's own error surfaces unchanged;
        // only an engine-level failure (BEGIN/COMMIT) becomes 'transaction'.
        if (box.workFailed) throw box.workError;
        throw wrap('transaction', e);
      }
    },
  };
}
