// End-of-obligation alerts — APPROVED 17/09/2026. Mobile-only: the Web has no such
// alerts, so computeInAppAlerts() (compared with the Web verbatim) is left untouched and
// these are merged into its result for Home only.
//
// No second installment engine: the lifecycle is exactly the one the product already uses
// for the "תשלום X/N" row, the cash-flow events and the auto-archive sweep —
// getBillingRange() (first/last billing date) + parseDatesAndGetLeft() (payments left),
// on resolveEffectiveDay(). Eligible items are the sweep's: active loan / variable items
// with a start and a positive total. The payment source does not matter here (a payroll
// loan or a credit / tracking-only installment still ends); cash flow is not involved.
//
// Rules (gated by notifications.completedObligation, the existing lifecycle setting):
//   - exactly one payment left and the last billing date is after today
//       → "נשאר תשלום אחד" — the item, "התשלום האחרון ב־D.M", the installment amount;
//   - the last billing date is today → "התחייבות הסתיימה" — "התשלום האחרון היום".
//     From tomorrow the existing sweep archives the item and raises its own
//     "התחייבות הסתיימה" alert, so the two never coexist.
//   - two or more payments left → nothing.
// De-duplication: when "תשלום צפוי מחר" already names the same item for that same date,
// no second alert is added; that alert's detail gains "התשלום האחרון" instead.

import type { InAppAlert } from './alerts.ts';
import type { CategoryConfig } from './categoryConfig.ts';
import { cashflowDateOnly, getBillingRange, parseDatesAndGetLeft } from './dates.ts';
import type { RawItem } from './raw.ts';
import { resolveEffectiveDay, resolveLoanSource } from './resolvers.ts';
import type { NotificationFlags } from './settings.ts';

export const LIFECYCLE_TEXT = {
  lastPaymentTitle: 'נשאר תשלום אחד',
  lastPaymentPrefix: 'התשלום האחרון ב־',
  endsTodayTitle: 'התחייבות הסתיימה',
  endsTodayDetail: 'התשלום האחרון היום',
  payroll: 'דרך תלוש השכר',
  payrollWord: 'תלוש',
  lastMark: 'התשלום האחרון',
} as const;

export type ObligationLifecycleAlert = InAppAlert & { readonly kind: 'lastPayment' | 'obligationEndsToday' };

export type ObligationLifecycleInput = {
  readonly items: readonly RawItem[];
  readonly settings: { readonly notifications?: Partial<NotificationFlags> | null } | null;
  readonly now: Date;
  readonly categoryConfig: CategoryConfig;
};

const dayMonth = (d: Date): string => d.getDate() + '.' + (d.getMonth() + 1);

export function computeObligationLifecycleAlerts(input: ObligationLifecycleInput): ObligationLifecycleAlert[] {
  const { items, settings, now, categoryConfig } = input;
  const result: ObligationLifecycleAlert[] = [];
  if (!settings || !settings.notifications || !settings.notifications.completedObligation) return result;
  const todayZero = cashflowDateOnly(now);
  for (const it of items) {
    if (!it || it.isArchived || it.archiveReason) continue;
    if (it.type !== 'loan' && it.type !== 'variable') continue;
    if (!it.start || !it.total) continue;
    const totalNum = parseInt(it.total as string, 10);
    if (!isFinite(totalNum) || totalNum <= 0) continue;
    const effectiveDay = resolveEffectiveDay(it, categoryConfig);
    const range = getBillingRange(it.start, it.total, effectiveDay);
    if (!range || isNaN(range.last.getTime())) continue;
    const title = typeof it.title === 'string' ? it.title : '';
    const payroll = it.type === 'loan' && resolveLoanSource(it) === 'payroll';
    // Not when the user's own title already says it (e.g. "יורד דרך התלוש").
    const suffix = payroll && !title.includes(LIFECYCLE_TEXT.payrollWord) ? ' · ' + LIFECYCLE_TEXT.payroll : '';
    const last = cashflowDateOnly(range.last);
    if (last.getTime() === todayZero.getTime()) {
      result.push({
        kind: 'obligationEndsToday',
        title: LIFECYCLE_TEXT.endsTodayTitle,
        detail: title + ' · ' + LIFECYCLE_TEXT.endsTodayDetail + suffix,
        amount: null,
        itemId: it.id,
        itemType: it.type,
        date: last,
      });
      continue;
    }
    const left = parseDatesAndGetLeft(it.start, it.total, effectiveDay, now).left;
    if (left === 1 && last > todayZero) {
      result.push({
        kind: 'lastPayment',
        title: LIFECYCLE_TEXT.lastPaymentTitle,
        detail: title + ' · ' + LIFECYCLE_TEXT.lastPaymentPrefix + dayMonth(last) + suffix,
        amount: it.amount,
        itemId: it.id,
        itemType: it.type,
        date: last,
      });
    }
  }
  return result;
}

/**
 * The Home alert list: existing alerts keep their order and content; "נשאר תשלום אחד"
 * alerts follow the payment alerts (before income / completion), and "הסתיימה היום"
 * alerts go last with the existing completion alerts. One alert per obligation.
 */
export function mergeObligationLifecycleAlerts(base: readonly InAppAlert[], lifecycle: readonly ObligationLifecycleAlert[]): InAppAlert[] {
  const sameDay = (a: Date | null, b: Date | null) => a !== null && b !== null && a.getTime() === b.getTime();
  const merged = new Set<ObligationLifecycleAlert>();
  const enriched = base.map((a) => {
    if (a.kind !== 'upcomingPayment') return a;
    const match = lifecycle.find((l) => l.kind === 'lastPayment' && l.itemId === a.itemId && l.itemType === a.itemType && sameDay(l.date, a.date));
    if (!match) return a;
    merged.add(match);
    return { ...a, detail: a.detail + ' · ' + LIFECYCLE_TEXT.lastMark };
  });
  const lastPayments = lifecycle.filter((l) => l.kind === 'lastPayment' && !merged.has(l));
  const endsToday = lifecycle.filter((l) => l.kind === 'obligationEndsToday');
  const paymentCount = enriched.filter((a) => a.kind === 'upcomingPayment').length;
  return [...enriched.slice(0, paymentCount), ...lastPayments, ...enriched.slice(paymentCount), ...endsToday];
}
