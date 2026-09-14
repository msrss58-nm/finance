// Category management — app.js addPreviewCategory(), renamePreviewCategory()
// + submitPreviewEditCategory() (label and optional default day),
// deletePreviewCategory(), and their helpers, over the resolved category
// config object (the stored object with missing defaults backfilled, which is
// exactly what the Web serialises on save).
//
// Deletion rules are the Web's, including the preserved legacy gap (approved
// decision E): only income/fixed/variable/loan are protected, so the built-in
// 'dated' category is deletable while no item uses it. A category that still
// has items — active OR archived — is never deleted and its items are never
// touched.

import type { ActivityEntryInput } from './activityLog.ts';
import { BUILTIN_PROTECTED_CATEGORY_KEYS, type CategoryConfig } from './categoryConfig.ts';
import { checkDayInput } from './formInput.ts';
import { isPlainObject, type RawItem } from './raw.ts';

export type CustomCategoryBaseType = 'fixed' | 'variable' | 'income' | 'dated';

/** app.js PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS ('loan' deliberately absent). */
export const CUSTOM_CATEGORY_TYPE_OPTIONS: readonly { readonly value: CustomCategoryBaseType; readonly label: string }[] = [
  { value: 'fixed', label: 'הוצאה קבועה (סכום קבוע חודשי/שנתי)' },
  { value: 'variable', label: 'עסקה בתשלומים — מעקב יתרה בלבד (אינו מופחת שוב בתחזית)' },
  { value: 'income', label: 'הכנסה (מוסיף לתזרים הפנוי)' },
  { value: 'dated', label: 'חיוב חד-פעמי (תאריך וסכום בלבד, למשל כרטיס אשראי)' },
];

export const CATEGORY_MESSAGES = {
  titleRequired: 'נא להזין שם לקטגוריה',
  invalidType: 'יש לבחור סוג קטגוריה',
  notFound: 'הקטגוריה לא נמצאה',
  malformed: 'רשומת הקטגוריה אינה תקינה ולא ניתן לערוך אותה',
  builtIn: 'לא ניתן למחוק קטגוריה מובנית.',
  hasItems: 'לא ניתן למחוק קטגוריה זו — קיימות לה תנועות (כולל בארכיון). יש להעביר או למחוק את התנועות תחילה.',
} as const;

/** app.js translateBaseType(). */
export function translateBaseType(bt: unknown): string {
  if (bt === 'income') return 'הכנסה';
  if (bt === 'fixed') return 'קבוע';
  if (bt === 'variable') return 'תשלומים';
  if (bt === 'dated') return 'חיוב חד-פעמי';
  return '';
}

const EMOJI_RULES: readonly { readonly emoji: string; readonly words: readonly string[] }[] = [
  { emoji: '💳', words: ['כרטיס אשראי', 'אשראי', 'כרטיס'] },
  { emoji: '🚗', words: ['רכב', 'מכונית', 'דלק', 'חניה', 'טסט'] },
  { emoji: '🏠', words: ['דירה', 'שכירות', 'משכנתא', 'בית', 'ועד בית'] },
  { emoji: '🍔', words: ['אוכל', 'מזון', 'סופר', 'מכולת', 'מסעדה', 'משלוחים'] },
  { emoji: '🏥', words: ['בריאות', 'רופא', 'תרופות', 'קופת חולים', 'שיניים'] },
  { emoji: '🎓', words: ['חינוך', 'לימודים', 'בית ספר', 'אוניברסיטה', 'קורס', 'גן'] },
  { emoji: '✈️', words: ['טיול', 'טיולים', 'חופשה', 'נסיעה', 'חול'] },
  { emoji: '🎬', words: ['בידור', 'סרטים', 'קולנוע', 'נטפליקס', 'סטרימינג', 'תיאטרון'] },
  { emoji: '🏋️', words: ['ספורט', 'חדר כושר', 'מכון כושר', 'אימון'] },
  { emoji: '👕', words: ['ביגוד', 'בגדים', 'נעליים', 'אופנה'] },
  { emoji: '💰', words: ['חיסכון', 'השקעות', 'פנסיה', 'קרן'] },
  { emoji: '📱', words: ['טלפון', 'סלולר', 'אינטרנט', 'תקשורת'] },
  { emoji: '💡', words: ['חשמל', 'מים', 'ארנונה', 'גז'] },
  { emoji: '🛡️', words: ['ביטוח'] },
  { emoji: '🎁', words: ['מתנות', 'מתנה'] },
  { emoji: '🐾', words: ['חיות', 'כלב', 'חתול', 'וטרינר'] },
  { emoji: '☕', words: ['קפה'] },
];

/** app.js pickEmojiForCategory() — same keyword rules and fallbacks. */
export function pickEmojiForCategory(title: string, baseType: unknown): string {
  for (const rule of EMOJI_RULES) {
    for (const word of rule.words) if (title.indexOf(word) !== -1) return rule.emoji;
  }
  if (baseType === 'income') return '💰';
  if (baseType === 'variable') return '🛍️';
  if (baseType === 'loan') return '🏦';
  if (baseType === 'dated') return '💳';
  return '🏷️';
}

/** app.js getCategoryDefaultDayFieldLabel(): null = no default-day field (dated). */
export function getCategoryDefaultDayFieldLabel(baseType: unknown): string | null {
  if (baseType === 'dated') return null;
  if (baseType === 'income') return 'יום כניסה ברירת מחדל';
  return 'יום ירידה ברירת מחדל';
}

/** The displayed label: the stored label when it is a non-empty string, else the key. */
export function categoryLabel(categoryConfig: CategoryConfig, key: string): string {
  const cfg = categoryConfig[key];
  return isPlainObject(cfg) && typeof cfg.label === 'string' && cfg.label ? cfg.label : key;
}

