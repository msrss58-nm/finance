// "פעילות אחרונה" (approved 16/09/2026): derived from the unified cash-flow engine —
// every event whose date has arrived or passed, most recent first, future events excluded.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { cashflowDateKey } from '../../src/domain/dates.ts';
import { getRecentCashflowActivity } from '../../src/domain/recentActivity.ts';

const cc = resolveCategoryConfig(null);
const NOW = new Date(2026, 8, 16, 10, 0); // 2026-09-16

const rows = (list: { date: Date; itemId: unknown; amount: number }[]) => list.map((e) => `${cashflowDateKey(e.date)}#${String(e.itemId)}=${e.amount}`);

test('a scheduled expense and income whose date has passed appear; a future one does not', () => {
  const items = [
    { id: 1, type: 'fixed', title: 'חשמל', amount: 500, day: 15, where: 'bank' }, // the 15th, already passed
    { id: 2, type: 'income', title: 'משכורת', amount: 9000, day: 15 }, // income yesterday
    { id: 3, type: 'fixed', title: 'עתידי', amount: 77, day: 20, where: 'bank' }, // still ahead
  ];
  const list = getRecentCashflowActivity(items, NOW, cc, 4);
  assert.ok(list.some((e) => e.itemId === 1), 'electricity on the 15th appears after the 15th');
  assert.ok(list.some((e) => e.itemId === 2), 'scheduled income that has passed appears');
  // item 3 recurs monthly, so its PAST occurrences are real activity; only the future one is excluded.
  assert.ok(!list.some((e) => cashflowDateKey(e.date) === '2026-09-20'), 'a future event never appears in recent activity');
  assert.ok(list.every((e) => e.date.getTime() <= new Date(2026, 8, 16).getTime()), 'nothing later than today');
});

test('ordering is most recent first, and cash withdrawals are included', () => {
  const items = [
    { id: 1, type: 'fixed', title: 'חשמל', amount: 500, day: 15, where: 'bank' },
    { id: 2, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 200, start: '2026-09-16', isArchived: false },
    { id: 3, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 300, start: '2026-09-11', isArchived: false },
  ];
  const list = getRecentCashflowActivity(items, NOW, cc, 3);
  assert.deepEqual(rows(list), ['2026-09-16#2=-200', '2026-09-15#1=-500', '2026-09-11#3=-300']);
});

test('only real bank movements: credit-paid items and payroll loans never appear', () => {
  const items = [
    { id: 1, type: 'fixed', title: 'אשראי', amount: 60, day: 10, where: 'credit' },
    { id: 2, type: 'loan', title: 'תלוש', amount: 500, day: 10, total: 24, start: '2026-01-01', where: 'דרך תלוש השכר' },
    { id: 3, type: 'loan', title: 'בנק', amount: 400, day: 10, total: 24, start: '2026-01-01', where: 'חשבון בנק' },
    { id: 4, type: 'dated', title: 'רכישה באשראי', amount: 70, start: '2026-09-10', displayCategory: 'creditPurchase', where: 'credit' },
    { id: 5, type: 'dated', title: 'חיוב כרטיס', amount: 2000, start: '2026-09-10', displayCategory: 'dated' },
  ];
  const list = getRecentCashflowActivity(items, NOW, cc, 10);
  const ids = list.map((e) => e.itemId);
  assert.ok(!ids.includes(1) && !ids.includes(2) && !ids.includes(4), 'credit-only and payroll events excluded');
  assert.ok(ids.includes(3), 'a bank loan payment appears');
  assert.ok(ids.includes(5), 'the built-in credit-card settlement appears (it is the real bank debit)');
});

test('no double counting: one event per item per date, and the row limit is respected', () => {
  const items = [{ id: 1, type: 'fixed', title: 'חשמל', amount: 500, day: 15, where: 'bank' }];
  const list = getRecentCashflowActivity(items, NOW, cc, 10);
  const keys = list.map((e) => `${String(e.itemId)}|${cashflowDateKey(e.date)}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicated (item, date)');
  assert.equal(getRecentCashflowActivity(items, NOW, cc, 2).length, 2, 'the caller row limit is preserved');
  assert.deepEqual(getRecentCashflowActivity([], NOW, cc, 4), [], 'nothing to show');
});

test('an archived item produces no activity', () => {
  const items = [{ id: 1, type: 'fixed', title: 'חשמל', amount: 500, day: 15, where: 'bank', isArchived: true }];
  assert.deepEqual(getRecentCashflowActivity(items, NOW, cc, 4), []);
});
