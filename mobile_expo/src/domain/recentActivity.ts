// "פעילות אחרונה" — approved 16/09/2026.
//
// Product rule: when a scheduled income or expense reaches its configured date the
// product treats it as having occurred; no bank confirmation is required. So the list
// is derived from the SAME unified cash-flow engine as every other Home figure, not
// from the stored-item insertion order:
//   - included: every event whose date is today or earlier (income, fixed/variable/
//     loan bank charges, the built-in credit-card settlement, cash withdrawals);
//   - excluded: anything the engine does not schedule as a real movement (credit-paid
//     items, payroll loans) and anything still in the future — that belongs to
//     "מה צפוי לרדת" until its date arrives;
//   - order: most recent first (same-day ties keep the engine's deterministic order,
//     reversed), and the caller's existing row limit is preserved.
//
// getRecentActivity() in aggregates.ts is deliberately NOT changed: it is compared
// against the Web app in the Stage 2 parity suite and must stay byte-compatible.

import type { CategoryConfig } from './categoryConfig.ts';
import { compareCashflowEvents, generateCashflowEvents, type CashflowEvent } from './cashflow.ts';
import { cashflowDateOnly, monthStartOf } from './dates.ts';
import type { RawItem } from './raw.ts';

/**
 * How far back the engine is asked to generate so the row limit can be filled.
 * Implementation detail only — it is not a displayed "history period".
 */
export const RECENT_ACTIVITY_LOOKBACK_MONTHS = 3;

export type RecentActivityEvent = CashflowEvent;

export function getRecentCashflowActivity(
  items: readonly RawItem[],
  now: Date,
  categoryConfig: CategoryConfig,
  count: number,
): RecentActivityEvent[] {
  const n = count > 0 ? count : 5;
  const todayZero = cashflowDateOnly(now);
  const rangeStart = new Date(todayZero.getFullYear(), todayZero.getMonth() - RECENT_ACTIVITY_LOOKBACK_MONTHS, 1);
  const start = monthStartOf(rangeStart);
  const monthsCount = (todayZero.getFullYear() - start.getFullYear()) * 12 + (todayZero.getMonth() - start.getMonth()) + 1;

  const past = generateCashflowEvents(items, start, monthsCount, categoryConfig).filter((ev) => cashflowDateOnly(ev.date) <= todayZero);
  past.sort(compareCashflowEvents);
  past.reverse(); // most recent first; same-day ties keep the engine order, reversed
  return past.slice(0, n);
}