export function categoryBaseType(categoryConfig: CategoryConfig, key: string): unknown {
  const cfg = categoryConfig[key];
  return isPlainObject(cfg) ? cfg.baseType : undefined;
}

export function isBuiltInCategoryKey(key: string): boolean {
  return BUILTIN_PROTECTED_CATEGORY_KEYS.indexOf(key) !== -1;
}

/** app.js categoryHasPreviewItems(): includes archived items. */
export function categoryHasItems(items: readonly RawItem[], key: string): boolean {
  return items.some((i) => isPlainObject(i) && i.displayCategory === key);
}

/** The stored default day when it is a valid 1–31 number, else '' (the edit form's pre-fill). */
export function categoryDefaultDayText(categoryConfig: CategoryConfig, key: string): string {
  const cfg = categoryConfig[key];
  const d = isPlainObject(cfg) ? cfg.defaultDayOfMonth : undefined;
  return typeof d === 'number' && d >= 1 && d <= 31 ? String(d) : '';
}

export type CategoryWriteResult =
  | { readonly ok: true; readonly categoryConfig: Record<string, unknown>; readonly key: string; readonly activity: readonly ActivityEntryInput[] }
  | { readonly ok: false; readonly field: 'title' | 'baseType' | 'day' | null; readonly message: string };

/** app.js addPreviewCategory() + submitPreviewAddCategory(). */
export function addCategory(
  categoryConfig: CategoryConfig,
  title: string,
  baseType: string,
  dayText: string,
  nowMs: number,
): CategoryWriteResult {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, field: 'title', message: CATEGORY_MESSAGES.titleRequired };
  if (!CUSTOM_CATEGORY_TYPE_OPTIONS.some((o) => o.value === baseType)) return { ok: false, field: 'baseType', message: CATEGORY_MESSAGES.invalidType };
  let defaultDay: number | null = null;
  if (baseType !== 'dated') {
    const day = checkDayInput(dayText);
    if (!day.ok) return { ok: false, field: 'day', message: day.message };
    defaultDay = day.day;
  }

  const ts = Math.floor(nowMs);
  let newKey = 'custom_' + ts;
  let suffix = 1;
  while (categoryConfig[newKey] !== undefined) {
    newKey = 'custom_' + ts + '_' + suffix;
    suffix++;
  }
  const label = pickEmojiForCategory(trimmedTitle, baseType) + ' ' + trimmedTitle;
  const entry: Record<string, unknown> = { label, baseType };
  if (defaultDay !== null) entry.defaultDayOfMonth = defaultDay;
  return {
    ok: true,
    categoryConfig: { ...categoryConfig, [newKey]: entry },
    key: newKey,
    activity: [{ action: 'category_created', detail: label }],
  };
}

/**
 * app.js submitPreviewEditCategory(): rename (built-in or custom) and, when
 * the category has a default-day field (not 'dated'), set or clear it.
 * `dayText` null = no day field shown. Existing items keep their own day.
 */
export function editCategory(categoryConfig: CategoryConfig, key: string, labelText: string, dayText: string | null): CategoryWriteResult {
  const current = categoryConfig[key];
  if (current === undefined) return { ok: false, field: null, message: CATEGORY_MESSAGES.notFound };
  if (!isPlainObject(current)) return { ok: false, field: null, message: CATEGORY_MESSAGES.malformed };
  let nextDay: number | null = null;
  const hasDayField = dayText !== null && getCategoryDefaultDayFieldLabel(current.baseType) !== null;
  if (hasDayField) {
    const day = checkDayInput(dayText);
    if (!day.ok) return { ok: false, field: 'day', message: day.message };
    nextDay = day.day;
  }
  const trimmed = labelText.trim();
  if (!trimmed) return { ok: false, field: 'title', message: CATEGORY_MESSAGES.titleRequired };

  const previousDay = current.defaultDayOfMonth;
  const next: Record<string, unknown> = { ...current };
  next.label = trimmed;
  const activity: ActivityEntryInput[] = [{ action: 'category_renamed', detail: key + ' → ' + trimmed }];
  if (hasDayField) {
    if (nextDay === null) delete next.defaultDayOfMonth;
    else next.defaultDayOfMonth = nextDay;
    if (previousDay !== next.defaultDayOfMonth) {
      activity.push({ action: 'default_day_changed', detail: key + ' → ' + String(next.defaultDayOfMonth || 'ללא') });
    }
  }
  return { ok: true, categoryConfig: { ...categoryConfig, [key]: next }, key, activity };
}

export type CategoryDeleteResult =
  | { readonly ok: true; readonly categoryConfig: Record<string, unknown>; readonly activity: readonly ActivityEntryInput[] }
  | { readonly ok: false; readonly reason: 'notFound' | 'builtIn' | 'hasItems'; readonly message: string };

/** app.js deletePreviewCategory(). */
export function deleteCategory(categoryConfig: CategoryConfig, items: readonly RawItem[], key: string): CategoryDeleteResult {
  if (categoryConfig[key] === undefined) return { ok: false, reason: 'notFound', message: CATEGORY_MESSAGES.notFound };
  if (isBuiltInCategoryKey(key)) return { ok: false, reason: 'builtIn', message: CATEGORY_MESSAGES.builtIn };
  if (categoryHasItems(items, key)) return { ok: false, reason: 'hasItems', message: CATEGORY_MESSAGES.hasItems };
  const deletedLabel = categoryLabel(categoryConfig, key);
  const rest: Record<string, unknown> = {};
  for (const k in categoryConfig) if (k !== key) rest[k] = categoryConfig[k];
  return { ok: true, categoryConfig: rest, activity: [{ action: 'category_deleted', detail: deletedLabel }] };
}
