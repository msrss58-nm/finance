// Stage 0 SQLite probe: backup-compatible flat KV table (same shape as the
// Flutter Drift KvEntries table). Synthetic data only — no repositories.
import * as SQLite from 'expo-sqlite';

import { note, record } from './log';
import { DEVICE_LOCAL_KEYS, RAW_FIXTURES, buildProbeEnvelope, isBackupKey } from './synthetic';

const UPSERT = 'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)';
const GET = 'SELECT value FROM kv WHERE key = ?';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('ffprobe.db');
      await db.execAsync(
        'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
      );
      return db;
    })();
  }
  return dbPromise;
}

export async function readValue(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(GET, key);
  return row ? row.value : null;
}

export async function runSqliteProbe(): Promise<void> {
  const area = 'sqlite';
  try {
    const db = await getDb();

    // 1. Restart persistence: a counter incremented inside a transaction.
    let boot = 0;
    await db.withExclusiveTransactionAsync(async (txn) => {
      const row = await txn.getFirstAsync<{ value: string }>(GET, 'probe_boot_count');
      boot = (row ? Number(row.value) : 0) + 1;
      await txn.runAsync(UPSERT, 'probe_boot_count', String(boot));
    });
    record(area, 'restart-persistence', boot >= 1, `boot_count=${boot}`);

    // 2. Raw JSON strings written in one transaction must read back byte-exact.
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const [k, v] of RAW_FIXTURES) await txn.runAsync(UPSERT, k, v);
      await txn.runAsync(UPSERT, 'ff_goals_reminder_v1', '{"enabled":true,"permissionRequested":true}');
    });
    const mismatched: string[] = [];
    for (const [k, v] of RAW_FIXTURES) {
      const got = await readValue(k);
      if (got !== v) mismatched.push(k);
    }
    record(
      area,
      'raw-string-exact',
      mismatched.length === 0,
      mismatched.length === 0 ? `${RAW_FIXTURES.length} values identical` : `mismatch=${mismatched.join(',')}`,
    );

    // 3. Commit: three writes in one transaction all land.
    await db.runAsync("DELETE FROM kv WHERE key LIKE 'probe_c%'");
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const k of ['probe_c1', 'probe_c2', 'probe_c3']) await txn.runAsync(UPSERT, k, `v-${k}`);
    });
    const committed = await db.getAllAsync<{ key: string }>("SELECT key FROM kv WHERE key LIKE 'probe_c%' ORDER BY key");
    record(area, 'txn-commit', committed.length === 3, `rows=${committed.length}`);

    // 4. Rollback: a failure mid-transaction leaves no partial state.
    await db.runAsync(UPSERT, 'probe_rb', 'before');
    await db.runAsync('DELETE FROM kv WHERE key = ?', 'probe_rb2');
    let threw = false;
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(UPSERT, 'probe_rb', 'during');
        await txn.runAsync(UPSERT, 'probe_rb2', 'partial');
        throw new Error('injected failure');
      });
    } catch {
      threw = true;
    }
    const rb = await readValue('probe_rb');
    const rb2 = await readValue('probe_rb2');
    record(area, 'txn-rollback', threw && rb === 'before' && rb2 === null, `threw=${threw} rb=${rb} rb2=${rb2 === null ? 'absent' : 'present'}`);

    // 5. Deterministic ordered reads.
    const a = await db.getAllAsync<{ key: string }>('SELECT key FROM kv ORDER BY key');
    const b = await db.getAllAsync<{ key: string }>('SELECT key FROM kv ORDER BY key');
    const keysA = a.map((r) => r.key);
    const sorted = [...keysA].sort();
    record(
      area,
      'deterministic-read',
      JSON.stringify(keysA) === JSON.stringify(b.map((r) => r.key)) && JSON.stringify(keysA) === JSON.stringify(sorted),
      `keys=${keysA.length}`,
    );

    // 6. Backup sweep: only family_finance_* raw strings; device-local keys never included.
    const all = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM kv ORDER BY key');
    const env = buildProbeEnvelope(all.map((r) => [r.key, r.value] as const), new Date().toISOString());
    const leaked = Object.keys(env.data).filter((k) => !isBackupKey(k) || DEVICE_LOCAL_KEYS.includes(k));
    const exact = RAW_FIXTURES.every(([k, v]) => env.data[k] === v);
    record(area, 'backup-sweep-prefix-only', leaked.length === 0 && exact, `dataKeys=${Object.keys(env.data).length} leaked=${leaked.length}`);

    // Informational: lone UTF-16 surrogate (localStorage can hold it; UTF-8 TEXT cannot).
    const lone = 'x\uD800y';
    await db.runAsync(UPSERT, 'probe_lone_surrogate', lone);
    note(area, `lone-surrogate exact=${(await readValue('probe_lone_surrogate')) === lone}`);
  } catch (e) {
    record(area, 'exception', false, String(e));
  }
}
