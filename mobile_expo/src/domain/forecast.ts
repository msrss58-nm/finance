// Forecast / Opening Balance — ported from app.js getForecastPeriodBounds(),
// getNextCashflowEvent(), buildProjectedBalanceSeries(),
// buildProjectedBalanceMonthView(), getProjectedBalanceToday().
//
// Forecast screen contract (approved decision D): the period is the 5th of the
// reference date's own month through the 4th of the next month. The 6-month
// CASHFLOW_HORIZON_MONTHS is only an internal generation horizon.
//
// Approved correction A applied to day rows: `expenses` EXCLUDES cash
// withdrawals, which are reported separately in `withdrawals`. The balance,
// `net` and `totalOutflow` (= the Web app's own "expenses" figure) are
// unchanged, and `expenses + withdrawals` reconciles exactly to `totalOutflow`.

import type { CategoryConfig } from './categoryConfig.ts';
import { CASHFLOW_HORIZON_MONTHS, compareCashflowEvents, generateCashflowEvents, type CashflowEvent } from './cashflow.ts';
import { cashflowDateKey, cashflowDateOnly, monthStartOf, parseLocalDateStr } from './dates.ts';
import { round2 } from './numbers.ts';
import type { RawItem } from './raw.ts';
import type { OpeningBalanceConfig } from './settings.ts';

export type ForecastPeriodBounds = {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly totalDays: number;
  readonly periodLabel: string;
};

/** app.js getForecastPeriodBounds(): always the 5th of refDate's month → the 4th of the next. */
export function getForecastPeriodBounds(refDate: Date): ForecastPeriodBounds {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const periodStart = new Date(y, m, 5);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 4);
  const totalDays = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
  const startLabel = periodStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  const endLabel = periodEnd.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const periodLabel =
    startLabel + (periodStart.getFullYear() !== periodEnd.getFullYear() ? ' ' + periodStart.getFullYear() : '') + ' – ' + endLabel;
  return { periodStart, periodEnd, totalDays, periodLabel };
}

/** app.js getNextCashflowEvent(): the first event strictly after today, 2-month look-ahead. */
export function getNextCashflowEvent(items: readonly RawItem[], now: Date, categoryConfig: CategoryConfig): CashflowEvent | null {
  const todayZero = cashflowDateOnly(now);
  const upcoming = generateCashflowEvents(items, monthStartOf(todayZero), 2, categoryConfig);
  const future = upcoming.filter((e) => cashflowDateOnly(e.date) > todayZero);
  future.sort(compareCashflowEvents);
  return future.length ? (future[0] as CashflowEvent) : null;
}

export type AnnotatedEvent = CashflowEvent & { readonly alreadyIncludedInOpeningSnapshot: boolean };

export type ProjectedDay = {
  readonly date: Date;
  readonly dateKey: string;
  readonly income: number;
  /** Expenses only — cash withdrawals excluded (correction A). */
  readonly expenses: number;
  /** Cash withdrawals of the day (balance movements, not expenses). */
  readonly withdrawals: number;
  /** Every bank outflow of the day = the Web app's own "expenses" figure. */
  readonly totalOutflow: number;
  readonly net: number;
  readonly projectedBalance: number;
  readonly events: readonly AnnotatedEvent[];
  readonly isOpeningDay: boolean;
};

export type ProjectedSeries = { readonly openingAmount: number; readonly openingDateStr: string; readonly days: readonly ProjectedDay[] };

/**
 * app.js buildProjectedBalanceSeries(): a forward, day-by-day walk from the
 * opening date through `throughDate`. Opening-day events are already reflected
 * in the opening amount — except a cash withdrawal whose id is not in the
 * captured snapshot (`null` snapshot = legacy blanket rule: all included).
 * Never walks backward; returns null only for a structurally invalid opening.
 */
