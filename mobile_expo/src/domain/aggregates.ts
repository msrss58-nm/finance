// Home / Categories / Loans aggregates — ported verbatim from app.js.
//
// LEGACY BEHAVIOR PRESERVED ON PURPOSE (approved decision E):
//   - getMonthSnapshot / getCategoryMonthlyTotals / getDatedMonthOverMonthChange
//     parse 'dated' start strings with `new Date(str)` (UTC midnight), unlike the
//     unified engine's local parsing. Same inconsistency as the Web app.
//   - getMonthSnapshot counts a not-yet-started loan (left === total > 0) in the
//     current month's expenses — the known future-loan timing issue.
// A cash withdrawal never appears in any of these expense aggregates (its type
// is matched by none of their branches), matching approved decision A.

import type { CategoryConfig } from './categoryConfig.ts';
import { getBillingRange, parseDatesAndGetLeft, todayStr } from './dates.ts';
import type { RawItem } from './raw.ts';
import {
  getFixedItemMonthlyFigure,
  isBuiltinCreditCardSettlement,
  resolveEffectiveDay,
  resolveEffectiveWhere,
  resolveLoanSource,
} from './resolvers.ts';

const amountOf = (item: RawItem): number => item.amount as number;

export function getFixedCreditCardTotals(items: readonly RawItem[], now: Date): number {
  let total = 0;
  for (const it of items) {
    if (it.type === 'fixed' && !it.isArchived && it.where === 'credit') total += getFixedItemMonthlyFigure(it, now);
  }
  return total;
}

export function getFixedBankVsCreditSplit(items: readonly RawItem[], now: Date): { bank: number; credit: number } {
  let bank = 0;
  let credit = 0;
  for (const it of items) {
    if (it.type === 'fixed' && !it.isArchived) {
      const mAmount = getFixedItemMonthlyFigure(it, now);
      if (it.where === 'credit') credit += mAmount;
      else bank += mAmount;
    }
  }
  return { bank, credit };
}

export function getLoanBankVsPayrollSplit(items: readonly RawItem[], today: Date): { bank: number; payroll: number } {
  let bank = 0;
  let payroll = 0;
  for (const it of items) {
    if (it.type === 'loan' && !it.isArchived) {
      const dt = parseDatesAndGetLeft(it.start, it.total, it.day, today);
      if (dt.left > 0) {
        if (resolveLoanSource(it) === 'payroll') payroll += amountOf(it);
        else bank += amountOf(it);
      }
    }
  }
  return { bank, payroll };
}

export function getTotalFixedCommitments(items: readonly RawItem[], now: Date): number {
  let total = 0;
  for (const it of items) {
    if (it.type === 'fixed' && !it.isArchived) total += getFixedItemMonthlyFigure(it, now);
  }
  return total;
}

/** app.js getCategoryMonthlyTotals(). */
export function getCategoryMonthlyTotals(items: readonly RawItem[], categoryConfig: CategoryConfig, now: Date): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const key in categoryConfig) totals[key] = 0;
  for (const item of items) {
    if (item.isArchived) continue;
    let cKey = (item.displayCategory || item.type) as string;
    if (!categoryConfig[cKey]) cKey = item.type as string;
    if (!(cKey in totals)) totals[cKey] = 0;

    if (item.type === 'income') {
      totals[cKey] = (totals[cKey] as number) + amountOf(item);
    } else if (item.type === 'fixed') {
      totals[cKey] = (totals[cKey] as number) + getFixedItemMonthlyFigure(item, now);
    } else if (item.type === 'variable') {
      const dtVar = parseDatesAndGetLeft(item.start, item.total, resolveEffectiveDay(item, categoryConfig), now);
      if (dtVar.left > 0) totals[cKey] = (totals[cKey] as number) + amountOf(item);
    } else if (item.type === 'loan') {
      const dtLoan = parseDatesAndGetLeft(item.start, item.total, item.day, now);
      if (dtLoan.left > 0) totals[cKey] = (totals[cKey] as number) + amountOf(item);
    } else if (item.type === 'dated') {
      if (item.start) {
        const itemDate = new Date(item.start as string); // LEGACY UTC parse — preserved
        const monthDiff = (itemDate.getFullYear() - now.getFullYear()) * 12 + (itemDate.getMonth() - now.getMonth());
        if (monthDiff === 0 || monthDiff === 1) totals[cKey] = (totals[cKey] as number) + amountOf(item);
      }
    }
  }
  return totals;
}

