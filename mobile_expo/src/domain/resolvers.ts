// Lazy-fallback field resolvers, ported verbatim from app.js. None of them
// mutates the item; a legacy value is interpreted, never rewritten.

import type { CategoryConfig } from './categoryConfig.ts';
import type { RawItem } from './raw.ts';

/** app.js resolveEffectiveDay(): own 1–31 day, else category default, else 1. */
export function resolveEffectiveDay(item: RawItem, categoryConfig: CategoryConfig): number {
  const ownDay = parseInt(item && (item.day as string), 10);
  if (isFinite(ownDay) && ownDay >= 1 && ownDay <= 31) return ownDay;
  const cKey = (item && item.displayCategory) || (item && item.type);
  let cfg = categoryConfig[cKey as string] as Record<string, unknown> | undefined;
  if (!cfg && item) cfg = categoryConfig[item.type as string] as Record<string, unknown> | undefined;
  const defaultDay = cfg ? parseInt(cfg.defaultDayOfMonth as string, 10) : NaN;
  if (isFinite(defaultDay) && defaultDay >= 1 && defaultDay <= 31) return defaultDay;
  return 1;
}

/** app.js resolveEffectiveWhere(): 'credit' only for exactly 'credit'; everything else is bank. */
export function resolveEffectiveWhere(item: RawItem): 'credit' | 'bank' {
  return item && item.where === 'credit' ? 'credit' : 'bank';
}

/** app.js resolveVariablePaymentMethod(): legacy/missing -> null (tracking-only, never defaulted to bank). */
export function resolveVariablePaymentMethod(item: RawItem): 'bank' | 'credit' | null {
  if (item && item.where === 'bank') return 'bank';
  if (item && item.where === 'credit') return 'credit';
  return null;
}

/** The exact payroll sentinel the Web loan form stores. */
export const LOAN_PAYROLL_WHERE = 'דרך תלוש השכר';

/** app.js resolveLoanSource(): payroll only for the exact sentinel; any other value is bank. */
export function resolveLoanSource(item: RawItem): 'payroll' | 'bank' {
  return item && item.where === LOAN_PAYROLL_WHERE ? 'payroll' : 'bank';
}

export function resolveFixedIsBimonthly(item: RawItem): boolean {
  if (!item || item.bimonthly !== true) return false;
  const m = parseInt(item.bimonthlyStartMonth as string, 10);
  return isFinite(m) && m >= 1 && m <= 12;
}

export function resolveFixedBimonthlyStartMonth(item: RawItem): number {
  const m = parseInt(item && (item.bimonthlyStartMonth as string), 10);
  return isFinite(m) && m >= 1 && m <= 12 ? m : 1;
}

export function isBimonthlyActiveMonth(targetMonth1to12: number, startMonth1to12: number): boolean {
  return targetMonth1to12 % 2 === startMonth1to12 % 2;
}

/** app.js getFixedItemMonthlyFigure(): yearly -> amount/12; bimonthly -> full amount in active months only. */
export function getFixedItemMonthlyFigure(item: RawItem, refDate: Date): number {
  if (resolveFixedIsBimonthly(item)) {
    const refMonth1to12 = refDate.getMonth() + 1;
    return isBimonthlyActiveMonth(refMonth1to12, resolveFixedBimonthlyStartMonth(item)) ? (item.amount as number) : 0;
  }
  return item.period === 'שנתי' ? (item.amount as number) / 12 : (item.amount as number);
}

/** app.js isBuiltinCreditCardSettlement(): the built-in 'dated' settlement category, by stable key. */
export function isBuiltinCreditCardSettlement(item: RawItem): boolean {
  return !!(item && item.type === 'dated' && (item.displayCategory || item.type) === 'dated');
}
