// Unified cash-flow engine rules (app.js generateCashflowEvents), hand-derived.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { generateCashflowEvents, isExpenseEvent } from '../../src/domain/cashflow.ts';
import { cashflowDateKey } from '../../src/domain/dates.ts';

const cc = resolveCategoryConfig(null);
const gen = (items: Record<string, unknown>[], y = 2026, m = 0, months = 6) => generateCashflowEvents(items, new Date(y, m, 1), months, cc);
const keys = (evs: { date: Date }[]) => evs.map((e) => cashflowDateKey(e.date));

test('income: one event per month on its day', () => {
  const evs = gen([{ id: 1, type: 'income', amount: 5000, day: 10 }], 2026, 0, 3);
  assert.deepEqual(keys(evs), ['2026-01-10', '2026-02-10', '2026-03-10']);
  assert.ok(evs.every((e) => e.amount === 5000));
});

test('fixed: bank counts, credit never does, missing where defaults to bank', () => {
  assert.equal(gen([{ id: 1, type: 'fixed', amount: 1200, day: 5, where: 'bank' }], 2026, 0, 3).length, 3);
  assert.equal(gen([{ id: 1, type: 'fixed', amount: 1200, day: 5, where: 'credit' }], 2026, 0, 3).length, 0);
  assert.equal(gen([{ id: 1, type: 'fixed', amount: 1200, day: 5 }], 2026, 0, 3).length, 3);
});

test('fixed yearly: amount / 12 every month', () => {
  const evs = gen([{ id: 1, type: 'fixed', amount: 1200, day: 5, period: 'שנתי' }], 2026, 0, 2);
  assert.deepEqual(evs.map((e) => e.amount), [-100, -100]);
});

test('fixed bimonthly: full amount only in months matching the start month parity', () => {
  const evs = gen([{ id: 1, type: 'fixed', amount: 400, day: 5, bimonthly: true, bimonthlyStartMonth: 9 }], 2026, 0, 6);
  assert.deepEqual(keys(evs), ['2026-01-05', '2026-03-05', '2026-05-05']);
  assert.ok(evs.every((e) => e.amount === -400));
});

test('loan: payroll never generates a bank event; bank loan only in active billing months', () => {
  assert.equal(gen([{ id: 1, type: 'loan', amount: 500, day: 10, total: 3, start: '2026-01-20', where: 'דרך תלוש השכר' }]).length, 0);
  // start day 20 >= billing day 10 -> first billing Feb 10; 3 payments -> Feb, Mar, Apr.
  const evs = gen([{ id: 1, type: 'loan', amount: 500, day: 10, total: 3, start: '2026-01-20', where: 'Leumi' }]);
  assert.deepEqual(keys(evs), ['2026-02-10', '2026-03-10', '2026-04-10']);
});

test('variable: bank generates events; credit and legacy (missing where) are tracking-only', () => {
  const base = { id: 1, type: 'variable', amount: 250, day: 15, total: 4, start: '2026-01-01' };
  assert.deepEqual(keys(gen([{ ...base, where: 'bank' }])), ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  assert.equal(gen([{ ...base, where: 'credit' }]).length, 0);
  assert.equal(gen([{ ...base }]).length, 0);
});

test('dated: the built-in settlement always counts; an ordinary credit dated item does not', () => {
  const builtin = { id: 1, type: 'dated', displayCategory: 'dated', where: 'credit', amount: 2000, start: '2026-02-14' };
  const creditPurchase = { id: 2, type: 'dated', displayCategory: 'creditPurchase', where: 'credit', amount: 300, start: '2026-02-14' };
  const bankDated = { id: 3, type: 'dated', displayCategory: 'creditPurchase', where: 'bank', amount: 300, start: '2026-02-14' };
  assert.deepEqual(gen([builtin, creditPurchase, bankDated]).map((e) => e.itemId), [1, 3]);
  assert.equal(gen([{ ...builtin, start: '2026-08-01' }]).length, 0, 'outside the window');
});

test('cashWithdrawal: one-time negative event, and it is not an expense event', () => {
  const evs = gen([{ id: 1, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 200, start: '2026-03-03', isArchived: false }]);
  assert.equal(evs.length, 1);
  assert.equal(evs[0]?.type, 'cashWithdrawal');
  assert.equal(evs[0]?.amount, -200);
  assert.equal(isExpenseEvent(evs[0] as never), false);
});

test('day 29/30/31 clamps to the month end without changing the stored day', () => {
  const item = { id: 1, type: 'income', amount: 1, day: 31 };
  assert.deepEqual(keys(gen([item], 2026, 1, 1)), ['2026-02-28']);
  assert.deepEqual(keys(gen([item], 2028, 1, 1)), ['2028-02-29']);
  assert.deepEqual(keys(gen([item], 2026, 3, 1)), ['2026-04-30']);
  assert.equal(item.day, 31);
});

test('archived items contribute nothing; same-day income sorts before expenses', () => {
  assert.equal(gen([{ id: 1, type: 'income', amount: 1, day: 5, isArchived: true }]).length, 0);
  const evs = gen([{ id: 9, type: 'fixed', amount: 10, day: 5 }, { id: 2, type: 'income', amount: 10, day: 5 }], 2026, 0, 1);
  assert.deepEqual(evs.map((e) => e.type), ['income', 'fixed']);
});
