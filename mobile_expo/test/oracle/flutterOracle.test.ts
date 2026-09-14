// Flutter oracle vectors, ported 1:1 from mobile_flutter/test/domain/
// (forecast_test.dart, goals_test.dart, loans_test.dart). Each expectation is
// the Flutter test's own literal value; the Flutter source is not modified.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getLoanRemainingBalance } from '../../src/domain/aggregates.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { cashflowDateKey } from '../../src/domain/dates.ts';
import { buildProjectedBalanceMonthView, buildProjectedBalanceSeries, getProjectedBalanceToday } from '../../src/domain/forecast.ts';
import type { Goal } from '../../src/domain/goals.ts';
import { buildDeadlineScheduleFromDates, buildGoalScheduleInfo, getLastEligibleTransferDate } from '../../src/domain/goalsPlanning.ts';
import { roundLoanSplitForDisplay } from '../../src/domain/numbers.ts';

const cc = resolveCategoryConfig(null);
const income = (id: number, amount: number, day: number, archived = false) => ({ id, type: 'income', title: `income${id}`, displayCategory: 'income', amount, day, isArchived: archived });
const fixed = (id: number, amount: number, day: number) => ({ id, type: 'fixed', title: `fixed${id}`, displayCategory: 'fixed', amount, day, where: 'bank', period: 'חודשי', bimonthly: false, isArchived: false });
const withdrawal = (id: number, amount: number, start: string) => ({ id, type: 'cashWithdrawal', title: `withdrawal${id}`, amount, start, isArchived: false });
const series = (amount: number, date: string, through: Date, items: Record<string, unknown>[], ids: unknown = null) => {
  const s = buildProjectedBalanceSeries(amount, date, through, items, ids, cc);
  assert.ok(s);
  return s;
};
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

let vectors = 0;
let mismatches = 0;
const check = (label: string, actual: unknown, expected: unknown): void => {
  vectors++;
  try {
    assert.deepEqual(actual, expected, label);
  } catch (e) {
    mismatches++;
    throw e;
  }
};