/** app.js getMonthSnapshot() — legacy calendar-month snapshot (income tile). */
export function getMonthSnapshot(items: readonly RawItem[], now: Date): { income: number; expenses: number; balance: number } {
  let sumInc = 0;
  let monthlyExpenses = 0;
  for (const item of items) {
    if (item.isArchived) continue;
    if (item.type === 'income') {
      sumInc += amountOf(item);
    } else if (item.type === 'fixed') {
      const mAmount = getFixedItemMonthlyFigure(item, now);
      if (item.where !== 'credit') monthlyExpenses += mAmount;
    } else if (item.type === 'variable') {
      // tracking/display only — never part of this snapshot (Web comment preserved in spirit)
    } else if (item.type === 'loan') {
      const dt = parseDatesAndGetLeft(item.start, item.total, item.day, now);
      if (dt.left > 0 && resolveLoanSource(item) !== 'payroll') monthlyExpenses += amountOf(item); // LEGACY future-loan timing — preserved
    } else if (item.type === 'dated') {
      if (item.start && (isBuiltinCreditCardSettlement(item) || resolveEffectiveWhere(item) !== 'credit')) {
        const itemDate = new Date(item.start as string); // LEGACY UTC parse — preserved
        if (itemDate.getFullYear() === now.getFullYear() && itemDate.getMonth() === now.getMonth()) monthlyExpenses += amountOf(item);
      }
    }
  }
  return { income: sumInc, expenses: monthlyExpenses, balance: sumInc - monthlyExpenses };
}

export function getRecentActivity(items: readonly RawItem[], count: number): RawItem[] {
  const n = count || 5;
  const active: RawItem[] = [];
  for (const it of items) if (!it.isArchived) active.push(it);
  return active.slice(-n).reverse();
}

export function getLoansRemainingSummary(items: readonly RawItem[], today: Date): { totalRemaining: number; loanCount: number } {
  let totalRemaining = 0;
  let loanCount = 0;
  for (const it of items) {
    if (it.type === 'loan' && !it.isArchived) {
      const dt = parseDatesAndGetLeft(it.start, it.total, it.day, today);
      totalRemaining += amountOf(it) * dt.left;
      if (dt.left > 0) loanCount++;
    }
  }
  return { totalRemaining, loanCount };
}

export function getVariableItemRemainingBalance(it: RawItem, categoryConfig: CategoryConfig, today: Date): { total: number; left: number } {
  const dt = parseDatesAndGetLeft(it.start, it.total, resolveEffectiveDay(it, categoryConfig), today);
  return { total: amountOf(it) * dt.left, left: dt.left };
}

export function getVariableRemainingBalance(items: readonly RawItem[], categoryConfig: CategoryConfig, today: Date): number {
  let total = 0;
  for (const it of items) {
    if (it.type === 'variable' && !it.isArchived) total += getVariableItemRemainingBalance(it, categoryConfig, today).total;
  }
  return total;
}

/** app.js getLoanRemainingBalance(): total = amount × left; principal via fixed-payment amortization, capped. */
export function getLoanRemainingBalance(it: RawItem, today: Date): { principal: number; total: number; left: number } {
  const dt = parseDatesAndGetLeft(it.start, it.total, it.day, today);
  const loanTotalRemaining = amountOf(it) * dt.left;
  const n = parseInt(it.total as string, 10);
  if (!n || n <= 0 || dt.left <= 0) return { principal: 0, total: loanTotalRemaining, left: dt.left };
  const originalAmount = typeof it.originalAmount === 'number' && !isNaN(it.originalAmount) ? it.originalAmount : 0;
  let elapsed = n - dt.left;
  if (elapsed < 0) elapsed = 0;
  const annualRatePct = parseFloat(it.interest as string);
  const monthlyRate = isFinite(annualRatePct) && annualRatePct > 0 ? annualRatePct / 100 / 12 : 0;
  let remainingPrincipal: number;
  if (monthlyRate > 0) {
    const growth = Math.pow(1 + monthlyRate, elapsed);
    remainingPrincipal = originalAmount * growth - (amountOf(it) * (growth - 1)) / monthlyRate;
  } else {
    remainingPrincipal = originalAmount - amountOf(it) * elapsed;
  }
  if (remainingPrincipal < 0) remainingPrincipal = 0;
  if (remainingPrincipal > loanTotalRemaining) remainingPrincipal = loanTotalRemaining;
  return { principal: remainingPrincipal, total: loanTotalRemaining, left: dt.left };
}

