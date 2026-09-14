// Lone-surrogate investigation (Stage 2, section 12) — facts, not a redesign.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { PersistenceError } from '../../src/data/keyValueStore.ts';
import { FamilyFinanceRepository } from '../../src/data/familyFinanceRepository.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { loadWebApp } from '../parity/webHarness.ts';
import { createNodeSqliteDriver } from '../support/nodeSqliteDriver.ts';

const LONE = String.fromCharCode(0xd800);
const RLM = String.fromCharCode(0x200f);
const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';

test('every Web write goes through JSON.stringify, which escapes a lone surrogate to ASCII (\\ud800)', () => {
  const web = loadWebApp({ nowMs: Date.now(), storage: {} });
  const out = web.evaluate('JSON.stringify({ title: "a" + String.fromCharCode(0xD800) + "b" })') as string;
  assert.equal(out, '{"title":"a\\ud800b"}');
  assert.ok(/^[\x20-\x7e]*$/.test(out), 'pure ASCII: nothing unrepresentable reaches storage');
  assert.equal(JSON.stringify({ title: `a${LONE}b` }), out, 'Expo/Hermes JSON.stringify behaves identically');
});

test('such an escaped value is stored and read back exactly, and parses back to the same string', async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  const raw = JSON.stringify([{ id: 1, title: `a${LONE}b` }]);
  await kv.set('family_finance_data', raw);
  assert.equal(await kv.get('family_finance_data'), raw);
  assert.equal((JSON.parse((await kv.get('family_finance_data')) as string) as { title: string }[])[0]?.title, `a${LONE}b`);
});

test('valid Unicode (Hebrew, emoji, ZWJ sequences, RLM) is never altered', async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  const value = `שלום ₪ 💰 ${ZWJ_FAMILY} ${RLM}abc`;
  await kv.set('family_finance_settings', value);
  assert.equal(await kv.get('family_finance_settings'), value);
});

test('a RAW lone surrogate is refused (typed error), and a restore containing one writes nothing', async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  await assert.rejects(kv.set('family_finance_data', `x${LONE}`), (e: unknown) => e instanceof PersistenceError && e.kind === 'invalidValue');
  await kv.set('family_finance_data', 'ORIGINAL');
  const repo = new FamilyFinanceRepository(kv);
  const r = await repo.restoreBackup(
    { schemaVersion: 1, data: { family_finance_settings: '{}', family_finance_activity_log: `["${LONE}"]` } },
    { deleteExistingGoals: false, now: new Date() },
  );
  assert.equal(r.ok, false);
  assert.equal(await kv.get('family_finance_data'), 'ORIGINAL');
  assert.equal(await kv.get('family_finance_settings'), null, 'atomic: the valid key before it was not written either');
});
