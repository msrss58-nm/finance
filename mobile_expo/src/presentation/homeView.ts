// Home screen view model (pure) — app.js renderHomeScreenFromRealData(),
// renderCategoryTileGridHtml(), renderHomeNotificationsFromRealData() and the
// ATM saved list, with the approved Stage 2/3 decisions:
//   - hero = projected balance for today (the Opening Balance engine);
//   - "סך הכול הוצאות" = the expenses still expected in the 5th→4th period
//     (strictly after today, APPROVED 17/09/2026), WITHOUT cash withdrawals;
//     withdrawals are shown as their own figure (correction A);
//   - in-app alerts = exceptional items only (decision C), and "תשלום צפוי מחר"
//     is the real bank debit scheduled for tomorrow, taken from the canonical
//     charge list (APPROVED 18/09/2026);
//   - "מה צפוי לרדת" = outgoing bank charges in the next 10 days, nearest
//     first, no cash withdrawals, nothing already shown as an alert (B).
// "Amount until next income" is deliberately NOT part of this view.

import {
  getCategoryMonthlyTotals,
  getFixedBankVsCreditSplit,
  getLoanBankVsPayrollSplit,
  getLoansBalanceSummary,
  getMonthSnapshot,
  getVariableRemainingBalance,
} from '../domain/aggregates.ts';
import { computeInAppAlerts, type InAppAlert } from '../domain/alerts.ts';
import type { CashflowEvent } from '../domain/cashflow.ts';
import { cashflowDateKey, parseLocalDateStr } from '../domain/dates.ts';
import { getForecastPeriodBounds, getProjectedBalanceToday } from '../domain/forecast.ts';
import { getHomePeriodOutflows, getHomeRemainingExpensesForCurrentPeriod } from '../domain/homeTotals.ts';
import { FF_KEYS } from '../domain/keys.ts';
import { computeObligationLifecycleAlerts, mergeObligationLifecycleAlerts } from '../domain/obligationLifecycle.ts';
import { roundLoanSplitForDisplay } from '../domain/numbers.ts';
import { isPlainObject, type RawItem } from '../domain/raw.ts';
import { getRecentCashflowActivity } from '../domain/recentActivity.ts';
import { getProjectedBalanceOpeningConfig } from '../domain/settings.ts';
import { homeTileDisplayLabel, reconcileTileOrder } from '../domain/tileOrder.ts';
import { getUpcomingCharges } from '../domain/upcomingCharges.ts';
import type { FinanceSnapshot } from '../state/financeController.ts';
import { formatAmount, formatDate, formatDateStr, formatDayMonth, formatSignedAmount, relativeDaysText, toneOf, type Tone } from './format.ts';
import { ITEM_ICON_BY_TYPE, txRowView, type TxRowView } from './transactionsView.ts';

/**
 * Home-only: tiles the user asked not to see there (approved 16/09/2026), matched on the
 * displayed label. Presentation only — the categories, their items, the stored tile order
 * and every total keep counting exactly as before, and no other screen is affected.
 */
const HIDDEN_HOME_TILE_LABELS: ReadonlySet<string> = new Set(['רכישות', 'מנויים']);

/**
 * One "פעילות אחרונה" row (approved 16/09/2026): a cash-flow event that has already
 * occurred. The row keeps the Web Home look — icon, title, the settlement note, no
 * installment lines — but the date and amount come from the EVENT, so a scheduled
 * charge shows the date it was due, not the item's stored start.
 */
function recentEventRow(
  ev: CashflowEvent,
  items: readonly RawItem[],
  categoryConfig: Parameters<typeof txRowView>[1],
  now: Date,
  index: number,
): TxRowView {
  const key = String(ev.itemId ?? 'noid') + ':' + ev.type + ':' + cashflowDateKey(ev.date) + ':' + index;
  const dateText = formatDate(ev.date);
  const amountText = formatAmount(ev.amount);
  const tone: TxRowView['tone'] = ev.amount >= 0 ? 'income' : 'expense';
  const item = items.find((it) => isPlainObject(it) && it.id === ev.itemId);
  if (!item) {
    const title = typeof ev.title === 'string' ? ev.title : String(ev.title ?? '');
    return { key, id: ev.itemId ?? null, icon: ITEM_ICON_BY_TYPE[ev.type] ?? '💳', title, dateText, amountText, tone, isArchived: false, installment: [], note: null, editable: false };
  }
  // Reuse the existing row builder so icon / note / editable / archived stay exactly as before.
  const base = txRowView(item, categoryConfig, now, index);
  return { ...base, key, dateText, amountText, tone, installment: [] };
}

