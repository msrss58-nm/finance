// Home "סך הכול הוצאות" — app.js getHomeTotalExpensesForCurrentPeriod(),
// with approved correction A applied.
//
// The Web function sums every negative event in the 5th→4th period, INCLUDING
// cash withdrawals. Correction A: a cash withdrawal is not an expense. It still
// reduces the balance (the engine emits it unchanged) but it is excluded from
// total expenses and reported separately. `totalOutflow` keeps the Web figure,
// and `expenses + withdrawals === totalOutflow` holds exactly.
//
// APPROVED 17/09/2026: the Home tile no longer shows the whole period — it shows
// getHomeRemainingExpensesForCurrentPeriod(). getHomePeriodOutflows() stays the
// whole-period figure the parity suite compares against the Web.

import type { CategoryConfig } from './categoryConfig.ts';
import { generateCashflowEvents, isExpenseEvent } from './cashflow.ts';
import { cashflowDateOnly } from './dates.ts';
import { getForecastPeriodBounds } from './forecast.ts';
import { round2 } from './numbers.ts';
import type { RawItem } from './raw.ts';

export type PeriodOutflows = {
  /** Expenses only (cash withdrawals excluded). */
  readonly expenses: number;
  readonly withdrawals: number;
  /** Every bank outflow in the period — the unchanged Web figure. */
  readonly totalOutflow: number;
};

export function getHomePeriodOutflows(items: readonly RawItem[], refDate: Date, categoryConfig: CategoryConfig): PeriodOutflows {
  const bounds = getForecastPeriodBounds(refDate);
  const rangeStartMonth = new Date(bounds.periodStart.getFullYear(), bounds.periodStart.getMonth(), 1);
  const monthsCount =
    (bounds.periodEnd.getFullYear() - rangeStartMonth.getFullYear()) * 12 + (bounds.periodEnd.getMonth() - rangeStartMonth.getMonth()) + 1;
  const events = generateCashflowEvents(items, rangeStartMonth, monthsCount, categoryConfig);
  let total = 0;
  let withdrawalsRaw = 0;
  for (const ev of events) {
    const evDate = cashflowDateOnly(ev.date);
    if (ev.amount < 0 && evDate >= bounds.periodStart && evDate <= bounds.periodEnd) {
      total += -ev.amount;
      if (ev.type === 'cashWithdrawal') withdrawalsRaw += -ev.amount;
    }
  }
  const totalOutflow = round2(total);
  const withdrawals = round2(withdrawalsRaw);
  return { expenses: round2(totalOutflow - withdrawals), withdrawals, totalOutflow };
}

/**
 * Home "סך הכול הוצאות" (APPROVED 17/09/2026): the expenses still expected in the
 * current 5th→4th period — events strictly after today through the period end.
 * Same engine events and inclusion rules as the whole-period figure (no withdrawals,
 * no credit-paid items, no payroll loans), each event counted once. Today's own
 * events are excluded: they are already inside "יתרה צפויה להיום" (the day walk runs
 * through today) and in "פעילות אחרונה", consistent with "מה צפוי לרדת".
 */
export function getHomeRemainingExpensesForCurrentPeriod(items: readonly RawItem[], refDate: Date, categoryConfig: CategoryConfig): number {
  const bounds = getForecastPeriodBounds(refDate);
  const todayZero = cashflowDateOnly(refDate);
  const rangeStartMonth = new Date(bounds.periodStart.getFullYear(), bounds.periodStart.getMonth(), 1);
  const monthsCount =
    (bounds.periodEnd.getFullYear() - rangeStartMonth.getFullYear()) * 12 + (bounds.periodEnd.getMonth() - rangeStartMonth.getMonth()) + 1;
  let total = 0;
  for (const ev of generateCashflowEvents(items, rangeStartMonth, monthsCount, categoryConfig)) {
    const evDate = cashflowDateOnly(ev.date);
    if (isExpenseEvent(ev) && evDate > todayZero && evDate >= bounds.periodStart && evDate <= bounds.periodEnd) total += -ev.amount;
  }
  return round2(total);
}

/** Home total expenses for the current 5th→4th period — cash withdrawals excluded (correction A). */
export function getHomeTotalExpensesForCurrentPeriod(items: readonly RawItem[], refDate: Date, categoryConfig: CategoryConfig): number {
  return getHomePeriodOutflows(items, refDate, categoryConfig).expenses;
}
