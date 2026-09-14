// Approved correction A — a cash withdrawal reduces the balance but is NOT an
// expense. Required regressions: (1) balance reduced, (2) total expenses
// unchanged, (3) multiple withdrawals cumulative on balance / expenses still
// unchanged, (4) no double counting.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getCategoryMonthlyTotals, getMonthSnapshot } from '../../src/domain/aggregates.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { generateCashflowEvents } from '../../src/domain/cashflow.ts';
import { buildProjectedBalanceSeries, getNextIncomeOutlook } from '../../src/domain/forecast.ts';
import { getHomePeriodOutflows, getHomeTotalExpensesForCurrentPeriod } from '../../src/domain/homeTotals.ts';

const cc = resolveCategoryConfig(null);
const now = new Date(2026, 8, 10, 10, 0); // period 2026-09-05 → 2026-10-04
const rent = { id: 1, type: 'fixed', title: 'שכירות', amount: 1000, day: 15, where: 'bank' };
const salary = { id: 4, type: 'income', title: 'משכורת', amount: 8000, day: 1 };
const w1 = { id: 2, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 500, start: '2026-09-20', isArchived: false };
const w2 = { id: 3, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 300, start: '2026-09-25', isArchived: false };
const withW = [rent, salary, w1, w2];
const withoutW = [rent, salary];

const balanceOn30th = (items: Record<string, unknown>[]) =>
  buildProjectedBalanceSeries(5000, '2026-09-05', new Date(2026, 8, 30), items, [], cc)?.days.at(-1)?.projectedBalance;

test('(1) a withdrawal reduces the projected balance', () => {
  assert.equal(balanceOn30th([rent, salary, w1]), 3500); // 5000 - 1000 - 500
  assert.equal(balanceOn30th(withoutW), 4000);
});

test('(2) a withdrawal does not change total expenses', () => {
  assert.equal(getHomeTotalExpensesForCurrentPeriod([rent, salary, w1], now, cc), 1000);
  assert.equal(getHomeTotalExpensesForCurrentPeriod(withoutW, now, cc), 1000);
});

test('(3) multiple withdrawals reduce the balance cumulatively while expenses stay unchanged', () => {
  assert.equal(balanceOn30th(withW), 3200); // 5000 - 1000 - 500 - 300
  assert.deepEqual(getHomePeriodOutflows(withW, now, cc), { expenses: 1000, withdrawals: 800, totalOutflow: 1800 });
  const day20 = buildProjectedBalanceSeries(5000, '2026-09-05', new Date(2026, 8, 30), withW, [], cc)?.days.find((d) => d.dateKey === '2026-09-20');
  assert.deepEqual(
    { expenses: day20?.expenses, withdrawals: day20?.withdrawals, totalOutflow: day20?.totalOutflow, net: day20?.net, balance: day20?.projectedBalance },
    { expenses: 0, withdrawals: 500, totalOutflow: 500, net: -500, balance: 3500 },
  );
});

test('(4) no double counting: each withdrawal is one event, counted once, and never in expense aggregates', () => {
  const evs = generateCashflowEvents(withW, new Date(2026, 8, 1), 1, cc).filter((e) => e.type === 'cashWithdrawal');
  assert.deepEqual(evs.map((e) => [e.itemId, e.amount]), [[2, -500], [3, -300]]);
  assert.deepEqual(getMonthSnapshot(withW, now), { income: 8000, expenses: 1000, balance: 7000 });
  const totals = getCategoryMonthlyTotals(withW, cc, now);
  assert.equal(totals.cashWithdrawal, 0);
  assert.equal(totals.fixed, 1000);
  const outlook = getNextIncomeOutlook(withW, now, cc);
  assert.equal(outlook.expensesBeforeNextIncome, 1000);
  assert.equal(outlook.withdrawalsBeforeNextIncome, 800);
});

test('amount until next income is null — never 0 — when no future income exists', () => {
  assert.deepEqual(getNextIncomeOutlook([rent, w1], now, cc), { nextIncome: null, expensesBeforeNextIncome: null, withdrawalsBeforeNextIncome: null });
});
