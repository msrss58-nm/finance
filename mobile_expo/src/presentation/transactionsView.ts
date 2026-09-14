// Categories list + category page (transactions) view models (pure) — app.js
// renderCategoriesScreenFromRealData(), renderTransactionsScreenFromRealData(),
// renderCategoryFilterIndicator() and mapItemToHomeTxRow(). Figures come from
// the Stage 2 aggregates; nothing is recalculated here.

import { getCategoryMonthlyTotals, getLoanRemainingBalance, getVariableItemRemainingBalance } from '../domain/aggregates.ts';
import type { CategoryConfig } from '../domain/categoryConfig.ts';
import { categoryBaseType, categoryLabel, isBuiltInCategoryKey, translateBaseType } from '../domain/categoryWrites.ts';
import { parseDatesAndGetLeft } from '../domain/dates.ts';
import { isPlainObject, type RawItem } from '../domain/raw.ts';
import { isBuiltinCreditCardSettlement, resolveEffectiveDay, resolveFixedIsBimonthly } from '../domain/resolvers.ts';
import type { FinanceSnapshot } from '../state/financeController.ts';
import { formatAmount, formatDate } from './format.ts';

/** app.js HOME_ITEM_ICON_BY_TYPE. */
export const ITEM_ICON_BY_TYPE: Readonly<Record<string, string>> = {
  income: '💰',
  fixed: '🏡',
  variable: '🛒',
  loan: '🏦',
  dated: '📅',
  cashWithdrawal: '🏧',
};

export type TxRowView = {
  readonly key: string;
  /** The stored id (number or legacy string); null when the item has none. */
  readonly id: unknown;
  readonly icon: string;
  readonly title: string;
  readonly dateText: string;
  readonly amountText: string;
  readonly tone: 'income' | 'expense';
  readonly isArchived: boolean;
  readonly installment: readonly string[];
  readonly note: string | null;
  readonly editable: boolean;
};

const safeItemId = (item: RawItem): number => (typeof item.id === 'number' && isFinite(item.id) ? item.id : 0);

/** app.js mapItemToHomeTxRow(). */
export function txRowView(item: RawItem, categoryConfig: CategoryConfig, now: Date, index: number): TxRowView {
  const startDate = item.start ? new Date(item.start as string) : null;
  let dateText = startDate && !isNaN(startDate.getTime()) ? formatDate(startDate) : '-';
  if (dateText === '-' && (item.type === 'income' || item.type === 'fixed')) {
    const day = resolveEffectiveDay(item, categoryConfig);
    if (item.type === 'income') dateText = 'נכנס ב-' + day + ' לחודש';
    else dateText = 'יורד ב-' + day + (resolveFixedIsBimonthly(item) ? ' (דו-חודשי)' : item.period === 'שנתי' ? ' (שנתי)' : ' לחודש');
  }
  const amountNum = typeof item.amount === 'number' && !isNaN(item.amount) ? item.amount : 0;
  const installment: string[] = [];
  if (item.type === 'loan' || item.type === 'variable') {
    const totalN = parseInt(item.total as string, 10);
    if (totalN && totalN > 0) {
      const day = item.type === 'loan' ? item.day : resolveEffectiveDay(item, categoryConfig);
      const dt = parseDatesAndGetLeft(item.start, item.total, day, now);
      let paid = totalN - dt.left;
      if (paid < 0) paid = 0;
      if (paid > totalN) paid = totalN;
      const balance = item.type === 'loan' ? getLoanRemainingBalance(item, now).total : getVariableItemRemainingBalance(item, categoryConfig, now).total;
      installment.push('תשלום ' + paid + '/' + totalN, 'יתרה ' + formatAmount(balance));
    }
  }
  const note = isBuiltinCreditCardSettlement(item) && typeof item.notes === 'string' && item.notes ? item.notes : null;
  return {
    key: String(item.id ?? 'noid') + ':' + index,
    id: item.id ?? null,
    icon: ITEM_ICON_BY_TYPE[item.type as string] ?? '💳',
    title: typeof item.title === 'string' ? item.title : '',
    dateText,
    amountText: item.type === 'income' ? formatAmount(amountNum) : formatAmount(-amountNum),
    tone: item.type === 'income' ? 'income' : 'expense',
    isArchived: !!item.isArchived,
    installment,
    note,
    editable: !item.isArchived && item.id !== undefined && item.id !== null,
  };
}

