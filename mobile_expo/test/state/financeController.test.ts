// FinanceController: the single write path (fresh read -> domain -> atomic commit -> reload).
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getProjectedBalanceToday } from '../../src/domain/forecast.ts';
import { getHomePeriodOutflows } from '../../src/domain/homeTotals.ts';
import { getProjectedBalanceOpeningConfig } from '../../src/domain/settings.ts';
import { GOAL_MESSAGES } from '../../src/domain/goalWrites.ts';
import { FINANCE_MESSAGES, type ChangeScope } from '../../src/state/financeController.ts';
import { financeHarness, form, goalRecord, ready } from '../support/financeHarness.ts';

const DONE_LOAN = '[{"id":1,"type":"loan","title":"old","amount":10,"day":5,"total":2,"start":"2025-01-01","isArchived":false}]';

test('first load runs the auto-archive sweep once: archived, logged, toast, alert titles', async () => {
  const h = await financeHarness({ family_finance_data: DONE_LOAN });
  await h.finance.load();
  const s = ready(h.finance);
  assert.equal(s.data.items[0]?.isArchived, true);
  assert.equal(s.data.items[0]?.archiveReason, 'completed');
  assert.deepEqual(s.lastAutoArchivedTitles, ['old']);
  assert.match(h.finance.notice.get()?.text ?? '', /1 התחייבויות הסתיימו/);
  const log = JSON.parse((await h.kv.get('family_finance_activity_log')) as string) as { action: string; detail: string }[];
  assert.deepEqual(log.map((e) => [e.action, e.detail]), [['auto_archive', 'old']]);
  await h.finance.load();
  assert.equal((JSON.parse((await h.kv.get('family_finance_activity_log')) as string) as unknown[]).length, 1, 'once per run');
});

test('a validation failure writes nothing', async () => {
  const h = await financeHarness();
  await h.finance.load();
  const o = await h.finance.createItem('income', 'income', form({ amount: '5' }));
  assert.equal(o.ok, false);
  assert.equal(o.ok === false && o.kind, 'validation');
  assert.equal(await h.kv.get('family_finance_data'), null);
});

test('create / edit / archive / restore / delete round-trip through storage', async () => {
  const h = await financeHarness();
  await h.finance.load();
  assert.ok((await h.finance.createItem('income', 'income', form({ title: 'משכורת', amount: '1000', day: '10' }))).ok);
  const id = ready(h.finance).data.items[0]?.id;
  assert.ok((await h.finance.editItem(id, form({ title: 'משכורת 2', amount: '1200', day: '11' }))).ok);
  assert.deepEqual(JSON.parse((await h.kv.get('family_finance_data')) as string), [
    { id, type: 'income', isArchived: false, displayCategory: 'income', title: 'משכורת 2', amount: 1200, day: '11' },
  ]);
  assert.ok((await h.finance.archiveItem(id)).ok);
  assert.ok((await h.finance.unarchiveItem(id)).ok);
  assert.ok((await h.finance.deleteItem(id)).ok);
  assert.equal(await h.kv.get('family_finance_data'), '[]');
  const log = JSON.parse((await h.kv.get('family_finance_activity_log')) as string) as { action: string }[];
  assert.deepEqual(log.map((e) => e.action), ['manual_archive', 'restore']);
  assert.equal((await h.finance.deleteItem(id)).ok, false, 'deleting twice is "not found", never a crash');
});

test('unreadable stored items are never overwritten (no silent data loss)', async () => {
  const h = await financeHarness({ family_finance_data: 'not-json' });
  await h.finance.load();
  assert.ok(ready(h.finance).data.corruptKeys.includes('family_finance_data'));
  const o = await h.finance.createItem('income', 'income', form({ title: 'x', amount: '5' }));
  assert.deepEqual(o, { ok: false, kind: 'failed', message: FINANCE_MESSAGES.corruptStored });
  assert.equal(await h.kv.get('family_finance_data'), 'not-json');
});

