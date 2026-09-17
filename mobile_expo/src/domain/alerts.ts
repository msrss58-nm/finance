// In-app alerts ("התראות בתוך האפליקציה") — app.js computeHomeNotifications(),
// ported verbatim. Approved decision C: alerts are for exceptional /
// immediate-attention items; they are NOT the list of upcoming charges.
//
// Each alert additionally carries the item id/type and the date it refers to
// (display fields unchanged), so "מה צפוי לרדת" can suppress duplicates
// deterministically.

import type { CategoryConfig } from './categoryConfig.ts';
import { compareCashflowEvents, generateCashflowEvents } from './cashflow.ts';
import { cashflowDateKey, cashflowDateOnly, monthStartOf } from './dates.ts';
import type { RawItem } from './raw.ts';
import { resolveEffectiveDay } from './resolvers.ts';
import type { NotificationFlags } from './settings.ts';

/**
 * APPROVED 16/09/2026: a future income raises an alert while it is within
 * today < income date <= today + 14 calendar days. Once its date arrives it stops being
 * a future alert and becomes eligible for "פעילות אחרונה" instead.
 */
export const INCOME_ALERT_WINDOW_DAYS = 14;

/** 'lastPayment' / 'obligationEndsToday' come only from obligationLifecycle.ts (mobile-only, merged for Home). */
export type InAppAlertKind = 'upcomingPayment' | 'upcomingIncome' | 'completedObligation' | 'lastPayment' | 'obligationEndsToday';

export type InAppAlert = {
  readonly kind: InAppAlertKind;
  readonly title: string;
  readonly detail: string;
  /** The item's raw amount (null for a completed-obligation alert). */
  readonly amount: unknown;
  readonly itemId: unknown;
  readonly itemType: string | null;
  /** The calendar day the alert refers to (tomorrow); null when not date-specific. */
  readonly date: Date | null;
};

export type InAppAlertInput = {
  readonly items: readonly RawItem[];
  readonly settings: { readonly notifications?: Partial<NotificationFlags> | null } | null;
  readonly now: Date;
  readonly categoryConfig: CategoryConfig;
  /** Titles archived by this run's auto-archive sweep (not every archived item ever). */
  readonly lastAutoArchivedTitles: readonly string[];
};

export function computeInAppAlerts(input: InAppAlertInput): InAppAlert[] {
  const { items, settings, now, categoryConfig, lastAutoArchivedTitles } = input;
  const notes: InAppAlert[] = [];
  if (!settings || !settings.notifications) return notes;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowDay = tomorrow.getDate();

  if (settings.notifications.upcomingPayment) {
    for (const it of items) {
      if (!it || it.isArchived) continue;
      if (it.type !== 'fixed' && it.type !== 'variable' && it.type !== 'loan') continue;
      if (resolveEffectiveDay(it, categoryConfig) === tomorrowDay) {
        notes.push({
          kind: 'upcomingPayment',
          title: 'תשלום צפוי מחר',
          detail: ((it.title as string) || '') as string,
          amount: it.amount,
          itemId: it.id,
          itemType: it.type,
          date: tomorrow,
        });
      }
    }
  }
  if (settings.notifications.upcomingIncome) {
    // Real income cash-flow events only, strictly after today through today + 14,
    // nearest first, one alert per (item, date).
    const todayZero = cashflowDateOnly(now);
    const windowEnd = new Date(todayZero.getFullYear(), todayZero.getMonth(), todayZero.getDate() + INCOME_ALERT_WINDOW_DAYS);
    const rangeStart = monthStartOf(todayZero);
    const monthsCount = (windowEnd.getFullYear() - rangeStart.getFullYear()) * 12 + (windowEnd.getMonth() - rangeStart.getMonth()) + 1;
    const seen = new Set<string>();
    const incomeEvents = generateCashflowEvents(items, rangeStart, monthsCount, categoryConfig)
      .filter((ev) => {
        const d = cashflowDateOnly(ev.date);
        return ev.type === 'income' && d > todayZero && d <= windowEnd;
      })
      .sort(compareCashflowEvents);
    for (const ev of incomeEvents) {
      const dateZero = cashflowDateOnly(ev.date);
      const key = String(ev.itemId) + '|' + cashflowDateKey(dateZero);
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({
        kind: 'upcomingIncome',
        title: dateZero.getTime() === tomorrow.getTime() ? 'הכנסה צפויה מחר' : 'הכנסה צפויה',
        detail: typeof ev.title === 'string' ? ev.title : String(ev.title ?? ''),
        amount: ev.amount,
        itemId: ev.itemId,
        itemType: 'income',
        date: dateZero,
      });
    }
  }
  if (settings.notifications.completedObligation && lastAutoArchivedTitles.length) {
    for (const title of lastAutoArchivedTitles) {
      notes.push({ kind: 'completedObligation', title: 'התחייבות הסתיימה', detail: title, amount: null, itemId: null, itemType: null, date: null });
    }
  }
  return notes;
}