test('forecast_test.dart vectors (Opening Balance / projected balance)', () => {
  let s = series(1000, '2026-09-01', D(2026, 9, 5), []);
  check('walks 5 days inclusive', [s.days.length, s.days[0]?.dateKey, s.days.at(-1)?.dateKey, s.days[0]?.isOpeningDay, s.days[1]?.isOpeningDay], [5, '2026-09-01', '2026-09-05', true, false]);
  check('no events carries forward', series(1000, '2026-09-01', D(2026, 9, 3), []).days.map((d) => d.projectedBalance), [1000, 1000, 1000]);
  check('zero opening is valid', series(0, '2026-09-01', D(2026, 9, 2), []).days[0]?.projectedBalance, 0);
  check('negative opening accepted', series(-250.5, '2026-09-01', D(2026, 9, 1), []).days[0]?.projectedBalance, -250.5);
  s = series(1000, '2026-09-10', D(2026, 9, 1), []);
  check('through before opening -> empty', [s.days.length, s.openingAmount], [0, 1000]);
  check('invalid opening date -> null', buildProjectedBalanceSeries(1000, 'not-a-date', D(2026, 9, 5), [], null, cc), null);

  s = series(1000, '2026-09-01', D(2026, 9, 4), [fixed(1, 300, 3)]);
  check('later-day expense', [s.days.map((d) => d.projectedBalance), s.days[2]?.expenses, s.days[2]?.net], [[1000, 1000, 700, 700], 300, -300]);
  const tenth = series(100, '2026-09-09', D(2026, 9, 10), [income(1, 5000, 10), fixed(2, 1200, 10)]).days.at(-1);
  check('same-day net', [tenth?.income, tenth?.expenses, tenth?.net, tenth?.projectedBalance], [5000, 1200, 3800, 3900]);
  check('archived contributes nothing', series(1000, '2026-09-01', D(2026, 9, 5), [income(1, 5000, 3, true)]).days.at(-1)?.projectedBalance, 1000);
  check('may go negative', series(100, '2026-09-01', D(2026, 9, 5), [fixed(1, 900, 3)]).days.at(-1)?.projectedBalance, -800);

  const od = series(1000, '2026-09-01', D(2026, 9, 1), [fixed(1, 300, 1)]).days[0];
  check('opening-day event reported, not applied', [od?.projectedBalance, od?.expenses, od?.net, od?.events[0]?.alreadyIncludedInOpeningSnapshot], [1000, 300, -300, true]);
  check('opening-day income already reflected', series(1000, '2026-09-05', D(2026, 9, 5), [income(1, 5000, 5)]).days[0]?.projectedBalance, 1000);
  check('flag false after opening day', series(1000, '2026-09-01', D(2026, 9, 3), [fixed(1, 300, 3)]).days.at(-1)?.events[0]?.alreadyIncludedInOpeningSnapshot, false);

  const w = withdrawal(77, 400, '2026-09-01');
  const wn = series(1000, '2026-09-01', D(2026, 9, 1), [w], null).days[0];
  check('null snapshot -> blanket rule', [wn?.projectedBalance, wn?.events[0]?.alreadyIncludedInOpeningSnapshot], [1000, true]);
  const we = series(1000, '2026-09-01', D(2026, 9, 1), [w], []).days[0];
  check('[] snapshot -> deducted', [we?.projectedBalance, we?.events[0]?.alreadyIncludedInOpeningSnapshot], [600, false]);
  check('id in snapshot -> included', series(1000, '2026-09-01', D(2026, 9, 1), [w], [77]).days[0]?.projectedBalance, 1000);
  check('different id -> deducted', series(1000, '2026-09-01', D(2026, 9, 1), [w], [99]).days[0]?.projectedBalance, 600);
  check('later withdrawal always deducts', series(1000, '2026-09-01', D(2026, 9, 2), [withdrawal(78, 400, '2026-09-02')], [78]).days.at(-1)?.projectedBalance, 600);

  s = series(1000, '2026-09-01', D(2026, 10, 6), [fixed(1, 100, 5)]);
  check('month boundary', [s.days.length, s.days.at(-1)?.projectedBalance], [36, 800]);
  check('year boundary', series(500, '2026-12-30', D(2027, 1, 2), []).days.map((d) => d.dateKey), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  s = series(0, '2028-02-01', D(2028, 2, 29), []);
  check('leap February', [s.days.length, s.days.at(-1)?.dateKey], [29, '2028-02-29']);
  const last = series(1000, '2026-09-01', D(2026, 9, 30), [fixed(1, 100, 31)]).days.at(-1);
  check('day 31 clamps', [last?.dateKey, last?.expenses, last?.projectedBalance], ['2026-09-30', 100, 900]);

  check('today: unconfigured', getProjectedBalanceToday([], D(2026, 9, 5), null, cc), { configured: false });
  check('today: future', getProjectedBalanceToday([], D(2026, 9, 1), { amount: 1000, dateStr: '2026-09-10', includedWithdrawalIds: null }, cc), { configured: true, state: 'future', openingDateStr: '2026-09-10' });
  check('today: opening day', getProjectedBalanceToday([], D(2026, 9, 10), { amount: 1234.5, dateStr: '2026-09-10', includedWithdrawalIds: null }, cc), { configured: true, state: 'available', projectedBalance: 1234.5, isOpeningDay: true });
  check('today: walked', getProjectedBalanceToday([fixed(1, 250, 10)], D(2026, 9, 15), { amount: 1000, dateStr: '2026-09-01', includedWithdrawalIds: null }, cc), { configured: true, state: 'available', projectedBalance: 750, isOpeningDay: false });

  let v = buildProjectedBalanceMonthView(D(2026, 9, 20), [], null, cc);
  check('view unconfigured', [v.configured, v.days.length, cashflowDateKey(v.periodStart), cashflowDateKey(v.periodEnd)], [false, 0, '2026-09-05', '2026-10-04']);
  v = buildProjectedBalanceMonthView(D(2026, 9, 20), [], { amount: 1000, dateStr: '2026-09-05', includedWithdrawalIds: null }, cc);
  check('view covers 5th→4th', [v.days.length, v.totalDays, v.days[0]?.dateKey, v.days.at(-1)?.dateKey, v.days[0]?.periodDayIndex, v.days.at(-1)?.periodDayIndex], [30, 30, '2026-09-05', '2026-10-04', 1, 30]);
  v = buildProjectedBalanceMonthView(D(2026, 9, 20), [], { amount: 1000, dateStr: '2026-09-08', includedWithdrawalIds: null }, cc);
  check('days before opening unavailable', v.days.slice(0, 5).map((d) => [d.availability, d.projectedBalance]), [['unavailable', null], ['unavailable', null], ['unavailable', null], ['opening', 1000], ['available', 1000]]);
  v = buildProjectedBalanceMonthView(D(2026, 9, 20), [], { amount: 1000, dateStr: '2026-12-01', includedWithdrawalIds: null }, cc);
  check('opening after period end', [v.configured, v.days.every((d) => d.availability === 'unavailable')], [true, true]);
  v = buildProjectedBalanceMonthView(D(2026, 9, 20), [fixed(1, 400, 25)], { amount: 1000, dateStr: '2026-08-20', includedWithdrawalIds: null }, cc);
  check('not reseeded on the 5th', [v.days[0]?.dateKey, v.days[0]?.availability, v.days[0]?.projectedBalance], ['2026-09-05', 'available', 600]);
  v = buildProjectedBalanceMonthView(D(2026, 9, 2), [], { amount: 500, dateStr: '2026-09-01', includedWithdrawalIds: null }, cc);
  check('anchored to refDate month', [cashflowDateKey(v.periodStart), cashflowDateKey(v.periodEnd)], ['2026-09-05', '2026-10-04']);
  v = buildProjectedBalanceMonthView(D(2026, 12, 10), [], { amount: 100, dateStr: '2026-12-05', includedWithdrawalIds: null }, cc);
  check('Dec → Jan period', [cashflowDateKey(v.periodStart), cashflowDateKey(v.periodEnd), v.days.length, v.days.at(-1)?.dateKey], ['2026-12-05', '2027-01-04', 31, '2027-01-04']);
});

test('goals_test.dart vectors (deadlines, FIFO, merged schedule)', () => {
  const k = (d: Date) => cashflowDateKey(d);
  check('last eligible after 2nd', k(getLastEligibleTransferDate('2026-06-15')), '2026-06-02');
  check('last eligible on 2nd', k(getLastEligibleTransferDate('2026-06-02')), '2026-06-02');
  check('last eligible on 1st', k(getLastEligibleTransferDate('2026-06-01')), '2026-05-02');
  check('Jan 1st rolls to previous year', k(getLastEligibleTransferDate('2026-01-01')), '2025-12-02');
  check('leap', [k(getLastEligibleTransferDate('2024-03-01')), k(getLastEligibleTransferDate('2024-02-29'))], ['2024-02-02', '2024-02-02']);
  const s1 = buildDeadlineScheduleFromDates(1000, '2026-06-15', [D(2026, 4, 2), D(2026, 5, 2), D(2026, 6, 2)]);
  check('ceil + remainder', [s1.suggestedMonthly, s1.perDateAmounts.map((p) => p.amount)], [334, [334, 334, 332]]);
  const s2 = buildDeadlineScheduleFromDates(1234.56, '2026-06-15', [D(2026, 6, 2)]);
  check('single date', [s2.suggestedMonthly, s2.perDateAmounts[0]?.amount], [1235, 1234.56]);
  const s3 = buildDeadlineScheduleFromDates(2, '2026-06-15', [D(2026, 3, 2), D(2026, 4, 2), D(2026, 5, 2), D(2026, 6, 2)]);
  check('more dates than shekels', [s3.suggestedMonthly, s3.perDateAmounts.map((p) => p.amount)], [1, [1, 1, 0, 0]]);

  const goal = (saved: number, transfers: Goal['confirmedTransfers'] = []): Goal => ({
    id: 'g1', title: 'יעד', dueDate: '2026-09-01', targetAmount: 3500, savedAmount: saved, isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', confirmedTransfers: transfers,
    components: [
      { id: 'c2', name: 'טיסה', amount: 2000, dueDate: '2026-07-10' },
      { id: 'c1', name: 'ריהוט', amount: 1000, dueDate: '2026-05-10' },
      { id: 'c3', name: 'ביטוח', amount: 500, dueDate: null },
    ],
  });
  const today = D(2026, 4, 5);
  let info = buildGoalScheduleInfo(goal(0), today);
  check('buckets by earliest due date', [info.buckets.map((b) => b.key), info.buckets.map((b) => b.dueDate)], [['c1', 'c2', 'c3'], ['2026-05-10', '2026-07-10', '2026-09-01']]);
  info = buildGoalScheduleInfo(goal(1200), today);
  check('FIFO pool', [info.buckets.map((b) => b.saved), info.buckets.map((b) => b.remaining), info.buckets[0]?.isCompleted, info.remaining], [[1000, 200, 0], [0, 1800, 500], true, 2300]);
  check('merged', info.mergedPerDateAmounts.map((p) => `${k(p.date)}=${p.amount}`), ['2026-05-02=725', '2026-06-02=725', '2026-07-02=725', '2026-08-02=125']);
  check('next transfer', [k(info.nextTransferDate as Date), info.nextTransferAmount, info.effectiveDueDate], ['2026-05-02', 725, '2026-07-10']);
  info = buildGoalScheduleInfo(goal(700), today);
  check('partial funding', [info.buckets.map((b) => b.saved), info.buckets.map((b) => b.remaining), info.remaining], [[700, 0, 0], [300, 2000, 500], 2800]);
  info = buildGoalScheduleInfo(goal(400, [{ date: '2026-03-04', amount: 800 }]), today);
  check('confirmed feeds pool', [info.saved, info.confirmed, info.buckets.map((b) => b.saved)], [400, 800, [1000, 200, 0]]);
  info = buildGoalScheduleInfo(goal(3500), today);
  check('fully funded', [info.effectiveDueDate, info.isCompleted, info.mergedPerDateAmounts.length, info.nextTransferDate, info.nextTransferAmount], ['2026-09-01', true, 0, null, null]);
});

test('loans_test.dart vectors (amortization, straight line, split rounding)', () => {
  const loan = { id: 1, type: 'loan', title: 'loan', originalAmount: 10000, amount: 900, interest: 5, day: 10, total: 12, start: '2025-06-10', where: 'bank' };
  const r1 = getLoanRemainingBalance(loan, D(2026, 1, 10));
  check('amortization left/total', [r1.left, r1.total], [5, 4500]);
  vectors++;
  assert.ok(Math.abs(r1.principal - 3916.038764693665) < 1e-9, `principal ${r1.principal}`);
  const r2 = getLoanRemainingBalance(loan, D(2025, 7, 9));
  check('before first billing', [r2.left, r2.total], [12, 10800]);
  vectors++;
  assert.ok(Math.abs(r2.principal - 10000) < 1e-9);
  const r3 = getLoanRemainingBalance({ ...loan, originalAmount: 12000, amount: 1100, interest: 0 }, D(2026, 1, 10));
  check('straight line', [r3.left, r3.total, r3.principal], [5, 5500, 4300]);
  check('split 3990.5 + 2791.5', roundLoanSplitForDisplay(3990.5, 2791.5), { bank: 3991, payroll: 2791, total: 6782 });
  check('split 100.4 + 200.4', roundLoanSplitForDisplay(100.4, 200.4), { bank: 101, payroll: 200, total: 301 });
  console.log(`FLUTTER-ORACLE vectors=${vectors} mismatches=${mismatches}`);
});
