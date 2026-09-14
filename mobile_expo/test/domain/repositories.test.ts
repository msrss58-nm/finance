// Stage 2 repository: raw storage authoritative, derived views, no silent data loss.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAutoArchive } from '../../src/domain/aggregates.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { describeItem, parseItemsRaw } from '../../src/domain/raw.ts';
import { getProjectedBalanceOpeningConfig } from '../../src/domain/settings.ts';
import { FamilyFinanceRepository, resolveLoanBalanceView } from '../../src/data/familyFinanceRepository.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { createNodeSqliteDriver } from '../support/nodeSqliteDriver.ts';

const setup = async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  return { kv, repo: new FamilyFinanceRepository(kv) };
};

test('empty store: Web defaults, valid empty goals, nothing fabricated', async () => {
  const { repo } = await setup();
  const r = await repo.loadDataSet();
  assert.ok(r.ok);
  assert.deepEqual(r.value.items, []);
  assert.deepEqual(Object.keys(r.value.categoryConfig), ['income', 'fixed', 'variable', 'loan', 'dated']);
  assert.equal(r.value.settings.projectedBalanceOpeningAmount, null);
  assert.equal(getProjectedBalanceOpeningConfig(r.value.settings), null, 'unconfigured, never 0');
  assert.deepEqual(r.value.goalsState, { valid: true, raw: null, goals: [] });
  assert.equal(r.value.loanBalanceView, 'total');
});

test('raw items keep unknown fields, legacy string numbers, legacy ids and key order', async () => {
  const { kv, repo } = await setup();
  const raw = '[{"id":"legacy-7","type":"loan","amount":"450","total":"12","customFields":{"x":1},"futureField":[null]}]';
  await kv.set('family_finance_data', raw);
  const r = await repo.loadDataSet();
  assert.ok(r.ok);
  assert.equal(r.value.raw.family_finance_data, raw);
  assert.deepEqual(r.value.items, JSON.parse(raw));
  const view = describeItem(r.value.items[0]);
  assert.deepEqual(view.unknownFields, ['customFields', 'futureField']);
  assert.equal(view.amount, null, 'a string amount is reported, never coerced');
  assert.ok((await repo.writeItems(r.value.items)).ok);
  assert.equal(await kv.get('family_finance_data'), JSON.stringify(JSON.parse(raw)));
});

test('auto-archive keeps every other field and the key order', () => {
  const now = new Date(2026, 8, 13, 9);
  const items = parseItemsRaw('[{"id":1,"type":"loan","title":"old","amount":10,"day":5,"total":2,"start":"2025-01-01","isArchived":false,"custom":true}]');
  const r = applyAutoArchive(items, now, resolveCategoryConfig(null));
  assert.equal(r.archivedCount, 1);
  assert.equal(JSON.stringify(r.items), '[{"id":1,"type":"loan","title":"old","amount":10,"day":5,"total":2,"start":"2025-01-01","isArchived":true,"custom":true,"archiveReason":"completed","archivedAt":"2026-09-13"}]');
  assert.deepEqual(r.archivedTitles, ['old']);
  assert.equal(items[0]?.isArchived, false, 'input never mutated');
});

test('settings writes merge into the STORED object: unknown keys and null vs [] survive', async () => {
  const { kv, repo } = await setup();
  await kv.set('family_finance_settings', '{"futureSetting":{"a":1},"projectedBalanceOpeningIncludedWithdrawalIds":[],"anchorBalance":5}');
  assert.ok((await repo.writeSettingsFields({ theme: 'dark' })).ok);
  assert.deepEqual(JSON.parse((await kv.get('family_finance_settings')) as string), {
    futureSetting: { a: 1 },
    projectedBalanceOpeningIncludedWithdrawalIds: [],
    anchorBalance: 5,
    theme: 'dark',
  });
  const r = await repo.loadDataSet();
  assert.ok(r.ok);
  assert.deepEqual(r.value.settings.projectedBalanceOpeningIncludedWithdrawalIds, []);
});

test('goals writes are refused while the local goals dataset is invalid (corrupt raw kept)', async () => {
  const { kv, repo } = await setup();
  await kv.set('family_finance_goals', 'corrupt');
  const r = await repo.loadDataSet();
  assert.ok(r.ok);
  assert.deepEqual(await repo.writeGoals(r.value.goalsState, []), { ok: false, error: { kind: 'refusedInvalidGoals' } });
  assert.equal(await kv.get('family_finance_goals'), 'corrupt');
});

test('loan balance view: JSON form and legacy raw form both read', () => {
  assert.equal(resolveLoanBalanceView('"principal"'), 'principal');
  assert.equal(resolveLoanBalanceView('principal'), 'principal');
  assert.equal(resolveLoanBalanceView(null), 'total');
  assert.equal(resolveLoanBalanceView('weird'), 'total');
});
