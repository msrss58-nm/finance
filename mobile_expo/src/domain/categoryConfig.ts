// family_finance_cat_config — ported from app.js.

import { isPlainObject } from './raw.ts';

export type CategoryConfig = Readonly<Record<string, unknown>>;

/** app.js DEFAULT_CATEGORY_CONFIG_JSON, byte-identical key order and labels. */
export const DEFAULT_CATEGORY_CONFIG_JSON = JSON.stringify({
  income: { label: '💰 הכנסות', baseType: 'income' },
  fixed: { label: '🏡 הוצאות קבועות', baseType: 'fixed' },
  variable: { label: '🛒 תשלומים שונים', baseType: 'variable' },
  loan: { label: '🏦 הלוואות', baseType: 'loan' },
  dated: { label: '💳 חיוב כרטיס אשראי', baseType: 'dated' },
});

/**
 * app.js PREVIEW_BUILTIN_CATEGORY_KEYS — the keys protected from deletion.
 * LEGACY BEHAVIOR PRESERVED ON PURPOSE (approved decision E): the built-in
 * 'dated' category is NOT in this list, so it is not deletion-protected in the
 * Web app. Do not "fix" this here.
 */
export const BUILTIN_PROTECTED_CATEGORY_KEYS: readonly string[] = ['income', 'fixed', 'variable', 'loan'];

/**
 * app.js loadPreviewCategoryConfig(): corrupt/missing/non-object -> defaults;
 * otherwise the stored object with any ABSENT default key backfilled in memory
 * (never overwriting an existing key). Never writes.
 */
export function resolveCategoryConfig(raw: string | null): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw as string);
  } catch {
    parsed = null;
  }
  let defaults: Record<string, unknown>;
  try {
    defaults = JSON.parse(DEFAULT_CATEGORY_CONFIG_JSON) as Record<string, unknown>;
  } catch {
    defaults = {};
  }
  if (!isPlainObject(parsed)) return defaults;
  for (const dk in defaults) {
    if (parsed[dk] === undefined) parsed[dk] = defaults[dk];
  }
  return parsed;
}
