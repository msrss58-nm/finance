// Form-input parsing shared by every write flow.
//
// The Web forms read <input type="number"> values: the browser hands app.js
// either a valid number string or '' (it refuses anything else). React Native
// text fields have no such filter, so numberInputValue() applies the same rule
// before any parseFloat — "1,5" or "12abc" never silently become 1 or 12.
// The amount sanitizers are app.js sanitizePositiveAmount /
// sanitizeNonNegativeAmount / sanitizeFiniteAmount, applied to that value.

import { round2 } from './numbers.ts';

const NUMBER_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** What an HTML number input would give app.js for this text: the text itself when it is a number, else ''. */
export function numberInputValue(text: string): string {
  const t = text.trim();
  return NUMBER_TEXT.test(t) ? t : '';
}

/** parseFloat(input.value) — NaN when the field is empty or not a number. */
export function parseAmountInput(text: string): number {
  return parseFloat(numberInputValue(text));
}

/** app.js sanitizePositiveAmount(): > 0, finite, rounded to 2 decimals; null otherwise (never NaN). */
export function sanitizePositiveAmount(text: string): number | null {
  const n = parseAmountInput(text);
  if (!isFinite(n) || n <= 0) return null;
  return round2(n);
}

/** app.js sanitizeNonNegativeAmount(): 0 is valid, negative is not. */
export function sanitizeNonNegativeAmount(text: string): number | null {
  const n = parseAmountInput(text);
  if (!isFinite(n) || n < 0) return null;
  return round2(n);
}

/** app.js sanitizeFiniteAmount(): any sign (an overdrawn opening balance is legitimate); empty is null, never 0. */
export function sanitizeFiniteAmount(text: string): number | null {
  const n = parseAmountInput(text);
  if (!isFinite(n)) return null;
  return round2(n);
}

export const DAY_INPUT_MESSAGE = 'נא להזין יום בין 1 ל-31, או להשאיר את השדה ריק';

export type DayInput = { readonly ok: true; readonly value: string; readonly day: number | null } | { readonly ok: false; readonly message: string };

/**
 * A day-of-month field. Empty is allowed (the item then falls back to the
 * category default, then 1 — resolveEffectiveDay()). A value must be a whole
 * 1–31: the Web accepts any number here and silently falls back at read time,
 * so refusing garbage up front changes no result.
 */
export function checkDayInput(text: string): DayInput {
  const t = text.trim();
  if (t === '') return { ok: true, value: '', day: null };
  if (!/^\d{1,2}$/.test(t)) return { ok: false, message: DAY_INPUT_MESSAGE };
  const n = parseInt(t, 10);
  if (n < 1 || n > 31) return { ok: false, message: DAY_INPUT_MESSAGE };
  return { ok: true, value: String(n), day: n };
}
