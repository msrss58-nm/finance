// Backup contract (approved decision G) + validate-before-write + atomic restore.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { backupFileName, buildBackupEnvelope, isValidBackupShape, planRestore, serializeBackup } from '../../src/domain/backup.ts';
import { FamilyFinanceRepository } from '../../src/data/familyFinanceRepository.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { createNodeSqliteDriver } from '../support/nodeSqliteDriver.ts';

const now = new Date(2026, 8, 13, 10, 5);
const settingsRaw = '{"theme":"dark","pinHash":"legacy-hash","projectedBalanceOpeningIncludedWithdrawalIds":[]}';

test('export: schemaVersion 2, local exportedAt, raw strings, family_finance_* only, missing goals -> []', () => {
  const env = buildBackupEnvelope(
    [
      ['family_finance_data', '[{"id":1,"amount":1.0}]'],
      ['family_finance_settings', settingsRaw],
      ['ff_pin_v1', 'SECRET'],
      ['ff_goals_reminder_v1', '{"enabled":true}'],
    ],
    true,
    now,
  );
  assert.deepEqual(env, {
    schemaVersion: 2,
    exportedAt: '2026-09-13 10:05',
    data: { family_finance_data: '[{"id":1,"amount":1.0}]', family_finance_settings: settingsRaw, family_finance_goals: '[]' },
  });
  const text = serializeBackup(env!);
  assert.ok(text.startsWith('{\n  "schemaVersion": 2,\n  "exportedAt": "2026-09-13 10:05",\n  "data": {'));
  assert.doesNotMatch(text, /ff_pin_v1|SECRET|ff_goals_reminder/);
  assert.match(text, /legacy-hash/, 'the legacy pinHash travels as inert data');
  assert.equal(backupFileName(now), 'familyfinance-backup-2026-09-13.json');
});

test('export refuses (null) while local goals are invalid — never a misleading empty substitute', () => {
  assert.equal(buildBackupEnvelope([['family_finance_goals', 'corrupt']], false, now), null);
});

test('validation: v2 requires valid goals; v1 does not; loan-view legacy raw accepted; foreign keys rejected', () => {
  assert.equal(isValidBackupShape({ schemaVersion: 2, data: { family_finance_data: '[]' } }), false);
  assert.equal(isValidBackupShape({ schemaVersion: 1, data: { family_finance_data: '[]' } }), true);
  assert.equal(isValidBackupShape({ data: { family_finance_data: '[]' } }), true);
  assert.equal(isValidBackupShape({ schemaVersion: 2, data: { family_finance_goals: '[]', family_finance_loan_balance_view: 'principal' } }), true);
  assert.equal(isValidBackupShape({ schemaVersion: 2, data: { family_finance_goals: '[]', family_finance_loan_balance_view: 'bogus' } }), false);
  assert.equal(isValidBackupShape({ schemaVersion: 2, data: { family_finance_goals: '[]', other: '1' } }), false);
  assert.equal(isValidBackupShape({ schemaVersion: 2, data: {} }), false);
  const collision = JSON.stringify([
    { id: 5, type: 'cashWithdrawal', title: 'w', amount: 1, start: '2026-01-01', isArchived: false },
    { id: 5, type: 'income', amount: 1 },
  ]);
  assert.equal(isValidBackupShape({ schemaVersion: 1, data: { family_finance_data: collision } }), false);
});

test('restore plan: a v1 backup never restores goals; the opt-in writes [] only when local goals exist', () => {
  const v1 = { schemaVersion: 1, data: { family_finance_data: '[]', family_finance_goals: '[{"x":1}]' } };
  assert.deepEqual(planRestore(v1, { deleteExistingGoals: false, localGoalsRawPresent: true }).data, { family_finance_data: '[]' });
  assert.deepEqual(planRestore(v1, { deleteExistingGoals: true, localGoalsRawPresent: true }).data, { family_finance_data: '[]', family_finance_goals: '[]' });
  assert.deepEqual(planRestore(v1, { deleteExistingGoals: true, localGoalsRawPresent: false }).data, { family_finance_data: '[]' });
});

test('restore is atomic: a failure on the second write leaves every original value untouched', async () => {
  let armed = false;
  let inserts = 0;
  const driver = createNodeSqliteDriver(':memory:', { failWhen: (sql) => armed && sql.startsWith('INSERT INTO kv') && ++inserts === 2 });
  const kv = await openKeyValueStore(driver);
  await kv.set('family_finance_data', 'ORIGINAL-DATA');
  await kv.set('family_finance_settings', 'ORIGINAL-SETTINGS');
  armed = true;
  const repo = new FamilyFinanceRepository(kv);
  const result = await repo.restoreBackup(
    { schemaVersion: 2, data: { family_finance_data: '[]', family_finance_settings: '{}', family_finance_goals: '[]' } },
    { deleteExistingGoals: false, now },
  );
  armed = false;
  assert.equal(result.ok, false);
  assert.deepEqual(await kv.entriesWithPrefix('family_finance_'), [
    ['family_finance_data', 'ORIGINAL-DATA'],
    ['family_finance_settings', 'ORIGINAL-SETTINGS'],
  ]);
});

test('an invalid backup writes nothing; a valid one writes, then appends one capped activity-log line', async () => {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  const repo = new FamilyFinanceRepository(kv);
  await kv.set('family_finance_activity_log', JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ ts: 't', action: 'x', detail: String(i) }))));
  assert.deepEqual(await repo.restoreBackup({ schemaVersion: 2, data: { family_finance_data: '[]' } }, { deleteExistingGoals: false, now }), { ok: false, error: { kind: 'invalidBackup' } });
  assert.equal(await kv.get('family_finance_data'), null);

  const ok = await repo.restoreBackup({ schemaVersion: 2, data: { family_finance_data: '[{"id":1}]', family_finance_goals: '[]', family_finance_settings: settingsRaw } }, { deleteExistingGoals: false, now });
  assert.deepEqual(ok, { ok: true, value: { writtenKeys: ['family_finance_data', 'family_finance_goals', 'family_finance_settings'], activityLogged: true } });
  assert.equal(await kv.get('family_finance_settings'), settingsRaw, 'raw string restored byte-for-byte (pinHash included, inert)');
  const log = JSON.parse((await kv.get('family_finance_activity_log')) as string) as { detail: string; ts: string }[];
  assert.equal(log.length, 200);
  assert.deepEqual(log.at(-1), { ts: '2026-09-13 10:05', action: 'data_restore', detail: 'שוחזר מגיבוי (3 מפתחות)' });
});