test('settings writes keep unknown keys; alert toggles keep unknown notification flags', async () => {
  const h = await financeHarness({ family_finance_settings: '{"futureSetting":1,"anchorBalance":5,"notifications":{"upcomingPayment":true,"futureFlag":"x"}}' });
  await h.finance.load();
  assert.ok((await h.finance.setInAppAlert('upcomingIncome', false)).ok);
  assert.ok((await h.finance.setAppearance('theme', 'dark')).ok);
  const stored = JSON.parse((await h.kv.get('family_finance_settings')) as string) as Record<string, unknown>;
  assert.deepEqual(stored, {
    futureSetting: 1,
    anchorBalance: 5,
    notifications: { upcomingPayment: true, futureFlag: 'x', upcomingIncome: false, completedObligation: true },
    theme: 'dark',
  });
  const bad = await h.finance.setAppearance('theme', 'neon');
  assert.equal(bad.ok, false);
});

test('opening balance: amount + date + fresh withdrawal snapshot together; 0 is a real balance', async () => {
  const items = [
    { id: 5, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 100, start: '2026-09-10', isArchived: false, notes: '' },
    { id: 6, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 50, start: '2026-09-10', isArchived: true, notes: '' },
  ];
  const h = await financeHarness({ family_finance_data: JSON.stringify(items), family_finance_settings: '{"anchorBalance":5,"anchorDate":"2020-01-01"}' });
  await h.finance.load();
  assert.ok((await h.finance.saveOpeningBalance(0, '2026-09-10')).ok);
  const stored = JSON.parse((await h.kv.get('family_finance_settings')) as string) as Record<string, unknown>;
  assert.equal(stored.projectedBalanceOpeningAmount, 0);
  assert.equal(stored.projectedBalanceOpeningDate, '2026-09-10');
  assert.deepEqual(stored.projectedBalanceOpeningIncludedWithdrawalIds, [5]);
  assert.equal(stored.anchorBalance, 5, 'retired anchor fields untouched');
  assert.equal(stored.anchorDate, '2020-01-01');
  assert.deepEqual(getProjectedBalanceOpeningConfig(ready(h.finance).data.settings), { amount: 0, dateStr: '2026-09-10', includedWithdrawalIds: [5] });
});

test('a cash withdrawal written through the controller is balance-only, never an expense', async () => {
  const h = await financeHarness({ family_finance_settings: '{"projectedBalanceOpeningAmount":1000,"projectedBalanceOpeningDate":"2026-09-10","projectedBalanceOpeningIncludedWithdrawalIds":[]}' });
  await h.finance.load();
  assert.ok((await h.finance.createItem('cashWithdrawal', null, form({ amount: '300', start: '2026-09-12' }))).ok);
  const s = ready(h.finance);
  assert.deepEqual(getHomePeriodOutflows(s.data.items, s.now, s.data.categoryConfig), { expenses: 0, withdrawals: 300, totalOutflow: 300 });
  const today = getProjectedBalanceToday(s.data.items, s.now, getProjectedBalanceOpeningConfig(s.data.settings), s.data.categoryConfig);
  assert.equal(today.configured && today.state === 'available' ? today.projectedBalance : null, 700);
});

test('invalid stored goals: every goal write refused, except the explicit reset', async () => {
  const h = await financeHarness({ family_finance_goals: 'corrupt' });
  await h.finance.load();
  const o = await h.finance.createGoal({ title: 'x', targetAmount: '5', dueDate: '2027-01-01', savedAmount: '' });
  assert.deepEqual(o, { ok: false, kind: 'validation', message: GOAL_MESSAGES.invalid, field: null, fields: {} });
  assert.equal(await h.kv.get('family_finance_goals'), 'corrupt');
  const scopes: ChangeScope[] = [];
  h.finance.onChange((s) => scopes.push(s));
  assert.ok((await h.finance.resetCorruptGoals()).ok);
  assert.equal(await h.kv.get('family_finance_goals'), '[]');
  assert.ok((await h.finance.createGoal({ title: 'x', targetAmount: '5', dueDate: '2027-01-01', savedAmount: '' })).ok);
  assert.deepEqual(scopes, ['goals', 'goals']);
  assert.equal((await h.finance.resetCorruptGoals()).ok, false, 'valid goals are never reset');
});

