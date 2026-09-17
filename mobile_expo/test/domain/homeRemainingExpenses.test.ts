// Home "סך הכול הוצאות" — APPROVED 17/09/2026: only the expenses still expected in the
// current 5th→4th period (strictly after today through the period end), from the same
// cash-flow events as Forecast, each counted once. The whole-period Web figure
// (getHomePeriodOutflows) and the Forecast day walk are unchanged.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { buildProjectedBalanceSeries, getForecastPeriodBounds } from '../../src/domain/forecast.ts';
import { getHomePeriodOutflows, getHomeRemainingExpensesForCurrentPeriod } from '../../src/domain/homeTotals.ts';
import { buildHomeView } from '../../src/presentation/homeView.ts';
import { formatAmount } from '../../src/presentation/format.ts';
import { snapshotOf } from '../support/financeHarness.ts';

const cc = resolveCategoryConfig(null);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0);

// Anonymized equivalent of the real A54 data restored on 17/09/2026: the same scheduling
// fields and amounts for every active item, generic titles, no notes.
let nextId = 1;
const item = (fields: Record<string, unknown>) => ({ id: nextId++, title: 'פריט ' + nextId, isArchived: false, ...fields });
const REAL_EQUIVALENT = [
  item({ type: 'cashWithdrawal', amount: 9000, start: '2026-09-08', notes: '' }),
  item({ type: 'cashWithdrawal', amount: 1400, start: '2026-09-08', notes: '' }),
  item({ type: 'dated', displayCategory: 'dated', amount: 2, start: '2026-10-02', where: 'bank' }),
  item({ type: 'dated', displayCategory: 'dated', amount: 3245, start: '2026-10-02', where: 'bank' }),
  item({ type: 'dated', displayCategory: 'dated', amount: 6996, start: '2026-10-02', where: 'bank' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 1, day: '1', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 100, day: '1', where: 'credit', period: 'חודשי', bimonthly: true, bimonthlyStartMonth: '8' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 100, day: '16', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 140, day: '25', where: 'credit', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 150, day: '1', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 250, day: '27', where: 'credit', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 300, day: '1', where: 'credit', period: 'חודשי', bimonthly: true, bimonthlyStartMonth: '7' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 320, day: '10', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 321, day: '2', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 430, day: '15', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 496, day: '1', where: 'credit', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 60, day: '2', where: 'credit', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 74, day: '10', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 74, day: '28', where: 'bank', period: 'חודשי' }),
  item({ type: 'fixed', displayCategory: 'fixed', amount: 800, day: '16', where: 'credit', period: 'חודשי', bimonthly: true, bimonthlyStartMonth: '3' }),
  item({ type: 'income', displayCategory: 'income', amount: 1, day: '1' }),
  item({ type: 'income', displayCategory: 'income', amount: 20000 }),
  item({ type: 'income', displayCategory: 'income', amount: 2317, day: '28' }),
  item({ type: 'income', displayCategory: 'income', amount: 2760, day: '28' }),
  item({ type: 'income', displayCategory: 'income', amount: 6500, day: '10' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 835, where: 'בחשבון', day: '2', total: '12', start: '2025-11-26' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 835, where: 'בחשבון', day: '2', total: '12', start: '2025-11-26' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 653.99, where: 'דרך תלוש השכר', day: '2', total: '24', start: '2026-04-21' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 788, where: 'בחשבון', day: '2', total: '24', start: '2026-03-23' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 1090.64, where: 'דרך תלוש השכר', day: '2', total: '24', start: '2026-06-15' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 362, where: 'דרך תלוש השכר', day: '1', total: '120', start: '2016-10-26' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 1532.6, where: 'חשבון בנק', day: '10', total: '36', start: '2026-04-29' }),
  item({ type: 'loan', displayCategory: 'loan', amount: 685.04, where: 'דרך תלוש השכר', day: '2', total: '12', start: '2026-04-22' }),
  item({ type: 'variable', displayCategory: 'variable', amount: 127, day: '2', total: '12', start: '2026-08-26', where: 'credit' }),
  item({ type: 'variable', displayCategory: 'variable', amount: 509, day: '1', total: '5', start: '2026-08-31' }),
  item({ type: 'variable', displayCategory: 'variable', amount: 58, day: '2', total: '12', start: '2026-02-18' }),
];

test('real-data reconciliation (17.9.2026): Home shows only the remaining 13,247; the whole period stays 15,703.6', () => {
  const now = at(2026, 9, 17);
  // 28.9: 74 · 1.10: 1 + 150 · 2.10: 321 + loans 835 + 835 + 788 + card settlements 2 + 6,996 + 3,245
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(REAL_EQUIVALENT, now, cc), 13247);
  // Past in the period (10.9 74 + 320 + loan 1,532.6 · 15.9 430 · 16.9 100 = 2,456.6) is gone from Home only.
  assert.deepEqual(getHomePeriodOutflows(REAL_EQUIVALENT, now, cc), { expenses: 15703.6, withdrawals: 10400, totalOutflow: 26103.6 });
});