export type HeroView = {
  readonly state: 'unconfigured' | 'future' | 'available';
  readonly amountText: string;
  readonly tone: Tone;
  readonly status: string;
};

export type HomeTile =
  | {
      readonly kind: 'category';
      readonly key: string;
      readonly label: string;
      readonly amountText: string;
      readonly red: boolean;
      readonly breakdown: readonly string[];
      readonly updatedLine: string | null;
    }
  | { readonly kind: 'variableRemaining'; readonly key: 'variable-remaining'; readonly label: string; readonly amountText: string }
  | { readonly kind: 'loanBalance'; readonly key: 'loan-balance'; readonly label: string; readonly amountText: string; readonly view: 'total' | 'principal' };

export type AlertRow = { readonly key: string; readonly title: string; readonly detail: string; readonly amountText: string | null };
export type ChargeRow = { readonly key: string; readonly title: string; readonly dateText: string; readonly whenText: string; readonly amountText: string };
export type WithdrawalRow = { readonly key: string; readonly id: unknown; readonly amountText: string; readonly dateText: string; readonly notes: string };

export type HomeView = {
  readonly hero: HeroView;
  readonly incomeText: string;
  readonly expensesText: string;
  readonly withdrawalsText: string;
  /** The 5th→4th period the expense/withdrawal figures cover, e.g. "5.9–4.10". */
  readonly periodText: string;
  readonly tiles: readonly HomeTile[];
  /** The reconciled category order (for the reorder mode). */
  readonly tileOrder: readonly string[];
  readonly tileOrderLabels: readonly { readonly key: string; readonly label: string }[];
  readonly alerts: readonly AlertRow[];
  readonly upcoming: readonly ChargeRow[];
  readonly recent: readonly TxRowView[];
  readonly withdrawalsThisMonth: readonly WithdrawalRow[];
  readonly corruptBanner: string | null;
};

export const HOME_TEXT = {
  heroLabel: 'יתרה צפויה להיום',
  unconfiguredAmount: 'לא הוגדרה',
  unconfiguredStatus: 'כדי לחשב יתרה יומית יש להגדיר יתרת התחלה פעם אחת.',
  availableStatus: 'מחושב לפי יתרת ההתחלה והתנועות המתוכננות עד היום — אינה יתרת בנק מאומתת.',
  corrupt: 'חלק מהנתונים השמורים במכשיר פגומים. הם לא שונו ולא נמחקו, ושינויים בהם לא יישמרו עד שישוחזר גיבוי תקין (הגדרות ← נתונים).',
} as const;

/** app.js formatCreditSettlementUpdatedLabel(): a plain string split, never a Date. */
export function formatCreditSettlementUpdatedLabel(dateStr: unknown): string {
  const parts = (typeof dateStr === 'string' ? dateStr : '').split('-');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return 'עודכן: —';
  return 'עודכן: ' + parts[2] + '.' + parts[1] + '.' + parts[0];
}

const RED_TILE_KEYS = new Set(['fixed', 'variable', 'loan', 'dated']);

/**
 * The obligation types "תשלום צפוי מחר" covers — unchanged from the Web rule. The credit-card
 * settlement and other dated charges stay out of the alert list; they are shown in "מה צפוי לרדת".
 */
const OBLIGATION_ALERT_TYPES = new Set(['fixed', 'variable', 'loan']);
/** Mirrors the title in domain/alerts.ts, which is parity-locked and must not be edited. */
const UPCOMING_PAYMENT_ALERT_TITLE = 'תשלום צפוי מחר';