export function buildProjectedBalanceSeries(
  openingAmount: unknown,
  openingDateStr: unknown,
  throughDate: Date,
  items: readonly RawItem[],
  includedWithdrawalIds: unknown,
  categoryConfig: CategoryConfig,
): ProjectedSeries | null {
  const openingDate = parseLocalDateStr(openingDateStr);
  if (!openingDate || typeof openingAmount !== 'number' || !isFinite(openingAmount)) return null;
  const openingZero = cashflowDateOnly(openingDate);
  const through = cashflowDateOnly(throughDate);
  if (through < openingZero) return { openingAmount: round2(openingAmount), openingDateStr: openingDateStr as string, days: [] };
  const includedIds = Array.isArray(includedWithdrawalIds) ? (includedWithdrawalIds as unknown[]) : null;

  const rangeStartMonth = monthStartOf(openingZero);
  const monthsCount =
    (through.getFullYear() - rangeStartMonth.getFullYear()) * 12 + (through.getMonth() - rangeStartMonth.getMonth()) + 1;
  const events = generateCashflowEvents(items, rangeStartMonth, monthsCount, categoryConfig);

  const byDay = new Map<string, CashflowEvent[]>();
  for (const ev of events) {
    const key = cashflowDateKey(ev.date);
    const list = byDay.get(key);
    if (list) list.push(ev);
    else byDay.set(key, [ev]);
  }

  const days: ProjectedDay[] = [];
  let runningBalance = round2(openingAmount);
  const cursor = new Date(openingZero.getFullYear(), openingZero.getMonth(), openingZero.getDate());
  let isOpeningDay = true;
  while (cursor <= through) {
    const dateKey = cashflowDateKey(cursor);
    const dayEvents = byDay.get(dateKey) ?? [];
    let income = 0;
    let outflow = 0;
    let withdrawalsRaw = 0;
    let appliedNet = 0;
    const annotatedEvents: AnnotatedEvent[] = [];
    for (const ev of dayEvents) {
      if (ev.amount >= 0) income += ev.amount;
      else {
        outflow += -ev.amount;
        if (ev.type === 'cashWithdrawal') withdrawalsRaw += -ev.amount;
      }
      let alreadyIncluded = true;
      if (isOpeningDay && ev.type === 'cashWithdrawal') {
        alreadyIncluded = includedIds === null ? true : includedIds.indexOf(ev.itemId) !== -1;
      }
      if (!isOpeningDay || !alreadyIncluded) appliedNet += ev.amount;
      annotatedEvents.push({
        date: ev.date,
        amount: ev.amount,
        itemId: ev.itemId,
        type: ev.type,
        title: ev.title,
        alreadyIncludedInOpeningSnapshot: isOpeningDay ? alreadyIncluded : false,
      });
    }
    income = round2(income);
    const totalOutflow = round2(outflow);
    const net = round2(income - totalOutflow);
    const withdrawals = round2(withdrawalsRaw);
    const expenses = round2(totalOutflow - withdrawals);
    appliedNet = round2(appliedNet);
    if (isOpeningDay) runningBalance = round2(openingAmount + appliedNet);
    else runningBalance = round2(runningBalance + net);
    days.push({
      date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      dateKey,
      income,
      expenses,
      withdrawals,
      totalOutflow,
      net,
      projectedBalance: runningBalance,
      events: annotatedEvents,
      isOpeningDay,
    });
    isOpeningDay = false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return { openingAmount: round2(openingAmount), openingDateStr: openingDateStr as string, days };
}

export type PeriodDay =
  | {
      readonly date: Date;
      readonly periodDayIndex: number;
      readonly dateKey: string;
      readonly availability: 'unavailable';
      readonly income: null;
      readonly expenses: null;
      readonly withdrawals: null;
      readonly totalOutflow: null;
      readonly net: null;
      readonly projectedBalance: null;
      readonly events: readonly AnnotatedEvent[];
    }
  | {
      readonly date: Date;
      readonly periodDayIndex: number;
      readonly dateKey: string;
      readonly availability: 'opening' | 'available';
      readonly income: number;
      readonly expenses: number;
      readonly withdrawals: number;
      readonly totalOutflow: number;
      readonly net: number;
      readonly projectedBalance: number;
      readonly events: readonly AnnotatedEvent[];
    };

export type PeriodView = {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodLabel: string;
  readonly totalDays: number;
  readonly configured: boolean;
  readonly openingAmount?: number;
  readonly openingDateStr?: string;
  readonly days: readonly PeriodDay[];
};

/**
 * app.js buildProjectedBalanceMonthView(): every day of the 5th→4th period.
 * Days before the opening date are 'unavailable' with null figures — never
 * back-calculated, never 0.
 */
export function buildProjectedBalanceMonthView(
  refDate: Date,
  items: readonly RawItem[],
  opening: OpeningBalanceConfig | null,
  categoryConfig: CategoryConfig,
): PeriodView {
  const bounds = getForecastPeriodBounds(refDate);
  const base = { periodStart: bounds.periodStart, periodEnd: bounds.periodEnd, periodLabel: bounds.periodLabel, totalDays: bounds.totalDays };
  if (!opening) return { ...base, configured: false, days: [] };

  const openingZero = cashflowDateOnly(parseLocalDateStr(opening.dateStr) as Date);
  const series =
    openingZero <= bounds.periodEnd
      ? buildProjectedBalanceSeries(opening.amount, opening.dateStr, bounds.periodEnd, items, opening.includedWithdrawalIds, categoryConfig)
      : null;
  const seriesByKey = new Map<string, ProjectedDay>();
  if (series) for (const d of series.days) seriesByKey.set(d.dateKey, d);

  const days: PeriodDay[] = [];
  const cursor = new Date(bounds.periodStart.getFullYear(), bounds.periodStart.getMonth(), bounds.periodStart.getDate());
  let periodDayIndex = 1;
  while (cursor <= bounds.periodEnd) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const dateKey = cashflowDateKey(date);
    if (date < openingZero) {
      days.push({
        date,
        periodDayIndex,
        dateKey,
        availability: 'unavailable',
        income: null,
        expenses: null,
        withdrawals: null,
        totalOutflow: null,
        net: null,
        projectedBalance: null,
        events: [],
      });
    } else {
      const rec = seriesByKey.get(dateKey) as ProjectedDay;
      days.push({
        date,
        periodDayIndex,
        dateKey,
        availability: rec.isOpeningDay ? 'opening' : 'available',
        income: rec.income,
        expenses: rec.expenses,
        withdrawals: rec.withdrawals,
        totalOutflow: rec.totalOutflow,
        net: rec.net,
        projectedBalance: rec.projectedBalance,
        events: rec.events,
      });
    }
    periodDayIndex++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return { ...base, configured: true, openingAmount: opening.amount, openingDateStr: opening.dateStr, days };
}

export type ProjectedToday =
  | { readonly configured: false }
  | { readonly configured: true; readonly state: 'future'; readonly openingDateStr: string }
  | { readonly configured: true; readonly state: 'available'; readonly projectedBalance: number; readonly isOpeningDay: boolean };

/** app.js getProjectedBalanceToday(): the same series walked through today. */
export function getProjectedBalanceToday(
  items: readonly RawItem[],
  now: Date,
  opening: OpeningBalanceConfig | null,
  categoryConfig: CategoryConfig,
): ProjectedToday {
  if (!opening) return { configured: false };
  const todayZero = cashflowDateOnly(now);
  const openingZero = cashflowDateOnly(parseLocalDateStr(opening.dateStr) as Date);
  if (todayZero < openingZero) return { configured: true, state: 'future', openingDateStr: opening.dateStr };
  const series = buildProjectedBalanceSeries(opening.amount, opening.dateStr, todayZero, items, opening.includedWithdrawalIds, categoryConfig);
  const last = (series as ProjectedSeries).days[(series as ProjectedSeries).days.length - 1] as ProjectedDay;
  return { configured: true, state: 'available', projectedBalance: last.projectedBalance, isOpeningDay: last.isOpeningDay };
}

export type NextIncomeOutlook = {
  readonly nextIncome: CashflowEvent | null;
  /** Expenses strictly after today and strictly before the next income; null when there is no next income. */
  readonly expensesBeforeNextIncome: number | null;
  /** Cash withdrawals in the same window (a balance movement, reported separately); null when unknown. */
  readonly withdrawalsBeforeNextIncome: number | null;
};

/**
 * "Amount until next income" (CLAUDE.md §10: unknown/null — never 0 — when
 * there is no future income). The Web app removed its live card for this in
 * Version 1.4.1, so there is no Web output to compare; this is derived only
 * from the unified engine, within the internal generation horizon.
 */
export function getNextIncomeOutlook(
  items: readonly RawItem[],
  now: Date,
  categoryConfig: CategoryConfig,
  horizonMonths: number = CASHFLOW_HORIZON_MONTHS,
): NextIncomeOutlook {
  const todayZero = cashflowDateOnly(now);
  const events = generateCashflowEvents(items, monthStartOf(todayZero), horizonMonths, categoryConfig).filter(
    (e) => cashflowDateOnly(e.date) > todayZero,
  );
  const nextIncome = events.find((e) => e.type === 'income') ?? null;
  if (nextIncome === null) return { nextIncome: null, expensesBeforeNextIncome: null, withdrawalsBeforeNextIncome: null };
  const cutoff = cashflowDateOnly(nextIncome.date);
  let expenses = 0;
  let withdrawals = 0;
  for (const e of events) {
    if (cashflowDateOnly(e.date) >= cutoff || e.amount >= 0) continue;
    if (e.type === 'cashWithdrawal') withdrawals += -e.amount;
    else expenses += -e.amount;
  }
  return { nextIncome, expensesBeforeNextIncome: round2(expenses), withdrawalsBeforeNextIncome: round2(withdrawals) };
}
