// Home "סך הכול הוצאות" — app.js getHomeTotalExpensesForCurrentPeriod(),
// with approved correction A applied.
//
// The Web function sums every negative event in the 5th→4th period, INCLUDING
// cash withdrawals. Correction A: a cash withdrawal is not an expense. It still
// reduces the balance (the engine emits it unchanged) but it is excluded from
// total expenses and reported separately. `totalOutflow` keeps the Web figure,
// and `expenses + withdrawals === totalOutflow` holds exactly.

import type { CategoryConfig } from './categoryConfig.ts';
import { generateCashflowEvents } from './cashflow.ts';
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

/** Home total expenses for the current 5th→4th period — cash withdrawals excluded (correction A). */
export function getHomeTotalExpensesForCurrentPeriod(items: readonly RawItem[], refDate: Date, categoryConfig: CategoryConfig): number {
  return getHomePeriodOutflows(items, refDate, categoryConfig).expenses;
}