export function buildHomeView(s: FinanceSnapshot): HomeView {
  const { data, now } = s;
  const { items, categoryConfig, settings } = data;

  // Hero: the projected balance for today (never a fabricated 0).
  const opening = getProjectedBalanceOpeningConfig(settings);
  const projected = getProjectedBalanceToday(items, now, opening, categoryConfig);
  let hero: HeroView;
  if (!projected.configured) {
    hero = { state: 'unconfigured', amountText: HOME_TEXT.unconfiguredAmount, tone: 'neutral', status: HOME_TEXT.unconfiguredStatus };
  } else if (projected.state === 'future') {
    hero = { state: 'future', amountText: '—', tone: 'neutral', status: 'החישוב יתחיל בתאריך ' + formatDateStr(projected.openingDateStr) + '.' };
  } else {
    hero = { state: 'available', amountText: formatAmount(projected.projectedBalance), tone: toneOf(projected.projectedBalance), status: HOME_TEXT.availableStatus };
  }

  const outflows = getHomePeriodOutflows(items, now, categoryConfig);

  // Category tiles (app.js renderCategoryTileGridHtml()).
  const tileOrder = reconcileTileOrder(data.raw[FF_KEYS.categoryTileOrder] ?? null, categoryConfig);
  const totals = getCategoryMonthlyTotals(items, categoryConfig, now);
  const fixedSplit = getFixedBankVsCreditSplit(items, now);
  const loanSplit = roundLoanSplitForDisplay(getLoanBankVsPayrollSplit(items, now).bank, getLoanBankVsPayrollSplit(items, now).payroll);
  const loanBalance = getLoansBalanceSummary(items, now);
  const tiles: HomeTile[] = [];
  for (const key of tileOrder) {
    const cfg = categoryConfig[key];
    if (!isPlainObject(cfg)) continue;
    const rawTotal = totals[key] || 0;
    if (key !== 'dated' && cfg.baseType === 'dated' && !rawTotal) continue;
    const label = homeTileDisplayLabel(key, categoryConfig);
    if (HIDDEN_HOME_TILE_LABELS.has(label)) continue;
    const red = RED_TILE_KEYS.has(key);
    if (key === 'dated') {
      tiles.push({
        kind: 'category',
        key,
        label,
        amountText: rawTotal ? formatAmount(rawTotal) : 'הזן חיוב',
        red,
        breakdown: [],
        updatedLine: formatCreditSettlementUpdatedLabel(settings.creditCardSettlementUpdatedAt),
      });
    } else if (key === 'fixed') {
      tiles.push({
        kind: 'category',
        key,
        label,
        amountText: formatAmount(rawTotal),
        red,
        breakdown: ['מהבנק: ' + formatAmount(fixedSplit.bank), 'באשראי: ' + formatAmount(fixedSplit.credit)],
        updatedLine: null,
      });
    } else if (key === 'loan') {
      tiles.push({
        kind: 'category',
        key,
        label,
        amountText: formatAmount(loanSplit.total),
        red,
        breakdown: ['מהבנק: ' + formatAmount(loanSplit.bank), 'דרך תלוש השכר: ' + formatAmount(loanSplit.payroll)],
        updatedLine: null,
      });
    } else {
      tiles.push({ kind: 'category', key, label, amountText: formatAmount(rawTotal), red, breakdown: [], updatedLine: null });
    }
    if (key === 'variable') {
      tiles.push({
        kind: 'variableRemaining',
        key: 'variable-remaining',
        label: 'יתרת תשלומים שונים',
        amountText: formatAmount(getVariableRemainingBalance(items, categoryConfig, now)),
      });
    }
    if (key === 'loan') {
      const view = data.loanBalanceView;
      tiles.push({
        kind: 'loanBalance',
        key: 'loan-balance',
        label: 'יתרת הלוואות',
        amountText: formatAmount(view === 'principal' ? loanBalance.principal : loanBalance.total),
        view,
      });
    }
  }

  // In-app alerts (exceptional items), then the charges they must not repeat.
  const alerts = computeInAppAlerts({ items, settings, now, categoryConfig, lastAutoArchivedTitles: s.lastAutoArchivedTitles });
  const charges = getUpcomingCharges({ items, now, categoryConfig, alerts });
  // APPROVED 18/09/2026: "תשלום צפוי מחר" means a real bank debit scheduled for tomorrow, so it is
  // derived from the same canonical charge list rather than from a bare day-of-month match. The
  // engine already decides what actually leaves the bank and when, so this needs no second
  // scheduling rule and `computeInAppAlerts` (Web-parity, decision C) stays untouched. Consequences:
  // credit-paid items and payroll loans no longer raise this alert (they never debit the bank; their
  // lifecycle alerts still cover them), a yearly item alerts with its monthly amount, a bi-monthly
  // item alerts only in a charged month, an item outside its billing range does not alert, and a
  // stored day of 29-31 alerts on the clamped date the charge really falls on.
  const tomorrowKey = cashflowDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const paymentAlerts: InAppAlert[] = settings.notifications.upcomingPayment
    ? charges
        .filter((c) => c.dateKey === tomorrowKey && OBLIGATION_ALERT_TYPES.has(c.type))
        .map((c) => ({
          kind: 'upcomingPayment' as const,
          title: UPCOMING_PAYMENT_ALERT_TITLE,
          detail: typeof c.title === 'string' ? c.title : String(c.title ?? ''),
          amount: c.amount,
          itemId: c.itemId,
          itemType: c.type,
          date: c.date,
        }))
    : [];
  // APPROVED 17/09/2026: routine recurring income is not an alert. Every income item is a monthly
  // recurring event in the engine (there is no one-time / changed / missing income concept), so no
  // "הכנסה צפויה" alert reaches Home; income stays in Forecast and every calculation.
  const actionableAlerts = [...paymentAlerts, ...alerts.filter((a) => a.kind !== 'upcomingIncome' && a.kind !== 'upcomingPayment')];
  // End-of-obligation alerts (APPROVED 17/09/2026), merged for Home only — one alert per obligation.
  const homeAlerts = mergeObligationLifecycleAlerts(actionableAlerts, computeObligationLifecycleAlerts({ items, settings, now, categoryConfig }));
  const alertRows: AlertRow[] = homeAlerts.map((a, i) => {
    const n = typeof a.amount === 'number' ? a.amount : Number(a.amount);
    return { key: a.kind + ':' + i, title: a.title, detail: a.detail, amountText: a.amount != null && isFinite(n) ? formatAmount(n) : null };
  });
  const upcoming: ChargeRow[] = charges.map((c) => ({
    key: c.type + '|' + String(c.itemId) + '|' + c.dateKey,
    title: typeof c.title === 'string' ? c.title : String(c.title ?? ''),
    dateText: formatDate(c.date),
    whenText: relativeDaysText(c.date, now),
    amountText: formatSignedAmount(-c.amount),
  }));

  // Cash withdrawals dated in the current calendar month (app.js getHomeAtmSavedWithdrawalsThisMonth()).
  const y = now.getFullYear();
  const m = now.getMonth();
  const withdrawals = items
    .filter((it) => isPlainObject(it) && it.type === 'cashWithdrawal' && !it.isArchived && it.start)
    .filter((it) => {
      const d = parseLocalDateStr(it.start);
      return !!d && d.getFullYear() === y && d.getMonth() === m;
    })
    .sort((a, b) => (parseLocalDateStr(a.start) as Date).getTime() - (parseLocalDateStr(b.start) as Date).getTime())
    .map((it, i) => ({
      key: String(it.id) + ':' + i,
      id: it.id,
      amountText: formatAmount(typeof it.amount === 'number' ? it.amount : 0),
      // app.js renderHomeAtmSavedList() shows the stored 'YYYY-MM-DD' string as-is.
      dateText: typeof it.start === 'string' ? it.start : '',
      notes: typeof it.notes === 'string' ? it.notes : '',
    }));

  const corrupt = data.corruptKeys.some((k) => k === FF_KEYS.data || k === FF_KEYS.categoryConfig || k === FF_KEYS.settings);

  const bounds = getForecastPeriodBounds(now);

  return {
    hero,
    incomeText: formatAmount(getMonthSnapshot(items, now).income),
    expensesText: formatAmount(getHomeRemainingExpensesForCurrentPeriod(items, now, categoryConfig)),
    withdrawalsText: formatAmount(outflows.withdrawals),
    periodText: formatDayMonth(bounds.periodStart) + '–' + formatDayMonth(bounds.periodEnd),
    tiles,
    tileOrder,
    tileOrderLabels: tileOrder.map((key) => ({ key, label: homeTileDisplayLabel(key, categoryConfig) })).filter((t) => !HIDDEN_HOME_TILE_LABELS.has(t.label)),
    alerts: alertRows,
    upcoming,
    recent: getRecentCashflowActivity(items, now, categoryConfig, 4).map((ev, i) => recentEventRow(ev, items, categoryConfig, now, i)),
    withdrawalsThisMonth: withdrawals,
    corruptBanner: corrupt ? HOME_TEXT.corrupt : null,
  };
}
