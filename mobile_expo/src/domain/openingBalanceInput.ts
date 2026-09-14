// Opening Balance form validation — app.js submitOpeningBalanceForm().
// The amount may be positive, zero OR negative (an overdrawn account is a real
// balance); an empty or non-numeric amount is refused — never defaulted to 0.

import { isValidDateStr } from './dates.ts';
import { sanitizeFiniteAmount } from './formInput.ts';

export const OPENING_BALANCE_MESSAGES = {
  amount: 'יש להזין סכום תקין (מספר בלבד)',
  date: 'יש להזין תאריך תקין',
} as const;

export type OpeningBalanceInput =
  | { readonly ok: true; readonly amount: number; readonly dateStr: string }
  | { readonly ok: false; readonly field: 'amount' | 'date'; readonly message: string };

export function validateOpeningBalanceInput(amountText: string, dateText: string): OpeningBalanceInput {
  const amount = sanitizeFiniteAmount(amountText);
  if (amount === null) return { ok: false, field: 'amount', message: OPENING_BALANCE_MESSAGES.amount };
  if (!isValidDateStr(dateText)) return { ok: false, field: 'date', message: OPENING_BALANCE_MESSAGES.date };
  return { ok: true, amount, dateStr: dateText };
}
