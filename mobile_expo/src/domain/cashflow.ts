// The unified cash-flow engine — app.js generateCashflowEvents(), ported
// verbatim. Single source of truth for every balance/forecast/outflow figure.
//
// Event contract: { date, amount (signed: + in, - out), itemId, type, title }.
// Rules (all from app.js, all preserved):
//   income          one event per month on the effective (clamped) day
//   fixed           bank only (credit is settled by the card settlement);
//                   yearly -> amount/12 every month; bimonthly -> full amount
//                   only in months matching the start month's parity
//   loan            none when paid via payroll; otherwise one event per active
//                   billing month (getBillingRange / isBillingActiveInMonth)
//   variable        where==='bank' only; 'credit' and legacy/missing where are
//                   tracking-only (never defaulted to bank)
//   dated           built-in settlement always; other dated only when not credit
//   cashWithdrawal  one-time event on its own date. A BALANCE movement — it is
//                   deliberately NOT an expense (approved decision A); outflow
//                   aggregates separate it (see homeTotals.ts / forecast.ts).

import type { CategoryConfig } from './categoryConfig.ts';
import { getBillingRange, getClampedBillingDate, isBillingActiveInMonth, parseLocalDateStr } from './dates.ts';
import type { RawItem } from './raw.ts';
import {
  isBimonthlyActiveMonth,
  isBuiltinCreditCardSettlement,
  resolveEffectiveDay,
  resolveEffectiveWhere,
  resolveFixedBimonthlyStartMonth,
  resolveFixedIsBimonthly,
  resolveLoanSource,
  resolveVariablePaymentMethod,
} from './resolvers.ts';

export type CashflowEvent = {
  readonly date: Date;
  readonly amount: number;
  readonly itemId: unknown;
  readonly type: string;
  readonly title: unknown;
};

/** Internal generation horizon. NOT the Forecast screen period (that is 5th→4th, see forecast.ts). */
export const CASHFLOW_HORIZON_MONTHS = 6;

export const CASHFLOW_TYPE_ORDER: Readonly<Record<string, number>> = {
  income: 0,
  fixed: 1,
  loan: 2,
  variable: 3,
  dated: 4,
  cashWithdrawal: 5,
};

/** Same-day display order only; never affects any balance. */
export function compareCashflowEvents(a: CashflowEvent, b: CashflowEvent): number {
  const dCompare = a.date.getTime() - b.date.getTime();
  if (dCompare !== 0) return dCompare;
  const ta = CASHFLOW_TYPE_ORDER[a.type] !== undefined ? (CASHFLOW_TYPE_ORDER[a.type] as number) : 99;
  const tb = CASHFLOW_TYPE_ORDER[b.type] !== undefined ? (CASHFLOW_TYPE_ORDER[b.type] as number) : 99;
  if (ta !== tb) return ta - tb;
  return ((a.itemId as number) || 0) - ((b.itemId as number) || 0);
}

export function generateCashflowEvents(
  items: readonly RawItem[],
  rangeStartMonth: Date,
  monthsCount: number | undefined,
  categoryConfig: CategoryConfig,
): CashflowEvent[] {
  const months = typeof monthsCount === 'number' ? monthsCount : CASHFLOW_HORIZON_MONTHS;
  const horizonStart = new Date(rangeStartMonth.getFullYear(), rangeStartMonth.getMonth(), 1);
  const horizonEnd = new Date(rangeStartMonth.getFullYear(), rangeStartMonth.getMonth() + months, 0);
  const events: CashflowEvent[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as RawItem;
    if (item.isArchived) continue;

    if (item.type === 'income') {
      for (let mi = 0; mi < months; mi++) {
        const di = getClampedBillingDate(horizonStart.getFullYear(), horizonStart.getMonth() + mi, resolveEffectiveDay(item, categoryConfig));
        events.push({ date: di, amount: item.amount as number, itemId: item.id, type: 'income', title: item.title });
      }
    } else if (item.type === 'fixed') {
      if (resolveEffectiveWhere(item) !== 'credit') {
        const isBimonthlyFixed = resolveFixedIsBimonthly(item);
        const bimonthlyStart = isBimonthlyFixed ? resolveFixedBimonthlyStartMonth(item) : null;
        const mAmount = isBimonthlyFixed
          ? (item.amount as number)
          : item.period === 'שנתי'
            ? (item.amount as number) / 12
            : (item.amount as number);
        for (let mf = 0; mf < months; mf++) {
          const probeMonth = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + mf, 1);
          if (isBimonthlyFixed && !isBimonthlyActiveMonth(probeMonth.getMonth() + 1, bimonthlyStart as number)) continue;
          const df = getClampedBillingDate(probeMonth.getFullYear(), probeMonth.getMonth(), resolveEffectiveDay(item, categoryConfig));
          events.push({ date: df, amount: -mAmount, itemId: item.id, type: 'fixed', title: item.title });
        }
      }
    } else if (item.type === 'loan') {
      if (resolveLoanSource(item) !== 'payroll') {
        const range = getBillingRange(item.start, item.total, resolveEffectiveDay(item, categoryConfig));
        if (range) {
          for (let ml = 0; ml < months; ml++) {
            const probe = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + ml, 1);
            if (isBillingActiveInMonth(range, probe.getFullYear(), probe.getMonth())) {
              const dl = getClampedBillingDate(probe.getFullYear(), probe.getMonth(), range.bDay);
              events.push({ date: dl, amount: -(item.amount as number), itemId: item.id, type: 'loan', title: item.title });
            }
          }
        }
      }
    } else if (item.type === 'variable') {
      if (resolveVariablePaymentMethod(item) === 'bank') {
        const rangeVar = getBillingRange(item.start, item.total, resolveEffectiveDay(item, categoryConfig));
        if (rangeVar) {
          for (let mv = 0; mv < months; mv++) {
            const probeVar = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + mv, 1);
            if (isBillingActiveInMonth(rangeVar, probeVar.getFullYear(), probeVar.getMonth())) {
              const dv = getClampedBillingDate(probeVar.getFullYear(), probeVar.getMonth(), rangeVar.bDay);
              events.push({ date: dv, amount: -(item.amount as number), itemId: item.id, type: 'variable', title: item.title });
            }
          }
        }
      }
    } else if (item.type === 'dated') {
      if (isBuiltinCreditCardSettlement(item) || resolveEffectiveWhere(item) !== 'credit') {
        const dd = item.start ? parseLocalDateStr(item.start) : null;
        if (dd && dd >= horizonStart && dd <= horizonEnd) {
          events.push({ date: dd, amount: -(item.amount as number), itemId: item.id, type: 'dated', title: item.title });
        }
      }
    } else if (item.type === 'cashWithdrawal') {
      const dw = item.start ? parseLocalDateStr(item.start) : null;
      if (dw && dw >= horizonStart && dw <= horizonEnd) {
        events.push({ date: dw, amount: -(item.amount as number), itemId: item.id, type: 'cashWithdrawal', title: item.title });
      }
    }
    // any unrecognized type: no event.
  }

  events.sort(compareCashflowEvents);
  return events;
}

/** True for the event types that are expenses. A cash withdrawal is a balance movement, not an expense. */
export function isExpenseEvent(ev: CashflowEvent): boolean {
  return ev.amount < 0 && ev.type !== 'cashWithdrawal';
}
