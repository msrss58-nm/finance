// Forecast screen view model (pure). Every figure comes from the Stage 2
// engine — buildProjectedBalanceMonthView() for the 5th→4th period (approved
// decision D), getNextCashflowEvent() for the next-event card, and the Web's
// two tracking cards. Nothing is recalculated here.
//
// Correction A: a day's expenses EXCLUDE cash withdrawals, which get their own
// figure and their own event tone. Days before the opening date are
// unavailable ("—"), never a computed or zero value. No 6-month view exists.

import { getFixedCreditCardTotals, getLoansRemainingSummary } from '../domain/aggregates.ts';
import { cashflowDateKey } from '../domain/dates.ts';
import { buildProjectedBalanceMonthView, getNextCashflowEvent, type PeriodDay } from '../domain/forecast.ts';
import { getProjectedBalanceOpeningConfig } from '../domain/settings.ts';
import type { FinanceSnapshot } from '../state/financeController.ts';
import { formatAmount, formatDate, formatDateStr, formatDayMonth, formatPeriodLabel, formatSignedAmount, toneOf, type Tone } from './format.ts';

export type ForecastEventRow = {
  readonly key: string;
  readonly title: string;
  readonly amountText: string;
  readonly kind: 'income' | 'expense' | 'withdrawal';
  /** Opening day only: already reflected in the opening amount, not applied again. */
  readonly includedInOpening: boolean;
};

export type ForecastDayRow = {
  readonly key: string;
  readonly dateText: string;
  readonly isToday: boolean;
  readonly availability: PeriodDay['availability'];
  readonly incomeText: string;
  readonly expensesText: string;
  /** null when there is no withdrawal that day (and on unavailable days). */
  readonly withdrawalsText: string | null;
  readonly netText: string;
  readonly balanceText: string;
  readonly balanceTone: Tone;
  readonly negative: boolean;
  readonly events: readonly ForecastEventRow[];
  /** Opening-day explanation of which events are already included. */
  readonly openingNote: string | null;
  readonly emptyNote: string | null;
};

export type ForecastChart =
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'bars';
      readonly totalDays: number;
      readonly points: readonly { readonly index: number; readonly value: number }[];
      readonly min: number;
      readonly max: number;
      readonly minText: string;
      readonly maxText: string;
      readonly firstLabel: string;
      readonly lastLabel: string;
      readonly summary: string;
    };

export type InsightCard = { readonly title: string; readonly value: string; readonly note: string };

export type ForecastView = {
  readonly nextEvent: { readonly valueText: string; readonly tone: Tone; readonly note: string };
  readonly periodLabel: string;
  readonly configured: boolean;
  readonly rows: readonly ForecastDayRow[];
  readonly chart: ForecastChart | null;
  readonly insights: readonly InsightCard[];
};

export const FORECAST_TEXT = {
  unconfigured: 'לא ניתן לחשב יתרה יומית לפני הגדרת יתרת התחלה.',
  basis: 'החישוב מבוסס על יתרת ההתחלה ועל התנועות המתוכננות באפליקציה. הוא אינו מחובר לחשבון הבנק.',
  unavailableRow: 'אין נתון לפני יתרת ההתחלה.',
  noEventsOpening: 'אין תנועות רשומות ביום יתרת ההתחלה.',
  noEvents: 'אין תנועות מתוכננות ביום זה.',
  allIncluded: 'התנועות הבאות כבר כלולות ביתרת ההתחלה ואינן מופחתות שוב:',
  someIncluded: 'חלק מהתנועות ביום זה כבר כלולות ביתרת ההתחלה (מסומנות); האחרות מופחתות עכשיו לראשונה.',
  noNextEvent: 'אין אירועים עתידיים',
  noNextEventNote: 'לא נמצאו אירועים בחודשיים הקרובים',
} as const;

function eventRows(day: PeriodDay): ForecastEventRow[] {
  return day.events.map((ev, i) => ({
    key: day.dateKey + ':' + i,
    title: typeof ev.title === 'string' ? ev.title : String(ev.title ?? ''),
    amountText: formatSignedAmount(ev.amount),
    kind: ev.amount >= 0 ? 'income' : ev.type === 'cashWithdrawal' ? 'withdrawal' : 'expense',
    includedInOpening: day.availability === 'opening' && ev.alreadyIncludedInOpeningSnapshot,
  }));
}

