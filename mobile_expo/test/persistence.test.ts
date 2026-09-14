import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PersistenceError } from '../src/data/keyValueStore.ts';
import { RAW_STRING_FIXTURES, runPersistenceSelfTest } from '../src/data/persistenceSelfTest.ts';
import { KV_SCHEMA_VERSION, openKeyValueStore } from '../src/data/sqliteKeyValueStore.ts';
import { DEVICE_LOCAL_KEYS, FAMILY_FINANCE_KEYS, readFamilyFinanceSnapshot } from '../src/data/storageKeys.ts';
import { createNodeSqliteDriver } from './support/nodeSqliteDriver.ts';

const open = () => openKeyValueStore(createNodeSqliteDriver());

class CallerError extends Error {}

test('set / get / overwrite / remove', async () => {
  const kv = await open();
  assert.equal(await kv.get('family_finance_data'), null);
  await kv.set('family_finance_data', '[]');
  assert.equal(await kv.get('family_finance_data'), '[]');
  await kv.set('family_finance_data', '[{"id":1}]');
  assert.equal(await kv.get('family_finance_data'), '[{"id":1}]');
  await kv.remove('family_finance_data');
  assert.equal(await kv.get('family_finance_data'), null);
  await kv.remove('family_finance_data'); // idempotent
  assert.equal(await kv.get('family_finance_data'), null);
});

test('raw strings are preserved byte-exact (including ones JSON would rewrite)', async () => {
  const kv = await open();
  const rewrittenByJson = RAW_STRING_FIXTURES.filter((v) => {
    try {
      return JSON.stringify(JSON.parse(v)) !== v;
    } catch {
      return false;
    }
  });
  assert.ok(rewrittenByJson.length >= 4, 'fixtures must include values a JSON round trip would alter');
  for (const [i, v] of RAW_STRING_FIXTURES.entries()) await kv.set(`family_finance_fixture_${i}`, v);
  for (const [i, v] of RAW_STRING_FIXTURES.entries()) assert.equal(await kv.get(`family_finance_fixture_${i}`), v);
});

test('transaction commit: every write lands together', async () => {
  const kv = await open();
  const result = await kv.transaction(async (tx) => {
    await tx.set('family_finance_data', 'D');
    await tx.set('family_finance_settings', 'S');
    assert.equal(await tx.get('family_finance_data'), 'D', 'reads inside the transaction see its writes');
    return 'done';
  });
  assert.equal(result, 'done');
  assert.equal(await kv.get('family_finance_data'), 'D');
  assert.equal(await kv.get('family_finance_settings'), 'S');
});

test('transaction rollback: caller error restores prior values, drops new keys, is re-thrown unchanged', async () => {
  const kv = await open();
  await kv.set('family_finance_data', 'original');
  const failure = new CallerError('validation failed');
  await assert.rejects(
    kv.transaction(async (tx) => {
      await tx.set('family_finance_data', 'replaced');
      await tx.remove('family_finance_data');
      await tx.set('family_finance_goals', 'new');
      throw failure;
    }),
    (e: unknown) => e === failure,
  );
  assert.equal(await kv.get('family_finance_data'), 'original');
  assert.equal(await kv.get('family_finance_goals'), null);
});

test('engine failure at COMMIT rolls back and surfaces as PersistenceError(transaction)', async () => {
  let armed = false; // armed after open: the schema migration also commits
  const kv = await openKeyValueStore(createNodeSqliteDriver(':memory:', { failWhen: (sql) => armed && sql === 'COMMIT' }));
  await kv.set('family_finance_data', 'before');
  armed = true;
  await assert.rejects(
    kv.transaction(async (tx) => {
      await tx.set('family_finance_data', 'after');
    }),
    (e: unknown) => e instanceof PersistenceError && e.kind === 'transaction',
  );
  assert.equal(await kv.get('family_finance_data'), 'before');
});

test('driver read failure is a typed PersistenceError that leaks no value or driver text', async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver(':memory:', { failWhen: (sql) => sql.startsWith('SELECT value') }));
  await kv.set('family_finance_data', 'secret-looking-value');
  await assert.rejects(kv.get('family_finance_data'), (e: unknown) => {
    assert.ok(e instanceof PersistenceError);
    assert.equal(e.kind, 'read');
    assert.equal(e.causeType, 'InjectedDriverFailure');
    assert.doesNotMatch(e.message, /secret|family_finance/);
    return true;
  });
});