test('writes are serialised: concurrent creates never lose an update', async () => {
  const h = await financeHarness();
  await h.finance.load();
  const [a, b] = await Promise.all([
    h.finance.createItem('income', 'income', form({ title: 'A', amount: '1' })),
    h.finance.createItem('income', 'income', form({ title: 'B', amount: '2' })),
  ]);
  assert.ok(a.ok && b.ok);
  const stored = JSON.parse((await h.kv.get('family_finance_data')) as string) as { id: number; title: string }[];
  assert.deepEqual(stored.map((i) => i.title), ['A', 'B']);
  assert.notEqual(stored[0]?.id, stored[1]?.id);
});

test('a storage failure mid-commit changes nothing (items + settings are one transaction)', async () => {
  const h = await financeHarness({ family_finance_data: '[]', family_finance_settings: '{"theme":"light"}' });
  await h.finance.load();
  h.fault = (sql) => sql === 'COMMIT';
  const o = await h.finance.createItem('dated', 'dated', form({ title: 'ויזה', amount: '100', start: '2026-09-20', cardLast4: '1234' }));
  h.fault = null;
  assert.deepEqual(o, { ok: false, kind: 'failed', message: FINANCE_MESSAGES.writeFailed });
  assert.equal(await h.kv.get('family_finance_data'), '[]');
  assert.equal(await h.kv.get('family_finance_settings'), '{"theme":"light"}');
});

test('reset removes only family_finance_* keys; restore and reset notify "all"', async () => {
  const h = await financeHarness({ family_finance_data: '[]', family_finance_goals: '[]', ff_security_marker_v1: '{"v":1,"lockConfigured":true}', ff_goals_reminder_v1: '{"enabled":true}' });
  await h.finance.load();
  const scopes: ChangeScope[] = [];
  h.finance.onChange((s) => scopes.push(s));
  assert.ok((await h.finance.resetAllData()).ok);
  assert.deepEqual(await h.kv.entriesWithPrefix('family_finance_'), []);
  assert.equal(await h.kv.get('ff_security_marker_v1'), '{"v":1,"lockConfigured":true}', 'security marker is not financial data');
  assert.equal(await h.kv.get('ff_goals_reminder_v1'), '{"enabled":true}');
  const restored = await h.finance.restoreBackup({ schemaVersion: 2, exportedAt: '2026-01-01 10:00', data: { family_finance_data: '[]', family_finance_goals: '[]' } }, false);
  assert.deepEqual(restored, { ok: true, count: 2 });
  const bad = await h.finance.restoreBackup({ data: {} }, false);
  assert.deepEqual(bad, { ok: false, kind: 'failed', message: FINANCE_MESSAGES.invalidBackup });
  assert.deepEqual(scopes, ['all', 'all']);
});

test('tick advances "now" only on a new day or after a minute', async () => {
  const h = await financeHarness();
  await h.finance.load();
  const first = ready(h.finance).now;
  h.clock.now = new Date(first.getTime() + 30_000);
  h.finance.tick();
  assert.equal(ready(h.finance).now, first);
  h.clock.now = new Date(first.getTime() + 61_000);
  h.finance.tick();
  assert.equal(ready(h.finance).now.getTime(), first.getTime() + 61_000);
});

test('goal writes keep other stored goals byte-identical', async () => {
  const other = { ...goalRecord({ id: 'g2', title: '  רווחים  ' }) };
  const h = await financeHarness({ family_finance_goals: JSON.stringify([goalRecord(), other]) });
  await h.finance.load();
  assert.ok((await h.finance.toggleGoalArchived('g1')).ok);
  const stored = JSON.parse((await h.kv.get('family_finance_goals')) as string) as Record<string, unknown>[];
  assert.deepEqual(stored[1], other, 'untrimmed title of an untouched goal preserved');
  assert.equal(stored[0]?.isArchived, true);
});