/** The category key an item is filed under (app.js: displayCategory, else type; unknown -> type). */
export function resolvedCategoryKey(item: RawItem, categoryConfig: CategoryConfig): string {
  let cKey = ((item && item.displayCategory) || (item && item.type)) as string;
  if (!categoryConfig[cKey]) cKey = item.type as string;
  return cKey;
}

export type TransactionsView = {
  readonly categoryKey: string | null;
  /** false when the category was deleted meanwhile (the page then shows nothing but a way back). */
  readonly exists: boolean;
  readonly title: string;
  readonly baseTypeText: string;
  readonly monthTotalText: string | null;
  readonly canAdd: boolean;
  readonly canDelete: boolean;
  readonly rows: readonly TxRowView[];
  readonly activeCount: number;
  readonly archivedCount: number;
};

const ADDABLE = ['income', 'fixed', 'variable', 'loan', 'dated'];

export function buildTransactionsView(s: FinanceSnapshot, categoryKey: string | null, archived: boolean): TransactionsView {
  const { items, categoryConfig } = s.data;
  const exists = categoryKey === null || categoryConfig[categoryKey] !== undefined;
  const inCategory = items.filter(
    (it) => isPlainObject(it) && (categoryKey === null || (exists && resolvedCategoryKey(it, categoryConfig) === categoryKey)),
  );
  const rows = inCategory
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !!it.isArchived === archived)
    .sort((a, b) => safeItemId(b.it) - safeItemId(a.it))
    .map(({ it, i }) => txRowView(it, categoryConfig, s.now, i));
  const baseType = categoryKey === null ? undefined : categoryBaseType(categoryConfig, categoryKey);
  return {
    categoryKey,
    exists,
    title: categoryKey === null ? 'כל התנועות' : categoryLabel(categoryConfig, categoryKey),
    baseTypeText: translateBaseType(baseType) || (baseType === 'loan' ? 'הלוואה' : ''),
    monthTotalText:
      categoryKey !== null && exists ? 'סה"כ החודש: ' + formatAmount(getCategoryMonthlyTotals(items, categoryConfig, s.now)[categoryKey] || 0) : null,
    canAdd: categoryKey !== null && exists && typeof baseType === 'string' && ADDABLE.includes(baseType),
    canDelete: categoryKey !== null && exists && !isBuiltInCategoryKey(categoryKey),
    rows,
    activeCount: inCategory.filter((it) => !it.isArchived).length,
    archivedCount: inCategory.filter((it) => !!it.isArchived).length,
  };
}

export type CategoryListRow = { readonly key: string; readonly label: string; readonly baseTypeText: string; readonly activeCount: number; readonly archivedCount: number };

/** Every category in stored (insertion) order, with its item counts — no sorting invented. */
export function buildCategoryList(s: FinanceSnapshot): { readonly rows: readonly CategoryListRow[]; readonly totalActive: number; readonly totalArchived: number } {
  const { items, categoryConfig } = s.data;
  const counts = new Map<string, { active: number; archived: number }>();
  let totalActive = 0;
  let totalArchived = 0;
  for (const it of items) {
    if (!isPlainObject(it)) continue;
    const key = resolvedCategoryKey(it, categoryConfig);
    const c = counts.get(key) ?? { active: 0, archived: 0 };
    if (it.isArchived) {
      c.archived++;
      totalArchived++;
    } else {
      c.active++;
      totalActive++;
    }
    counts.set(key, c);
  }
  const rows = Object.keys(categoryConfig).map((key) => {
    const bt = categoryBaseType(categoryConfig, key);
    return {
      key,
      label: categoryLabel(categoryConfig, key),
      baseTypeText: translateBaseType(bt) || (bt === 'loan' ? 'הלוואה' : ''),
      activeCount: counts.get(key)?.active ?? 0,
      archivedCount: counts.get(key)?.archived ?? 0,
    };
  });
  return { rows, totalActive, totalArchived };
}