export function getLoansBalanceSummary(items: readonly RawItem[], today: Date): { principal: number; total: number } {
  let principal = 0;
  let total = 0;
  for (const it of items) {
    if (it.type !== 'loan' || it.isArchived) continue;
    const b = getLoanRemainingBalance(it, today);
    principal += b.principal;
    total += b.total;
  }
  return { principal, total };
}

export type DatedMonthOverMonth = {
  readonly currentMonthLabel: string;
  readonly previousMonthLabel: string;
  readonly currentMonthTotal: number;
  readonly previousMonthTotal: number;
  readonly changeAmount: number;
  readonly changePercent: number | null;
};

export function getDatedMonthOverMonthChange(items: readonly RawItem[], now: Date): DatedMonthOverMonth | null {
  const hasDatedItems = items.some((it) => it.type === 'dated' && !it.isArchived);
  if (!hasDatedItems) return null;
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let currentMonthTotal = 0;
  let previousMonthTotal = 0;
  for (const item of items) {
    if (item.type !== 'dated' || item.isArchived || !item.start) continue;
    const itemDate = new Date(item.start as string); // LEGACY UTC parse — preserved
    if (itemDate.getFullYear() === currentMonthDate.getFullYear() && itemDate.getMonth() === currentMonthDate.getMonth()) {
      currentMonthTotal += amountOf(item);
    } else if (itemDate.getFullYear() === previousMonthDate.getFullYear() && itemDate.getMonth() === previousMonthDate.getMonth()) {
      previousMonthTotal += amountOf(item);
    }
  }
  const changeAmount = currentMonthTotal - previousMonthTotal;
  const changePercent = previousMonthTotal !== 0 ? (changeAmount / previousMonthTotal) * 100 : null;
  return {
    currentMonthLabel: currentMonthDate.toLocaleDateString('he-IL', { month: 'short' }),
    previousMonthLabel: previousMonthDate.toLocaleDateString('he-IL', { month: 'short' }),
    currentMonthTotal,
    previousMonthTotal,
    changeAmount,
    changePercent,
  };
}

/** app.js getAutoArchiveCandidates(): completed loan/variable items whose last billing date is strictly past. */
export function getAutoArchiveCandidates(items: readonly RawItem[], now: Date, categoryConfig: CategoryConfig): RawItem[] {
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates: RawItem[] = [];
  for (const it of items) {
    if (!it || it.isArchived || it.archiveReason) continue;
    if (it.type !== 'loan' && it.type !== 'variable') continue;
    if (!it.start || !it.total) continue;
    const totalNum = parseInt(it.total as string, 10);
    if (!isFinite(totalNum) || totalNum <= 0) continue;
    const effectiveDay = resolveEffectiveDay(it, categoryConfig);
    const range = getBillingRange(it.start, it.total, effectiveDay);
    if (!range || isNaN(range.last.getTime())) continue;
    const dt = parseDatesAndGetLeft(it.start, it.total, effectiveDay, now);
    if (dt.left !== 0) continue;
    if (!(todayZero.getTime() > range.last.getTime())) continue;
    candidates.push(it);
  }
  return candidates;
}

export type AutoArchiveResult = {
  /** New items array; archived entries are new objects (other fields and key order untouched). */
  readonly items: RawItem[];
  readonly archivedCount: number;
  /** Titles for the "התחייבות הסתיימה" in-app alert. */
  readonly archivedTitles: string[];
};

/**
 * The pure half of app.js runAutoArchiveSweep(): sets isArchived/archiveReason/
 * archivedAt on each candidate. Persisting (and the activity-log lines) is the
 * caller's job. Nothing changes when there are no candidates.
 */
export function applyAutoArchive(items: readonly RawItem[], now: Date, categoryConfig: CategoryConfig): AutoArchiveResult {
  const candidates = new Set(getAutoArchiveCandidates(items, now, categoryConfig));
  if (candidates.size === 0) return { items: [...items], archivedCount: 0, archivedTitles: [] };
  const archivedAt = todayStr(now);
  const archivedTitles: string[] = [];
  const next = items.map((it) => {
    if (!candidates.has(it)) return it;
    archivedTitles.push(((it.title as string) || '') as string);
    return { ...it, isArchived: true, archiveReason: 'completed', archivedAt };
  });
  return { items: next, archivedCount: candidates.size, archivedTitles };
}