test('Forecast daily values are unchanged: 2.10.2026 still debits 13,022 once', () => {
  const series = buildProjectedBalanceSeries(2003, '2026-09-16', at(2026, 10, 4), REAL_EQUIVALENT, [], cc);
  assert.ok(series);
  const oct2 = series.days.find((d) => d.dateKey === '2026-10-02');
  assert.ok(oct2);
  assert.equal(oct2.expenses, 13022, '321 + loans 2,458 + card settlements 10,243 — each once');
  assert.equal(oct2.events.filter((e) => e.type === 'loan').length, 3, 'the three bank loans only; payroll loans on day 2 add nothing');
  assert.equal(oct2.events.filter((e) => e.type === 'dated').length, 3);
  assert.equal(series.days[series.days.length - 1]?.projectedBalance, 13834);
});

test('past excluded, future included, loans / settlements once, credit-paid and payroll excluded', () => {
  const items = [
    item({ type: 'fixed', displayCategory: 'fixed', amount: 400, day: '6', where: 'bank' }), // past (6.9)
    item({ type: 'fixed', displayCategory: 'fixed', amount: 100, day: '20', where: 'bank' }), // future
    item({ type: 'fixed', displayCategory: 'fixed', amount: 999, day: '20', where: 'credit' }), // inside the card bill
    item({ type: 'loan', displayCategory: 'loan', amount: 500, day: '2', total: '12', start: '2026-01-01', where: 'בחשבון' }),
    item({ type: 'loan', displayCategory: 'loan', amount: 777, day: '2', total: '12', start: '2026-01-01', where: 'דרך תלוש השכר' }),
    item({ type: 'dated', displayCategory: 'dated', amount: 2000, start: '2026-10-02', where: 'bank' }),
    item({ type: 'variable', displayCategory: 'variable', amount: 55, day: '25', total: '3', start: '2026-09-01', where: 'credit' }),
    item({ type: 'cashWithdrawal', amount: 300, start: '2026-09-25', notes: '' }),
  ];
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(items, at(2026, 9, 17), cc), 2600, '100 + loan 500 + settlement 2,000');
});

test('boundaries: an event dated today is already inside today\'s balance; the period end (4th) is included, the 5th is not', () => {
  const items = [
    item({ type: 'fixed', displayCategory: 'fixed', amount: 10, day: '17', where: 'bank' }), // today
    item({ type: 'fixed', displayCategory: 'fixed', amount: 20, day: '18', where: 'bank' }), // tomorrow
    item({ type: 'fixed', displayCategory: 'fixed', amount: 40, day: '4', where: 'bank' }), // 4.10 — period end
    item({ type: 'fixed', displayCategory: 'fixed', amount: 80, day: '5', where: 'bank' }), // 5.10 — next period (5.9 is past)
  ];
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(items, at(2026, 9, 17), cc), 60, 'tomorrow 20 + period end 40');
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(items, at(2026, 9, 30), cc), 40, '4.10 included, 5.10 belongs to the next period');
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(items, at(2026, 9, 5), cc), 70, '5.9 itself is today, so excluded: 10 + 20 + 40');
  // The period is the Forecast screen's getForecastPeriodBounds() (5th of today's month → 4th of the
  // next), so on the 1st–4th the "current period" is the one starting on this month's 5th.
  assert.equal(getHomeRemainingExpensesForCurrentPeriod(items, at(2026, 10, 3), cc), 150, 'period 5.10–4.11: 80 + 10 + 20 + 40');
});

test('period bounds (kept 17/09/2026): the 5th of today\'s month → the 4th of the next, including on the 1st–4th', () => {
  // Web v1.4.7 (58d3ca8) deliberately replaced "the cycle containing today" with this rule; the
  // user re-confirmed it on 17/09/2026. Home remaining expenses and Forecast share it.
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bounds = (y: number, m: number, d: number) => {
    const b = getForecastPeriodBounds(at(y, m, d));
    return [key(b.periodStart), key(b.periodEnd)];
  };
  assert.deepEqual(bounds(2026, 9, 29), ['2026-09-05', '2026-10-04']);
  assert.deepEqual(bounds(2026, 10, 1), ['2026-10-05', '2026-11-04']);
  assert.deepEqual(bounds(2026, 10, 3), ['2026-10-05', '2026-11-04']);
  assert.deepEqual(bounds(2026, 10, 4), ['2026-10-05', '2026-11-04']);
  assert.deepEqual(bounds(2026, 10, 5), ['2026-10-05', '2026-11-04']);
  assert.deepEqual(bounds(2027, 1, 3), ['2027-01-05', '2027-02-04']);
  assert.deepEqual(bounds(2027, 1, 5), ['2027-01-05', '2027-02-04']);
  assert.deepEqual(bounds(2026, 12, 20), ['2026-12-05', '2027-01-04'], 'year boundary');
});

test('Home view: the "סך הכול הוצאות" tile shows the remaining figure', async () => {
  const s = await snapshotOf({ family_finance_data: JSON.stringify(REAL_EQUIVALENT) }, at(2026, 9, 17));
  assert.equal(buildHomeView(s).expensesText, formatAmount(13247));
});