test('deterministic enumeration in byte order, independent of insertion order', async () => {
  const kv = await open();
  const keys = ['family_finance_goals', 'ff_x', 'family_finance_data', 'a', 'Z', 'family_finance_cat_config', 'family_finance_'];
  for (const k of keys) await kv.set(k, k);
  const sorted = [...keys].sort();
  assert.deepEqual(await kv.keys(), sorted);
  assert.deepEqual(await kv.keys(), sorted);
});

test("entriesWithPrefix treats '_' literally (no SQL LIKE wildcard)", async () => {
  const kv = await open();
  await kv.set('familyXfinanceXdata', 'must-not-match');
  await kv.set('family_finance_data', 'D');
  assert.deepEqual(await kv.entriesWithPrefix('family_finance_'), [['family_finance_data', 'D']]);
});

test('lone UTF-16 surrogates and empty keys are refused; nothing is written', async () => {
  const kv = await open();
  await assert.rejects(kv.set('family_finance_data', 'x\uD800y'), (e: unknown) => e instanceof PersistenceError && e.kind === 'invalidValue');
  await assert.rejects(kv.set('family_finance_data', '\uDC00'), (e: unknown) => e instanceof PersistenceError && e.kind === 'invalidValue');
  await assert.rejects(kv.set('', 'v'), (e: unknown) => e instanceof PersistenceError && e.kind === 'invalidKey');
  assert.deepEqual(await kv.keys(), []);
  await kv.set('family_finance_data', 'pair 💰 ok');
  assert.equal(await kv.get('family_finance_data'), 'pair 💰 ok');
});

test('restart persistence: values survive closing and reopening the database file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-kv-'));
  const file = join(dir, 'familyfinance.db');
  try {
    const d1 = createNodeSqliteDriver(file);
    const kv1 = await openKeyValueStore(d1);
    await kv1.set('family_finance_settings', '{"a":1.0}');
    await d1.close();

    const d2 = createNodeSqliteDriver(file);
    const kv2 = await openKeyValueStore(d2);
    assert.equal(await kv2.get('family_finance_settings'), '{"a":1.0}');
    const v = await d2.getFirst<{ user_version: number }>('PRAGMA user_version', []);
    assert.equal(Number(v?.user_version), KV_SCHEMA_VERSION);
    await d2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a database written by a newer schema version is refused, not modified', async () => {
  const driver = createNodeSqliteDriver();
  await driver.exec('PRAGMA user_version = 99');
  await assert.rejects(openKeyValueStore(driver), (e: unknown) => e instanceof PersistenceError && e.kind === 'schema');
  const v = await driver.getFirst<{ user_version: number }>('PRAGMA user_version', []);
  assert.equal(Number(v?.user_version), 99);
});

test('STRICT table: whatever reaches the value column is stored as TEXT', async () => {
  // STRICT does not reject a number bound to a TEXT column — it converts it
  // losslessly to text. The API itself only ever binds strings (see
  // assertValue); this pins down what the engine guarantees underneath.
  const driver = createNodeSqliteDriver();
  const kv = await openKeyValueStore(driver);
  await driver.run('INSERT INTO kv (key, value) VALUES (?, ?)', ['k', 1.5]);
  const row = await driver.getFirst<{ t: string }>('SELECT typeof(value) AS t FROM kv WHERE key = ?', ['k']);
  assert.equal(row?.t, 'text');
  assert.equal(await kv.get('k'), '1.5');
});

test('persistence self-test passes and leaves existing data untouched', async () => {
  const kv = await open();
  await kv.set('family_finance_data', 'keep-me');
  const checks = await runPersistenceSelfTest(kv);
  assert.ok(checks.length >= 6);
  for (const c of checks) assert.ok(c.pass, c.name);
  assert.deepEqual(await kv.keys(), ['family_finance_data']);
  assert.equal(await kv.get('family_finance_data'), 'keep-me');
});

test('backup snapshot = exactly the family_finance_* keys with raw values; device-local keys never included', async () => {
  const kv = await open();
  for (const k of FAMILY_FINANCE_KEYS) await kv.set(k, `raw:${k}:1.0`);
  await kv.set(DEVICE_LOCAL_KEYS.securityMarker, '{"v":1,"lockConfigured":true}');
  await kv.set(DEVICE_LOCAL_KEYS.diagnosticsMarker, 'x');
  await kv.set('ff_goals_reminder_v1', '{"enabled":true}');
  const snapshot = await readFamilyFinanceSnapshot(kv);
  assert.deepEqual([...snapshot.keys()].sort(), [...FAMILY_FINANCE_KEYS].sort());
  for (const k of FAMILY_FINANCE_KEYS) assert.equal(snapshot.get(k), `raw:${k}:1.0`);
});
