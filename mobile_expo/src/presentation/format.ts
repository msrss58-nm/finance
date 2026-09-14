// Display formatting (pure). Dates are formatted here instead of with
// toLocaleDateString so the output never depends on the JS engine's Intl
// data: the Web's he-IL numeric form is "14.9.2026", the long form
// "5 בספטמבר". Amount strings come from core/currencyFormat (Web formatters,
// LTR-isolated for RTL text).

import { formatAmount, formatSignedAmount } from '../core/currencyFormat.ts';
import { parseLocalDateStr } from '../domain/dates.ts';

export { formatAmount, formatSignedAmount };

export const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'] as const;

export type Tone = 'positive' | 'negative' | 'neutral';

export function toneOf(n: number): Tone {
  return n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral';
}

/** he-IL numeric date: 14.9.2026 */
export function formatDate(d: Date): string {
  return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
}

/** he-IL day.month: 14.9 */
export function formatDayMonth(d: Date): string {
  return d.getDate() + '.' + (d.getMonth() + 1);
}

/** he-IL long day + month: "5 בספטמבר" */
export function formatDayLongMonth(d: Date): string {
  return d.getDate() + ' ב' + HEBREW_MONTHS[d.getMonth()];
}

/** A stored 'YYYY-MM-DD' shown as a local date, or '-' when it is not a date. */
export function formatDateStr(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '-';
  const d = parseLocalDateStr(value);
  return d && !isNaN(d.getTime()) ? formatDate(d) : '-';
}

/** The Forecast period label, like the Web's: "5 בספטמבר – 4 באוקטובר 2026" (a year on the start only across years). */
export function formatPeriodLabel(periodStart: Date, periodEnd: Date): string {
  const sameYear = periodStart.getFullYear() === periodEnd.getFullYear();
  return (
    formatDayLongMonth(periodStart) + (sameYear ? '' : ' ' + periodStart.getFullYear()) + ' – ' + formatDayLongMonth(periodEnd) + ' ' + periodEnd.getFullYear()
  );
}

/** "היום" / "מחר" / "בעוד N ימים" relative to today (both local dates). */
export function relativeDaysText(target: Date, today: Date): string {
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((a - b) / 86_400_000);
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === 2) return 'מחרתיים';
  return days > 0 ? 'בעוד ' + days + ' ימים' : 'לפני ' + -days + ' ימים';
}
