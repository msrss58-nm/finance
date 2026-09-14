// "מה צפוי לרדת" — approved decision B (replaces the old "מה דורש תשומת לב").
//
// Business meaning: every expected outgoing CHARGE in the next 10 calendar
// days, nearest first. Not an alert list. Rules:
//   - Source: the unified cash-flow engine only (no second calculation), so
//     only real bank outflows appear: credit-paid fixed/variable/dated items and
//     payroll loans never generate a bank event and therefore never appear.
//   - Window: strictly after today through today + 10 (10 calendar days).
//     Today's own events are already inside "יתרה צפויה להיום" (the day walk
//     runs through today), consistent with the engine's "next event" rule.
//   - A cash withdrawal is NOT a charge (approved decision A: not an expense),
//     so it is excluded.
//   - Anything already surfaced by the in-app alerts is not repeated here:
//     an upcomingPayment alert suppresses the matching (type, itemId, date).
//   - Deterministic: sorted by compareCashflowEvents; duplicate keys collapse.

import type { InAppAlert } from './alerts.ts';
import type { CategoryConfig } from './categoryConfig.ts';
import { compareCashflowEvents, generateCashflowEvents, isExpenseEvent } from './cashflow.ts';
import { cashflowDateKey, cashflowDateOnly, monthStartOf } from './dates.ts';
import type { RawItem } from './raw.ts';

export const UPCOMING_CHARGES_WINDOW_DAYS = 10;

export type UpcomingCharge = {
  readonly date: Date;
  readonly dateKey: string;
  /** Positive amount expected to leave the bank. */
  readonly amount: number;
  readonly itemId: unknown;
  readonly type: string;
  readonly title: unknown;
};

export type UpcomingChargesInput = {
  readonly items: readonly RawItem[];
  readonly now: Date;
  readonly categoryConfig: CategoryConfig;
  /** The alerts actually surfaced to the user (computeInAppAlerts output). */
  readonly alerts: readonly InAppAlert[];
  readonly windowDays?: number;
};

const chargeKey = (type: unknown, itemId: unknown, dateKey: string): string => `${String(type)}|${String(itemId)}|${dateKey}`;

export function getUpcomingCharges(input: UpcomingChargesInput): UpcomingCharge[] {
  const windowDays = input.windowDays ?? UPCOMING_CHARGES_WINDOW_DAYS;
  const todayZero = cashflowDateOnly(input.now);
  const windowEnd = new Date(todayZero.getFullYear(), todayZero.getMonth(), todayZero.getDate() + windowDays);
  const rangeStart = monthStartOf(todayZero);
  const monthsCount = (windowEnd.getFullYear() - rangeStart.getFullYear()) * 12 + (windowEnd.getMonth() - rangeStart.getMonth()) + 1;

  const suppressed = new Set<string>();
  for (const alert of input.alerts) {
    if (alert.kind === 'upcomingPayment' && alert.date !== null) {
      suppressed.add(chargeKey(alert.itemType, alert.itemId, cashflowDateKey(alert.date)));
    }
  }

  const events = generateCashflowEvents(input.items, rangeStart, monthsCount, input.categoryConfig)
    .filter((ev) => {
      const d = cashflowDateOnly(ev.date);
      return isExpenseEvent(ev) && d > todayZero && d <= windowEnd;
    })
    .sort(compareCashflowEvents);

  const seen = new Set<string>();
  const result: UpcomingCharge[] = [];
  for (const ev of events) {
    const dateKey = cashflowDateKey(ev.date);
    const key = chargeKey(ev.type, ev.itemId, dateKey);
    if (suppressed.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push({ date: cashflowDateOnly(ev.date), dateKey, amount: -ev.amount, itemId: ev.itemId, type: ev.type, title: ev.title });
  }
  return result;
}
