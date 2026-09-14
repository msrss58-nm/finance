// Goals reminder dialog view model (pure) — app.js renderGoalsReminderOverlay()
// and updateReminderCustomAmount(). Amounts come from the snapshot taken when
// the dialog opened (getGoalsDueForReminder); nothing is recalculated.

import { numberInputValue } from '../domain/formInput.ts';
import { round2 } from '../domain/numbers.ts';
import type { ReminderDue } from '../state/goalsReminderSession.ts';
import { formatAmount } from './format.ts';

export type ReminderSummaryRow = {
  readonly goalId: string;
  readonly title: string;
  readonly amountText: string;
  readonly overdueText: string | null;
  readonly remainingAfterText: string;
};

export function buildReminderSummary(due: readonly ReminderDue[]): { readonly rows: readonly ReminderSummaryRow[]; readonly totalText: string } {
  let total = 0;
  const rows = due.map((d) => {
    total = round2(total + d.info.suggestedTotal);
    return {
      goalId: d.goal.id,
      title: d.goal.title,
      amountText: formatAmount(d.info.suggestedTotal),
      overdueText: d.info.overdueAmount > 0 ? 'מתוכם ' + formatAmount(d.info.overdueAmount) + ' באיחור' : null,
      remainingAfterText: 'נותר לאחר ההעברה: ' + formatAmount(d.info.remainingAfterSuggested),
    };
  });
  return { rows, totalText: formatAmount(total) };
}

export type ReminderCustomRow = {
  readonly goalId: string;
  readonly title: string;
  readonly remainingText: string;
  readonly text: string;
  /** Entered amount is higher than what this goal still needs (a warning, not an error). */
  readonly overRemaining: boolean;
  readonly invalid: boolean;
};

export function buildReminderCustom(
  due: readonly ReminderDue[],
  custom: Readonly<Record<string, string>>,
): { readonly rows: readonly ReminderCustomRow[]; readonly totalText: string } {
  let total = 0;
  const rows = due.map((d) => {
    const text = custom[d.goal.id] ?? String(d.info.suggestedTotal);
    const n = parseFloat(numberInputValue(text));
    if (isFinite(n) && n > 0) total = round2(total + n);
    return {
      goalId: d.goal.id,
      title: d.goal.title,
      remainingText: 'נותר ביעד: ' + formatAmount(d.info.remaining),
      text,
      overRemaining: isFinite(n) && n > d.info.remaining,
      invalid: text.trim() !== '' && (!isFinite(n) || n < 0),
    };
  });
  return { rows, totalText: formatAmount(total) };
}