function dayRow(day: PeriodDay, todayKey: string): ForecastDayRow {
  const dateText = formatDayMonth(day.date);
  if (day.availability === 'unavailable') {
    return {
      key: day.dateKey,
      dateText,
      isToday: day.dateKey === todayKey,
      availability: 'unavailable',
      incomeText: '—',
      expensesText: '—',
      withdrawalsText: null,
      netText: '—',
      balanceText: '—',
      balanceTone: 'neutral',
      negative: false,
      events: [],
      openingNote: null,
      emptyNote: FORECAST_TEXT.unavailableRow,
    };
  }
  const isOpening = day.availability === 'opening';
  let openingNote: string | null = null;
  if (isOpening && day.events.length > 0) {
    const anyAlready = day.events.some((e) => e.alreadyIncludedInOpeningSnapshot);
    const anyNew = day.events.some((e) => !e.alreadyIncludedInOpeningSnapshot);
    if (anyAlready && !anyNew) openingNote = FORECAST_TEXT.allIncluded;
    else if (anyAlready && anyNew) openingNote = FORECAST_TEXT.someIncluded;
  }
  return {
    key: day.dateKey,
    dateText: dateText + (isOpening ? ' · יתרת התחלה' : ''),
    isToday: day.dateKey === todayKey,
    availability: day.availability,
    incomeText: day.income > 0 ? formatSignedAmount(day.income) : formatAmount(0),
    expensesText: day.expenses > 0 ? formatSignedAmount(-day.expenses) : formatAmount(0),
    withdrawalsText: day.withdrawals > 0 ? formatSignedAmount(-day.withdrawals) : null,
    netText: isOpening ? '—' : formatSignedAmount(day.net),
    balanceText: formatAmount(day.projectedBalance) + (day.projectedBalance < 0 ? ' ⚠' : ''),
    balanceTone: toneOf(day.projectedBalance),
    negative: day.projectedBalance < 0,
    events: eventRows(day),
    openingNote,
    emptyNote: day.events.length === 0 ? (isOpening ? FORECAST_TEXT.noEventsOpening : FORECAST_TEXT.noEvents) : null,
  };
}

export function buildForecastView(s: FinanceSnapshot): ForecastView {
  const { data, now } = s;
  const { items, categoryConfig } = data;

  const next = getNextCashflowEvent(items, now, categoryConfig);
  const nextEvent = next
    ? {
        valueText: formatSignedAmount(next.amount),
        tone: (next.amount >= 0 ? 'positive' : 'negative') as Tone,
        note: (typeof next.title === 'string' ? next.title : '') + ' · ' + formatDate(next.date),
      }
    : { valueText: FORECAST_TEXT.noNextEvent, tone: 'neutral' as Tone, note: FORECAST_TEXT.noNextEventNote };

  const opening = getProjectedBalanceOpeningConfig(data.settings);
  const view = buildProjectedBalanceMonthView(now, items, opening, categoryConfig);
  const periodLabel = formatPeriodLabel(view.periodStart, view.periodEnd);
  const todayKey = cashflowDateKey(now);
  const rows = view.configured ? view.days.map((d) => dayRow(d, todayKey)) : [];

  let chart: ForecastChart | null = null;
  if (view.configured) {
    const plottable = view.days.filter((d): d is Extract<PeriodDay, { availability: 'opening' | 'available' }> => d.availability !== 'unavailable');
    if (plottable.length === 0) {
      chart = { kind: 'empty', message: 'אין נתון להצגה בתקופה זו — יתרת ההתחלה חלה מתאריך ' + formatDateStr(view.openingDateStr) + '.' };
    } else {
      const values = plottable.map((d) => d.projectedBalance);
      const last = plottable[plottable.length - 1] as (typeof plottable)[number];
      const first = plottable[0] as (typeof plottable)[number];
      chart = {
        kind: 'bars',
        totalDays: view.totalDays,
        points: plottable.map((d) => ({ index: d.periodDayIndex, value: d.projectedBalance })),
        min: Math.min(...values),
        max: Math.max(...values),
        minText: formatAmount(Math.min(...values)),
        maxText: formatAmount(Math.max(...values)),
        firstLabel: formatDayMonth(first.date),
        lastLabel: formatDayMonth(last.date),
        summary:
          'יתרה יומית צפויה (' +
          periodLabel +
          '): בסוף הטווח המוצג ' +
          formatAmount(last.projectedBalance) +
          '. החישוב מבוסס על יתרת ההתחלה ועל התנועות המתוכננות באפליקציה, הוא אינו מחובר לחשבון הבנק.',
      };
    }
  }

  const creditTotal = getFixedCreditCardTotals(items, now);
  const loans = getLoansRemainingSummary(items, now);
  const insights: InsightCard[] = [
    {
      title: 'סך חיובי כרטיס אשראי החודש',
      value: formatAmount(creditTotal),
      note: creditTotal > 0 ? 'סך חיובי כרטיס האשראי מהוצאות קבועות עומד על ' + formatAmount(creditTotal) + '.' : 'אין כרגע הוצאות קבועות המחויבות בכרטיס אשראי.',
    },
    {
      title: 'יתרת הלוואות שנותרו',
      value: formatAmount(loans.totalRemaining),
      note:
        loans.loanCount > 0
          ? 'נותרו לך ' + formatAmount(loans.totalRemaining) + ' בסך הכול ב-' + loans.loanCount + ' הלוואות פעילות.'
          : 'אין לך כרגע הלוואות פעילות.',
    },
  ];

  return { nextEvent, periodLabel, configured: view.configured, rows, chart, insights };
}
